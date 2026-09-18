import { createHash } from "crypto";
import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { renderPlatzhalter } from "./funnel";
import { parseRegeln, wirksameRegeln, regelnErfuellt, beschreibeBedingung, FELDER, type Regeln, type Bedingung } from "./kampagnen-regeln";
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
  /** Regel-Baukasten (lib/kampagnen-regeln.ts); ersetzt die Einzelfelder oben, die nur noch fuer alte Daten gelesen werden */
  regeln?: Regeln;
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
  return !wirksameRegeln(normalisiereFilter(filter)).gruppen.length && !filter.nicht_geoeffnet_kampagne_id;
}

/**
 * Laedt alle Teilnehmer, die zum Filter passen. Kampagnen sind Werbe-Mails: es kommen
 * NUR Personen mit marketing_consent_status = 'abonniert' in Frage. "unbekannt" und
 * "keine_zustimmung" sind bewusst ausgeschlossen (Markus prueft die Unbekannten
 * spaeter von Hand) -- vorher wurde nur "abgemeldet" ausgefiltert.
 */
export async function ladeTeilnehmerFuerFilter(filter: FilterKriterien): Promise<GefilterterTeilnehmer[]> {
  const supabase = getSupabaseAdmin();
  const regeln = wirksameRegeln(normalisiereFilter(filter));
  const bedingungen = regeln.gruppen.flatMap((g) => g.bedingungen);
  const brauchtBesuche = bedingungen.some((b) => ["seminar_besucht", "seminar_gebucht", "seminar_termin", "letztes_seminar_monate"].includes(b.feld));
  const brauchtTags = bedingungen.some((b) => b.feld === "tag");
  const brauchtKampagnen = bedingungen.some((b) => b.feld.startsWith("kampagne_"));
  const brauchtOptionen = bedingungen.some((b) => b.feld === "option_gebucht");

  const [{ data }, lifecycle, besuche, tagZuordnungen, nichtGeoeffnet, kampagnenLog, optionsPositionen] = await Promise.all([
    supabase
      .from("teilnehmer")
      .select("id, vorname, nachname, email, anrede, rolle, unternehmer_status, marketing_consent_status, deaktiviert_am")
      .order("nachname", { ascending: true }),
    ladeAlleZeilen((von, bis) =>
      supabase.from("teilnehmer_lifecycle_stage").select("teilnehmer_id, anzahl_besuchte_seminare, teilnahme_stand, netzwerk_mitglied, vermutlich_ruhend").range(von, bis)
    ),
    brauchtBesuche
      ? ladeAlleZeilen((von, bis) => supabase.from("teilnehmer_seminar_besuche").select("teilnehmer_id, seminarkategorie, seminartermin_id, stand, datum_start, datum_ende").range(von, bis))
      : Promise.resolve([]),
    brauchtTags ? ladeAlleZeilen((von, bis) => supabase.from("teilnehmer_tags").select("teilnehmer_id, tag_id").range(von, bis)) : Promise.resolve([]),
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
    brauchtKampagnen
      ? ladeAlleZeilen((von, bis) =>
          supabase.from("kampagnen_versand_log").select("teilnehmer_id, kampagne_id, geoeffnet_am, geklickt_am").eq("status", "gesendet").range(von, bis)
        )
      : Promise.resolve([]),
    brauchtOptionen
      ? ladeAlleZeilen((von, bis) =>
          supabase.from("buchungspositionen").select("teilnehmer_id, buchungen(status), seminartermin_optionen(titel)").not("seminartermin_option_id", "is", null).range(von, bis)
        )
      : Promise.resolve([]),
  ]);
  const nichtGeoeffnetSet = new Set(nichtGeoeffnet.map((z: any) => z.teilnehmer_id));
  const lifecycleMap = new Map(lifecycle.map((l: any) => [l.teilnehmer_id, l]));
  const mengeProTeilnehmer = () => new Map<string, Set<string>>();
  const besucht = mengeProTeilnehmer();
  const gebucht = mengeProTeilnehmer();
  const tagsVon = mengeProTeilnehmer();
  const termineVon = mengeProTeilnehmer();
  const kBekommen = mengeProTeilnehmer();
  const kGeoeffnet = mengeProTeilnehmer();
  const kGeklickt = mengeProTeilnehmer();
  const letztesSeminar = new Map<string, string>();
  const hinzu = (m: Map<string, Set<string>>, id: string, wert: string) => {
    if (!m.has(id)) m.set(id, new Set());
    m.get(id)!.add(wert);
  };
  for (const b of besuche) {
    if (b.seminartermin_id && b.stand !== "laeuft_oder_unklar") hinzu(termineVon, b.teilnehmer_id, b.seminartermin_id);
    const ende = b.datum_ende || b.datum_start;
    if (b.stand === "besucht" && ende && ende > (letztesSeminar.get(b.teilnehmer_id) || "")) letztesSeminar.set(b.teilnehmer_id, ende);
    if (!b.seminarkategorie) continue;
    if (b.stand === "besucht") hinzu(besucht, b.teilnehmer_id, b.seminarkategorie);
    else if (b.stand === "gebucht_kuenftig") hinzu(gebucht, b.teilnehmer_id, b.seminarkategorie);
  }
  for (const z of tagZuordnungen) hinzu(tagsVon, z.teilnehmer_id, z.tag_id);
  const optionenVon = mengeProTeilnehmer();
  for (const p of optionsPositionen) {
    if (p.buchungen?.status === "storniert" || !p.seminartermin_optionen?.titel) continue;
    hinzu(optionenVon, p.teilnehmer_id, String(p.seminartermin_optionen.titel).trim());
  }
  for (const z of kampagnenLog) {
    if (!z.teilnehmer_id) continue;
    hinzu(kBekommen, z.teilnehmer_id, z.kampagne_id);
    if (z.geoeffnet_am) hinzu(kGeoeffnet, z.teilnehmer_id, z.kampagne_id);
    if (z.geklickt_am) hinzu(kGeklickt, z.teilnehmer_id, z.kampagne_id);
  }

  const erfuellt = (t: any, b: Bedingung): boolean => {
    const lc: any = lifecycleMap.get(t.id) || {};
    const menge = (m: Map<string, Set<string>>) => {
      const hat = m.get(t.id) || new Set<string>();
      if (b.operator === "alle") return b.werte.every((w) => hat.has(w));
      if (b.operator === "eine") return b.werte.some((w) => hat.has(w));
      if (b.operator === "nicht_alle") return !b.werte.every((w) => hat.has(w));
      return !b.werte.some((w) => hat.has(w)); // "keine"
    };
    const merkmal = (wert: string) => (b.operator === "ist_nicht" ? !b.werte.includes(wert) : b.werte.includes(wert));
    switch (b.feld) {
      case "seminar_besucht":
        return menge(besucht);
      case "seminar_gebucht":
        return menge(gebucht);
      case "tag":
        return menge(tagsVon);
      case "seminar_termin":
        return menge(termineVon);
      case "option_gebucht":
        return menge(optionenVon);
      case "kampagne_bekommen":
        return menge(kBekommen);
      case "kampagne_geoeffnet":
        return menge(kGeoeffnet);
      case "kampagne_geklickt":
        return menge(kGeklickt);
      case "letztes_seminar_monate": {
        const letzt = letztesSeminar.get(t.id);
        if (!letzt) return false; // noch nie ein Seminar -> weder "vor mindestens" noch "vor hoechstens"
        const monate = (Date.now() - Date.parse(letzt)) / (30.44 * 86_400_000);
        const grenze = Number(b.werte[0] || 0);
        return b.operator === "max" ? monate <= grenze : monate >= grenze;
      }
      case "anzahl_seminare": {
        const n = Number(lc.anzahl_besuchte_seminare || 0);
        const grenze = Number(b.werte[0] || 0);
        return b.operator === "max" ? n <= grenze : n >= grenze;
      }
      case "teilnahme_stand":
        return merkmal(lc.teilnahme_stand || "kein_seminar_besucht");
      case "unternehmer_status":
        return merkmal(t.unternehmer_status || "unbekannt");
      case "anrede":
        return merkmal(t.anrede || "keine_angabe");
      case "rolle":
        return merkmal(t.rolle || "teilnehmer");
      case "netzwerk":
        return (b.werte[0] === "ja") === !!lc.netzwerk_mitglied;
    }
  };

  return (data || [])
    .filter((t: any) => t.marketing_consent_status === "abonniert" && !t.deaktiviert_am && t.email)
    .filter((t: any) => !filter.nicht_geoeffnet_kampagne_id || nichtGeoeffnetSet.has(t.id))
    .filter((t: any) => regelnErfuellt(regeln, (b) => erfuellt(t, b)))
    .map((t: any) => ({
      id: t.id,
      vorname: t.vorname,
      nachname: t.nachname,
      email: t.email,
      anrede: t.anrede || "keine_angabe",
      rolle: t.rolle || "teilnehmer",
      unternehmer_status: t.unternehmer_status || "unbekannt",
      seminare: Array.from(besucht.get(t.id) || []),
      vermutlichRuhend: !!lifecycleMap.get(t.id)?.vermutlich_ruhend,
    }));
}

/**
 * Alte Filter (Einzelfelder aus frueheren Kampagnen/Filtergruppen) in Regeln
 * uebersetzen, damit alles ueber eine Auswertung laeuft. Sind Regeln
 * gespeichert, gelten nur diese.
 */
export function normalisiereFilter(filter: FilterKriterien): Regeln {
  const r = parseRegeln(filter.regeln);
  if (r) return r;
  const b: Bedingung[] = [];
  const merkmal = (feld: Bedingung["feld"], werte?: string[]) => werte?.length && b.push({ feld, operator: "ist", werte });
  merkmal("anrede", filter.anrede);
  merkmal("rolle", filter.rolle);
  merkmal("unternehmer_status", filter.unternehmer_status);
  merkmal("teilnahme_stand", filter.teilnahme_stand);
  if (filter.seminartypen?.length) b.push({ feld: "seminar_besucht", operator: "eine", werte: filter.seminartypen });
  if (filter.kategorie2) b.push({ feld: "seminar_besucht", operator: filter.kategorie2_modus === "nicht_besucht" ? "keine" : "alle", werte: [filter.kategorie2] });
  if (filter.netzwerk_mitglied) b.push({ feld: "netzwerk", operator: "ist", werte: [filter.netzwerk_mitglied] });
  if (filter.tags?.length) b.push({ feld: "tag", operator: "alle", werte: filter.tags });
  return { verknuepfung: "oder", gruppen: [{ verknuepfung: "und", bedingungen: b }] };
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


/** Kurzbeschreibung eines Filters fuer Listen, z. B. ["Seminar besucht: Preisfindung + Fokussierung", "oder", "#VIP"] */
export function beschreibeFilter(filter: FilterKriterien, tagLabel: Map<string, string> = new Map()): string[] {
  const regeln = wirksameRegeln(normalisiereFilter(filter));
  const wertLabel = (feld: Bedingung["feld"], wert: string) =>
    feld === "tag" ? tagLabel.get(wert) || "Tag" : FELDER[feld].werte?.find((w) => w.key === wert)?.label || wert;
  // Jede Gruppe als ein Etikett, Gruppen durch "oder"/"und" getrennt
  const gruppenTexte = regeln.gruppen.map((g) => g.bedingungen.map((b) => beschreibeBedingung(b, wertLabel)).join(g.verknuepfung === "oder" ? " oder " : " · "));
  const mehrere = gruppenTexte.length > 1;
  const ergebnis = gruppenTexte.flatMap((t, i) => {
    const text = mehrere && regeln.gruppen[i].bedingungen.length > 1 ? `(${t})` : t;
    return i ? [regeln.verknuepfung, text] : [text];
  });
  if (filter.nicht_geoeffnet_kampagne_id) ergebnis.push("Nicht-Öffner einer früheren Kampagne");
  return ergebnis;
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
