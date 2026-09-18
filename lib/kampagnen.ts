import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { renderPlatzhalter } from "./funnel";

// Filterkriterien fuer Kampagnen & gespeicherte Filtergruppen (teilnehmer_segmente).
// Werden bei jeder Nutzung live gegen den aktuellen Teilnehmerbestand ausgewertet
// -- kein Snapshot. Leere/fehlende Kriterien = keine Einschraenkung auf dieser Dimension.
export type FilterKriterien = {
  anrede?: string[];
  rolle?: string[];
  seminartypen?: string[]; // Seminartyp-Namen, z.B. "Preisfindung"
  unternehmer_status?: string[]; // 'unternehmer' | 'mitarbeiter' | 'unbekannt' -- berufliche Position, unabhaengig von "rolle" (Event-Funktion)
};

export type GefilterterTeilnehmer = {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  anrede: string;
  rolle: string;
  unternehmer_status: string;
  seminare: string[];
};

export function leereFilterKriterien(): FilterKriterien {
  return { anrede: [], rolle: [], seminartypen: [] };
}

export function filterIstLeer(filter: FilterKriterien): boolean {
  return !filter.anrede?.length && !filter.rolle?.length && !filter.seminartypen?.length;
}

/**
 * Laedt alle Teilnehmer, die zum Filter passen. Abgemeldete (marketing_consent_status
 * = 'abgemeldet') werden immer ausgeschlossen -- unabhaengig vom Filter, gleiche Regel
 * wie beim Funnel-Versand (siehe lib/funnel.ts).
 */
export async function ladeTeilnehmerFuerFilter(filter: FilterKriterien): Promise<GefilterterTeilnehmer[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("teilnehmer")
    .select(
      "id, vorname, nachname, email, anrede, rolle, unternehmer_status, marketing_consent_status, deaktiviert_am, buchungspositionen(seminartermine(seminartypen(name))), legacy_buchungen(seminartypen(name))"
    )
    .order("nachname", { ascending: true });

  const alle: GefilterterTeilnehmer[] = (data || [])
    .filter((t: any) => t.marketing_consent_status !== "abgemeldet" && !t.deaktiviert_am && t.email)
    .map((t: any) => {
      const seminare = Array.from(
        new Set(
          [
            ...(t.buchungspositionen || []).map((p: any) => p.seminartermine?.seminartypen?.name),
            ...(t.legacy_buchungen || []).map((l: any) => l.seminartypen?.name),
          ].filter(Boolean)
        )
      ) as string[];
      return {
        id: t.id,
        vorname: t.vorname,
        nachname: t.nachname,
        email: t.email,
        anrede: t.anrede || "keine_angabe",
        rolle: t.rolle || "teilnehmer",
        unternehmer_status: t.unternehmer_status || "unbekannt",
        seminare,
      };
    });

  return alle.filter((t) => {
    if (filter.anrede?.length && !filter.anrede.includes(t.anrede)) return false;
    if (filter.rolle?.length && !filter.rolle.includes(t.rolle)) return false;
    if (filter.unternehmer_status?.length && !filter.unternehmer_status.includes(t.unternehmer_status)) return false;
    if (filter.seminartypen?.length && !t.seminare.some((s) => filter.seminartypen!.includes(s))) return false;
    return true;
  });
}

export type KampagnenEmpfaenger = GefilterterTeilnehmer & {
  betreff: string;
  inhaltHtml: string;
  /** Letzte Funnel- oder Kampagnen-Mail an diese Adresse (View letzte_marketing_mail_pro_email) */
  letzteMarketingMailAm: string | null;
  /** true = letzte Mail liegt weniger als kampagnen.mindestabstand_tage zurueck */
  inSperrfrist: boolean;
};

const TAG_MS = 86_400_000;

// Frequency-Capping: letzte Marketing-Mail pro Adresse. Abfrage in Paketen,
// weil .in() sonst bei hunderten Adressen die URL-Laenge sprengt; Vergleich
// ohne Gross-/Kleinschreibung, da die Logs die Adresse so speichern, wie sie
// beim Versand im Teilnehmer stand.
async function ladeLetzteMarketingMails(supabase: any, emails: string[]): Promise<Map<string, string>> {
  const ergebnis = new Map<string, string>();
  const varianten = Array.from(new Set(emails.flatMap((e) => [e, e.trim().toLowerCase()])));
  for (let i = 0; i < varianten.length; i += 100) {
    const { data, error } = await supabase
      .from("letzte_marketing_mail_pro_email")
      .select("email, letzte_marketing_mail_am")
      .in("email", varianten.slice(i, i + 100));
    if (error) throw new Error(`Sperrfrist-Pruefung fehlgeschlagen: ${error.message}`);
    for (const z of data || []) {
      const key = String(z.email).trim().toLowerCase();
      const bisher = ergebnis.get(key);
      if (!bisher || z.letzte_marketing_mail_am > bisher) ergebnis.set(key, z.letzte_marketing_mail_am);
    }
  }
  return ergebnis;
}

/**
 * Ermittelt die tatsaechlichen Empfaenger einer Kampagne (Filter live ausgewertet)
 * und rendert Betreff/Inhalt mit den Platzhaltern. Bereits ueber diese Kampagne
 * verschickte Empfaenger werden nicht erneut aufgefuehrt (Dopplungsschutz, falls
 * die Vorschau-Seite mehrfach aufgerufen oder neu geladen wird).
 */
export async function ermittleKampagnenEmpfaenger(
  kampagneId: string
): Promise<{
  kampagne: { id: string; name: string; betreff: string; inhalt: string; status: string; mindestabstand_tage: number };
  empfaenger: KampagnenEmpfaenger[];
}> {
  const supabase = getSupabaseAdmin();
  const { data: kampagne } = await supabase.from("kampagnen").select("*").eq("id", kampagneId).single();
  if (!kampagne) throw new Error("Kampagne nicht gefunden.");

  const teilnehmer = await ladeTeilnehmerFuerFilter((kampagne.filter_kriterien || {}) as FilterKriterien);

  const { data: bereitsVersendet } = await supabase
    .from("kampagnen_versand_log")
    .select("empfaenger_email")
    .eq("kampagne_id", kampagneId)
    .eq("status", "gesendet");
  const bereitsVersendetSet = new Set((bereitsVersendet || []).map((r: any) => r.empfaenger_email));

  const offen = teilnehmer.filter((t) => !bereitsVersendetSet.has(t.email));
  const letzteMails = await ladeLetzteMarketingMails(supabase, offen.map((t) => t.email));
  const abstandMs = Math.max(0, Number(kampagne.mindestabstand_tage ?? 4)) * TAG_MS;
  const jetzt = Date.now();

  const empfaenger: KampagnenEmpfaenger[] = offen
    .map((t) => {
      const letzte = letzteMails.get(t.email.trim().toLowerCase()) || null;
      return {
        ...t,
        letzteMarketingMailAm: letzte,
        inSperrfrist: !!letzte && abstandMs > 0 && jetzt - Date.parse(letzte) < abstandMs,
      };
    })
    .map((t) => ({
      ...t,
      betreff: renderPlatzhalter(kampagne.betreff, { vorname: t.vorname, nachname: t.nachname }),
      inhaltHtml: renderPlatzhalter(kampagne.inhalt, { vorname: t.vorname, nachname: t.nachname }).replace(/\n/g, "<br/>"),
    }));

  return { kampagne, empfaenger };
}

/**
 * Verschickt eine Kampagne jetzt tatsaechlich an alle aktuell fälligen Empfaenger
 * (siehe ermittleKampagnenEmpfaenger) und protokolliert jeden Versand in
 * kampagnen_versand_log -- Tracking (Zustellung/Oeffnung/Klick) laeuft ueber
 * denselben Resend-Webhook wie bei Funnel-Mails (app/api/webhooks/resend/route.ts).
 */
export async function sendeKampagneJetzt(
  kampagneId: string,
  trotzSperrfrist = false
): Promise<{ gesendet: number; fehler: number; uebersprungen: number }> {
  const supabase = getSupabaseAdmin();
  const { kampagne, empfaenger } = await ermittleKampagnenEmpfaenger(kampagneId);

  let gesendet = 0;
  let fehler = 0;
  let uebersprungen = 0;

  for (const e of empfaenger) {
    // Innerhalb der Sperrfrist: nicht schicken, aber protokollieren -- damit
    // spaeter nachvollziehbar ist, wer warum diese Kampagne nicht bekommen hat.
    if (e.inSperrfrist && !trotzSperrfrist) {
      await supabase.from("kampagnen_versand_log").insert({
        kampagne_id: kampagneId,
        teilnehmer_id: e.id,
        empfaenger_email: e.email,
        status: "uebersprungen_frequency_cap",
        fehlermeldung: `Letzte Marketing-Mail am ${new Date(e.letzteMarketingMailAm!).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}, Mindestabstand ${kampagne.mindestabstand_tage} Tage`,
      });
      uebersprungen++;
      continue;
    }

    let status: "gesendet" | "fehler" = "gesendet";
    let fehlermeldung: string | null = null;
    let resendEmailId: string | null = null;
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: ABSENDER,
        to: [e.email],
        subject: e.betreff,
        html: e.inhaltHtml,
      });
      if (error) {
        status = "fehler";
        fehlermeldung = error.message;
      } else {
        resendEmailId = data?.id || null;
      }
    } catch (err: any) {
      status = "fehler";
      fehlermeldung = err?.message || "Unbekannter Fehler beim Versand.";
    }

    await supabase.from("kampagnen_versand_log").insert({
      kampagne_id: kampagneId,
      teilnehmer_id: e.id,
      empfaenger_email: e.email,
      status,
      fehlermeldung,
      resend_email_id: resendEmailId,
    });

    if (status === "gesendet") gesendet++;
    else fehler++;
  }

  await supabase
    .from("kampagnen")
    .update({ status: "versendet", versendet_am: new Date().toISOString() })
    .eq("id", kampagneId);

  return { gesendet, fehler, uebersprungen };
}
