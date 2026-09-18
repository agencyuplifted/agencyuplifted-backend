import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { renderPlatzhalter } from "./funnel";
import { ladeBausteine, baueMailHtml, abmeldeUrl, abmeldeHeader } from "./mail-bausteine";

// Filterkriterien fuer Kampagnen & gespeicherte Filtergruppen (teilnehmer_segmente).
// Werden bei jeder Nutzung live gegen den aktuellen Teilnehmerbestand ausgewertet
// -- kein Snapshot. Leere/fehlende Kriterien = keine Einschraenkung auf dieser Dimension.
export type FilterKriterien = {
  anrede?: string[];
  rolle?: string[];
  seminartypen?: string[]; // Seminartyp-Namen, z.B. "Preisfindung"
  unternehmer_status?: string[]; // 'unternehmer' | 'mitarbeiter' | 'unbekannt' -- berufliche Position, unabhaengig von "rolle" (Event-Funktion)
  // Zweites Seminar-Kriterium, z. B. "war in Preisfindung, aber noch NICHT in Fuehrung".
  // Quelle: View teilnehmer_seminar_besuche, nur stand = 'besucht'.
  kategorie2?: string;
  kategorie2_modus?: "besucht" | "nicht_besucht";
  teilnahme_stand?: string[]; // 'erstteilnehmer' | 'wiederholer' | 'kein_seminar_besucht' (View teilnehmer_lifecycle_stage)
  netzwerk_mitglied?: "ja" | "nein";
  tags?: string[]; // tags.id -- Person muss ALLE gewaehlten Tags haben
};

export const TEILNAHME_STAND_LABEL: Record<string, string> = {
  erstteilnehmer: "Erstteilnehmer",
  wiederholer: "Wiederholer",
  kein_seminar_besucht: "Kein Seminar besucht",
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
  /** Grobe Heuristik aus teilnehmer_lifecycle_stage -- nur Info, kein Ausschluss */
  vermutlichRuhend: boolean;
};

// PostgREST liefert standardmaessig hoechstens 1000 Zeilen -- Views/Tabellen,
// die mit dem Teilnehmerbestand wachsen, deshalb seitenweise laden.
async function ladeAlleZeilen(abfrage: (von: number, bis: number) => any): Promise<any[]> {
  const alle: any[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await abfrage(von, von + 999);
    if (error) throw new Error(error.message);
    alle.push(...(data || []));
    if (!data || data.length < 1000) return alle;
  }
}

export function leereFilterKriterien(): FilterKriterien {
  return { anrede: [], rolle: [], seminartypen: [] };
}

export function filterIstLeer(filter: FilterKriterien): boolean {
  return (
    !filter.anrede?.length &&
    !filter.rolle?.length &&
    !filter.seminartypen?.length &&
    !filter.unternehmer_status?.length &&
    !filter.kategorie2 &&
    !filter.teilnahme_stand?.length &&
    !filter.netzwerk_mitglied &&
    !filter.tags?.length
  );
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

  const [lifecycle, besuche, tagZuordnungen] = await Promise.all([
    ladeAlleZeilen((von, bis) =>
      supabase.from("teilnehmer_lifecycle_stage").select("teilnehmer_id, teilnahme_stand, netzwerk_mitglied, vermutlich_ruhend").range(von, bis)
    ),
    filter.kategorie2
      ? ladeAlleZeilen((von, bis) =>
          supabase.from("teilnehmer_seminar_besuche").select("teilnehmer_id").eq("stand", "besucht").eq("seminarkategorie", filter.kategorie2).range(von, bis)
        )
      : Promise.resolve([]),
    filter.tags?.length
      ? ladeAlleZeilen((von, bis) => supabase.from("teilnehmer_tags").select("teilnehmer_id, tag_id").in("tag_id", filter.tags!).range(von, bis))
      : Promise.resolve([]),
  ]);
  const lifecycleMap = new Map(lifecycle.map((l: any) => [l.teilnehmer_id, l]));
  const besuchtKategorie2 = new Set(besuche.map((b: any) => b.teilnehmer_id));
  const tagsProTeilnehmer = new Map<string, Set<string>>();
  for (const z of tagZuordnungen) {
    if (!tagsProTeilnehmer.has(z.teilnehmer_id)) tagsProTeilnehmer.set(z.teilnehmer_id, new Set());
    tagsProTeilnehmer.get(z.teilnehmer_id)!.add(z.tag_id);
  }

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
        vermutlichRuhend: !!lifecycleMap.get(t.id)?.vermutlich_ruhend,
      };
    });

  return alle.filter((t) => {
    if (filter.anrede?.length && !filter.anrede.includes(t.anrede)) return false;
    if (filter.rolle?.length && !filter.rolle.includes(t.rolle)) return false;
    if (filter.unternehmer_status?.length && !filter.unternehmer_status.includes(t.unternehmer_status)) return false;
    if (filter.seminartypen?.length && !t.seminare.some((s) => filter.seminartypen!.includes(s))) return false;
    if (filter.kategorie2) {
      const war = besuchtKategorie2.has(t.id);
      if (filter.kategorie2_modus === "nicht_besucht" ? war : !war) return false;
    }
    const lc: any = lifecycleMap.get(t.id);
    if (filter.teilnahme_stand?.length && !filter.teilnahme_stand.includes(lc?.teilnahme_stand || "kein_seminar_besucht")) return false;
    if (filter.netzwerk_mitglied && (filter.netzwerk_mitglied === "ja") !== !!lc?.netzwerk_mitglied) return false;
    if (filter.tags?.length) {
      const hat = tagsProTeilnehmer.get(t.id);
      if (!hat || !filter.tags.every((id) => hat.has(id))) return false;
    }
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

const ANREDE_TEXT: Record<string, string> = { Frau: "Frauen", Herr: "Männer", Divers: "Divers", keine_angabe: "Ohne Anrede" };
const ROLLE_TEXT: Record<string, string> = { teilnehmer: "Teilnehmer", mitarbeiter: "Mitarbeiter", gastreferent: "Gastreferenten", organisator: "Organisatoren" };
const UNTERNEHMER_TEXT: Record<string, string> = { unternehmer: "Unternehmer:innen", mitarbeiter: "Mitarbeiter:innen", unbekannt: "Position unbekannt" };

/** Kurzbeschreibung eines Filters fuer Listen, z. B. ["Frauen", "Preisfindung", "nicht Führung"] */
export function beschreibeFilter(filter: FilterKriterien, tagLabel: Map<string, string> = new Map()): string[] {
  const teile: string[] = [];
  filter.anrede?.forEach((a) => teile.push(ANREDE_TEXT[a] || a));
  filter.unternehmer_status?.forEach((u) => teile.push(UNTERNEHMER_TEXT[u] || u));
  filter.rolle?.forEach((r) => teile.push(ROLLE_TEXT[r] || r));
  filter.seminartypen?.forEach((k) => teile.push(k));
  if (filter.kategorie2) teile.push(filter.kategorie2_modus === "nicht_besucht" ? `nicht ${filter.kategorie2}` : `+ ${filter.kategorie2}`);
  filter.teilnahme_stand?.forEach((t) => teile.push(TEILNAHME_STAND_LABEL[t] || t));
  if (filter.netzwerk_mitglied) teile.push(filter.netzwerk_mitglied === "ja" ? "Netzwerk-Mitglieder" : "keine Netzwerk-Mitglieder");
  filter.tags?.forEach((id) => teile.push(`#${tagLabel.get(id) || "Tag"}`));
  return teile;
}

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
  kampagne: { id: string; name: string; betreff: string; inhalt: string; status: string; mindestabstand_tage: number; baustein_signatur: boolean };
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

  // Per Abmeldelink abgemeldete Adressen (mail_abmeldungen) nie anschreiben --
  // zusaetzlich zu marketing_consent_status, falls die Adresse nur dort steht.
  const { data: abmeldungen } = await supabase.from("mail_abmeldungen").select("email");
  const abgemeldet = new Set((abmeldungen || []).map((a: any) => a.email));
  const offen = teilnehmer.filter((t) => !bereitsVersendetSet.has(t.email) && !abgemeldet.has(t.email.trim().toLowerCase()));
  const bausteine = await ladeBausteine(supabase);
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
      inhaltHtml: baueMailHtml(
        renderPlatzhalter(kampagne.inhalt, { vorname: t.vorname, nachname: t.nachname }),
        bausteine,
        // Werbe-Mail: Impressum/Datenschutz und Abmeldelink sind Pflicht, nur die Signatur ist abwaehlbar
        { signatur: kampagne.baustein_signatur !== false, rechtliches: true, abmelden: true },
        abmeldeUrl("t", t.id)
      ),
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
        headers: abmeldeHeader("t", e.id),
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
