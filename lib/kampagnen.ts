import { createHash } from "crypto";
import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { renderPlatzhalter } from "./funnel";
import { ladeBausteine, baueMailHtml, abmeldeUrl, abmeldeHeader, ladeSperrliste } from "./mail-bausteine";

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
  /** Nachfass-Kampagne: nur wer Kampagne X bekommen, aber nicht geoeffnet hat */
  nicht_geoeffnet_kampagne_id?: string;
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
    !filter.tags?.length &&
    !filter.nicht_geoeffnet_kampagne_id
  );
}

/**
 * Laedt alle Teilnehmer, die zum Filter passen. Kampagnen sind Werbe-Mails: es kommen
 * NUR Personen mit marketing_consent_status = 'abonniert' in Frage. "unbekannt" und
 * "keine_zustimmung" sind bewusst ausgeschlossen (Markus prueft die Unbekannten
 * spaeter von Hand) -- vorher wurde nur "abgemeldet" ausgefiltert.
 */
export async function ladeTeilnehmerFuerFilter(filter: FilterKriterien): Promise<GefilterterTeilnehmer[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("teilnehmer")
    .select(
      "id, vorname, nachname, email, anrede, rolle, unternehmer_status, marketing_consent_status, deaktiviert_am, buchungspositionen(seminartermine(seminartypen(name))), legacy_buchungen(seminartypen(name))"
    )
    .order("nachname", { ascending: true });

  const [lifecycle, besuche, tagZuordnungen, nichtGeoeffnet] = await Promise.all([
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
    filter.nicht_geoeffnet_kampagne_id
      ? ladeAlleZeilen((von, bis) =>
          supabase
            .from("kampagnen_versand_log")
            .select("teilnehmer_id")
            .eq("kampagne_id", filter.nicht_geoeffnet_kampagne_id)
            .eq("status", "gesendet")
            .is("geoeffnet_am", null)
            .range(von, bis)
        )
      : Promise.resolve([]),
  ]);
  const nichtGeoeffnetSet = new Set(nichtGeoeffnet.map((z: any) => z.teilnehmer_id));
  const lifecycleMap = new Map(lifecycle.map((l: any) => [l.teilnehmer_id, l]));
  const besuchtKategorie2 = new Set(besuche.map((b: any) => b.teilnehmer_id));
  const tagsProTeilnehmer = new Map<string, Set<string>>();
  for (const z of tagZuordnungen) {
    if (!tagsProTeilnehmer.has(z.teilnehmer_id)) tagsProTeilnehmer.set(z.teilnehmer_id, new Set());
    tagsProTeilnehmer.get(z.teilnehmer_id)!.add(z.tag_id);
  }

  const alle: GefilterterTeilnehmer[] = (data || [])
    .filter((t: any) => t.marketing_consent_status === "abonniert" && !t.deaktiviert_am && t.email)
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
    if (filter.nicht_geoeffnet_kampagne_id && !nichtGeoeffnetSet.has(t.id)) return false;
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
  /** A/B-Test: welcher Betreff (ohne betreff_b immer "A") */
  variante: "A" | "B";
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
  if (filter.nicht_geoeffnet_kampagne_id) teile.push("Nicht-Öffner einer früheren Kampagne");
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

type Kampagne = {
  id: string;
  name: string;
  betreff: string;
  betreff_b: string | null;
  inhalt: string;
  status: string;
  mindestabstand_tage: number;
  baustein_signatur: boolean;
  trotz_sperrfrist: boolean;
  geplant_fuer: string | null;
  filter_kriterien: FilterKriterien;
};

// A/B-Variante stabil aus Kampagne + Person ableiten: Vorschau und Versand
// zeigen dieselbe Aufteilung, ohne sie speichern zu muessen.
function varianteFuer(kampagneId: string, teilnehmerId: string): "A" | "B" {
  return createHash("sha256").update(`${kampagneId}:${teilnehmerId}`).digest()[0] % 2 === 0 ? "A" : "B";
}

/**
 * Ermittelt die tatsaechlichen Empfaenger einer Kampagne (Filter live ausgewertet)
 * und rendert Betreff/Inhalt. Nicht aufgefuehrt werden: bereits ueber diese
 * Kampagne Beschickte (Dopplungsschutz, auch beim Fortsetzen eines abgebrochenen
 * Versands) und alle Adressen der Sperrliste (Abmeldung, Bounce, Beschwerde).
 */
export async function ermittleKampagnenEmpfaenger(kampagneId: string): Promise<{
  kampagne: Kampagne;
  empfaenger: KampagnenEmpfaenger[];
  gesperrt: { abgemeldet: number; bounce: number; beschwerde: number };
}> {
  const supabase = getSupabaseAdmin();
  const { data: kampagne } = await supabase.from("kampagnen").select("*").eq("id", kampagneId).single();
  if (!kampagne) throw new Error("Kampagne nicht gefunden.");

  const teilnehmer = await ladeTeilnehmerFuerFilter((kampagne.filter_kriterien || {}) as FilterKriterien);

  const { data: bereitsVersendet } = await supabase
    .from("kampagnen_versand_log")
    .select("empfaenger_email")
    .eq("kampagne_id", kampagneId)
    .in("status", ["gesendet", "uebersprungen_frequency_cap"]);
  const bereitsVersendetSet = new Set((bereitsVersendet || []).map((r: any) => r.empfaenger_email));

  const sperrliste = await ladeSperrliste(supabase);
  const gesperrt = { abgemeldet: 0, bounce: 0, beschwerde: 0 };
  const offen = teilnehmer.filter((t) => {
    if (bereitsVersendetSet.has(t.email)) return false;
    const grund = sperrliste.get(t.email.trim().toLowerCase());
    if (grund) {
      gesperrt[grund]++;
      return false;
    }
    return true;
  });

  const letzteMails = await ladeLetzteMarketingMails(supabase, offen.map((t) => t.email));
  const abstandMs = Math.max(0, Number(kampagne.mindestabstand_tage ?? 4)) * TAG_MS;
  const jetzt = Date.now();
  const bausteine = await ladeBausteine(supabase);

  const empfaenger: KampagnenEmpfaenger[] = offen.map((t) => {
    const letzte = letzteMails.get(t.email.trim().toLowerCase()) || null;
    const variante = kampagne.betreff_b ? varianteFuer(kampagne.id, t.id) : "A";
    const werte = { vorname: t.vorname, nachname: t.nachname };
    return {
      ...t,
      letzteMarketingMailAm: letzte,
      inSperrfrist: !!letzte && abstandMs > 0 && jetzt - Date.parse(letzte) < abstandMs,
      variante,
      betreff: renderPlatzhalter(variante === "B" ? kampagne.betreff_b : kampagne.betreff, werte),
      inhaltHtml: baueMailHtml(
        renderPlatzhalter(kampagne.inhalt, werte),
        bausteine,
        // Werbe-Mail: Impressum/Datenschutz und Abmeldelink sind Pflicht, nur die Signatur ist abwaehlbar
        { signatur: kampagne.baustein_signatur !== false, rechtliches: true, abmelden: true },
        abmeldeUrl("t", t.id)
      ),
    };
  });

  return { kampagne, empfaenger, gesperrt };
}

/** Eine Test-Mail (mit den Daten des ersten Empfaengers bzw. Beispieldaten) an eine beliebige Adresse -- nicht geloggt. */
export async function sendeKampagnenTestmail(kampagneId: string, an: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { kampagne, empfaenger } = await ermittleKampagnenEmpfaenger(kampagneId);
  const bausteine = await ladeBausteine(supabase);
  const beispiel = empfaenger[0];
  const werte = beispiel ? { vorname: beispiel.vorname, nachname: beispiel.nachname } : { vorname: "Anna", nachname: "Beispiel" };
  const resend = getResend();
  const varianten: [string, string][] = [["A", kampagne.betreff]];
  if (kampagne.betreff_b) varianten.push(["B", kampagne.betreff_b]);
  for (const [v, betreff] of varianten) {
    const { error } = await resend.emails.send({
      from: ABSENDER,
      to: [an],
      subject: `[TEST${kampagne.betreff_b ? ` ${v}` : ""}] ${renderPlatzhalter(betreff, werte)}`,
      html: baueMailHtml(
        renderPlatzhalter(kampagne.inhalt, werte),
        bausteine,
        { signatur: kampagne.baustein_signatur !== false, rechtliches: true, abmelden: true },
        "#test-abmeldelink"
      ),
    });
    if (error) throw new Error(error.message);
  }
}

const BATCH_GROESSE = 100; // Maximum der Resend-Batch-API

/**
 * Verschickt eine Kampagne (jetzt oder aus dem Planungs-Cron). Sperrt die
 * Kampagne vorher per Statuswechsel auf "wird_versendet" -- ein Doppelklick
 * oder ein paralleler Cron-Lauf findet dann keinen passenden Status mehr.
 * Versand in Paketen zu 100 ueber die Resend-Batch-API: Einzelmails liefen bei
 * 200+ Empfaengern in das Resend-Ratenlimit und die Funktions-Zeitgrenze.
 * Bricht der Lauf ab, bleibt "wird_versendet" stehen und `fortsetzen` schickt
 * nur noch an die, die im Log fehlen.
 */
export async function sendeKampagneJetzt(
  kampagneId: string,
  optionen: { trotzSperrfrist?: boolean; fortsetzen?: boolean } = {}
): Promise<{ gesendet: number; fehler: number; uebersprungen: number }> {
  const supabase = getSupabaseAdmin();
  const erlaubt = optionen.fortsetzen ? ["wird_versendet"] : ["entwurf", "geplant"];
  const { data: gesperrt } = await supabase
    .from("kampagnen")
    .update({ status: "wird_versendet" })
    .eq("id", kampagneId)
    .in("status", erlaubt)
    .select("id, trotz_sperrfrist");
  if (!gesperrt?.length) throw new Error("Diese Kampagne wird bereits versendet oder wurde schon versendet.");
  const trotzSperrfrist = optionen.trotzSperrfrist ?? gesperrt[0].trotz_sperrfrist;

  const { kampagne, empfaenger } = await ermittleKampagnenEmpfaenger(kampagneId);

  let gesendet = 0;
  let fehler = 0;
  let uebersprungen = 0;

  // Innerhalb der Sperrfrist: nicht schicken, aber protokollieren -- damit
  // spaeter nachvollziehbar ist, wer warum diese Kampagne nicht bekommen hat.
  const ausgelassen = trotzSperrfrist ? [] : empfaenger.filter((e) => e.inSperrfrist);
  if (ausgelassen.length) {
    const { error } = await supabase.from("kampagnen_versand_log").insert(
      ausgelassen.map((e) => ({
        kampagne_id: kampagneId,
        teilnehmer_id: e.id,
        empfaenger_email: e.email,
        status: "uebersprungen_frequency_cap",
        fehlermeldung: `Letzte Marketing-Mail am ${new Date(e.letzteMarketingMailAm!).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}, Mindestabstand ${kampagne.mindestabstand_tage} Tage`,
      }))
    );
    if (error) throw new Error(error.message);
    uebersprungen = ausgelassen.length;
  }

  const zuSenden = trotzSperrfrist ? empfaenger : empfaenger.filter((e) => !e.inSperrfrist);
  const resend = getResend();
  for (let i = 0; i < zuSenden.length; i += BATCH_GROESSE) {
    const paket = zuSenden.slice(i, i + BATCH_GROESSE);
    let ids: (string | null)[] = paket.map(() => null);
    let paketFehler: string | null = null;
    try {
      const { data, error } = await resend.batch.send(
        paket.map((e) => ({
          from: ABSENDER,
          to: [e.email],
          subject: e.betreff,
          html: e.inhaltHtml,
          headers: abmeldeHeader("t", e.id),
        })),
        // Gleiches Paket nie doppelt (z. B. Wiederholung nach Zeitueberschreitung)
        { idempotencyKey: `kampagne-${kampagneId}-${createHash("sha256").update(paket.map((e) => e.email).join(",")).digest("hex").slice(0, 32)}` }
      );
      if (error) paketFehler = error.message;
      else ids = paket.map((_, n) => data?.data?.[n]?.id || null);
    } catch (err: any) {
      paketFehler = err?.message || "Unbekannter Fehler beim Versand.";
    }

    const { error: logFehler } = await supabase.from("kampagnen_versand_log").insert(
      paket.map((e, n) => ({
        kampagne_id: kampagneId,
        teilnehmer_id: e.id,
        empfaenger_email: e.email,
        status: paketFehler ? "fehler" : "gesendet",
        fehlermeldung: paketFehler,
        resend_email_id: ids[n],
        variante: kampagne.betreff_b ? e.variante : null,
      }))
    );
    if (logFehler) console.error("Kampagnen-Log:", logFehler.message);
    if (paketFehler) fehler += paket.length;
    else gesendet += paket.length;
  }

  await supabase
    .from("kampagnen")
    .update({ status: "versendet", versendet_am: new Date().toISOString() })
    .eq("id", kampagneId);

  return { gesendet, fehler, uebersprungen };
}

/** Planungs-Cron: faellige geplante Kampagnen verschicken. */
export async function sendeGeplanteKampagnen(): Promise<{ kampagnen: number; gesendet: number; fehler: number }> {
  const supabase = getSupabaseAdmin();
  const { data: faellig } = await supabase
    .from("kampagnen")
    .select("id")
    .eq("status", "geplant")
    .lte("geplant_fuer", new Date().toISOString());
  let gesendet = 0;
  let fehler = 0;
  for (const k of faellig || []) {
    try {
      const r = await sendeKampagneJetzt(k.id);
      gesendet += r.gesendet;
      fehler += r.fehler;
    } catch (e: any) {
      console.error("Geplante Kampagne", k.id, e?.message);
    }
  }
  return { kampagnen: (faellig || []).length, gesendet, fehler };
}
