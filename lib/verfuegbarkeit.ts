import type { SupabaseClient } from "@supabase/supabase-js";
import { VERFUEGBARKEIT_NEUTRAL_TEXT } from "@/lib/format";

// Einzige Stelle, an der berechnet wird, welche Restplaetze und welcher
// Dringlichkeitstext auf der Website erscheinen. Vorher stand dieselbe Logik
// kopiert in beiden oeffentlichen seminartermine-APIs, waehrend Backstage nur
// "Anzeige ueberschrieben" anzeigen konnte -- ob Hero und Backstage wirklich
// dasselbe meinen, war so nicht nachpruefbar. Jetzt nutzen die APIs (die der
// Onepage-Hero live abfragt) und die Backstage-Seiten exakt diese Funktionen.

export type UrgencySchwellenwertTyp = "prozent" | "belegt" | "frei";

export type UrgencyStufe = {
  id?: string;
  seminartermin_id?: string;
  schwellenwert_typ: UrgencySchwellenwertTyp | null;
  schwellenwert_prozent: number | string | null;
  schwellenwert_anzahl: number | null;
  text_vorlage: string;
};

export type TerminFuerVerfuegbarkeit = {
  id: string;
  kapazitaet: number;
  angezeigte_restplaetze: number | null;
  verfuegbarkeit_anzeige_modus: string | null;
  urgency_label_template: string | null;
};

export type WebsiteVerfuegbarkeit = {
  gebucht: number;
  freiRechnerisch: number;
  freiePlaetze: number;
  restplaetzeUeberschrieben: boolean;
  belegtProzent: number;
  dringlichkeitstext: string | null;
  quelle: "neutral" | "stufe" | "standardtext" | "keiner";
  aktiveStufe: UrgencyStufe | null;
};

export const URGENCY_STUFE_SELECT = "id, seminartermin_id, schwellenwert_typ, schwellenwert_prozent, schwellenwert_anzahl, text_vorlage";

export function beschreibeUrgencyStufe(stufe: UrgencyStufe): string {
  const anzahl = stufe.schwellenwert_anzahl ?? 0;
  if (stufe.schwellenwert_typ === "belegt") return `ab ${anzahl} ${anzahl === 1 ? "belegtem Platz" : "belegten Plätzen"}`;
  if (stufe.schwellenwert_typ === "frei") return `bei höchstens ${anzahl} ${anzahl === 1 ? "freiem Platz" : "freien Plätzen"}`;
  return `ab ${Number(stufe.schwellenwert_prozent)} % belegt`;
}

// Stufen unterschiedlicher Typen muessen gegeneinander abgewogen werden, wenn
// mehrere gleichzeitig greifen: dafuer wird jede Stufe in "ab so vielen
// belegten Plaetzen" umgerechnet, die hoechste greifende gewinnt (wie bisher
// bei reinen Prozent-Stufen die hoechste Prozentzahl).
export function urgencyBelegteSchwelle(stufe: UrgencyStufe, kapazitaet: number): number {
  if (stufe.schwellenwert_typ === "belegt") return stufe.schwellenwert_anzahl ?? 0;
  if (stufe.schwellenwert_typ === "frei") return kapazitaet - (stufe.schwellenwert_anzahl ?? 0);
  return (kapazitaet * Number(stufe.schwellenwert_prozent)) / 100;
}

function stufeGreift(stufe: UrgencyStufe, effektivGebucht: number, freiePlaetze: number, belegtProzent: number): boolean {
  if (stufe.schwellenwert_typ === "belegt") return stufe.schwellenwert_anzahl != null && effektivGebucht >= stufe.schwellenwert_anzahl;
  if (stufe.schwellenwert_typ === "frei") return stufe.schwellenwert_anzahl != null && freiePlaetze <= stufe.schwellenwert_anzahl;
  return stufe.schwellenwert_prozent != null && belegtProzent >= Number(stufe.schwellenwert_prozent);
}

export function setzeUrgencyPlatzhalter(vorlage: string, freiePlaetze: number, kapazitaet: number): string {
  return vorlage.replaceAll("{remaining}", String(freiePlaetze)).replaceAll("{total}", String(kapazitaet));
}

export function berechneWebsiteVerfuegbarkeit(
  termin: TerminFuerVerfuegbarkeit,
  gebucht: number,
  stufen: UrgencyStufe[]
): WebsiteVerfuegbarkeit {
  const freiRechnerisch = Math.max(0, termin.kapazitaet - gebucht);
  // "Angezeigte Restplaetze" erlaubt eine manuelle Ueberschreibung,
  // unabhaengig von den tatsaechlichen Buchungen (z.B. um Urgency gezielt zu
  // steuern). Die Urgency-Stufen richten sich bewusst nach dieser angezeigten
  // (ggf. ueberschriebenen) Zahl, damit eine manuell hochgesetzte Urgency auch
  // tatsaechlich eine hoehere Stufe ausloest.
  const restplaetzeUeberschrieben = termin.angezeigte_restplaetze !== null && termin.angezeigte_restplaetze !== undefined;
  const freiePlaetze = restplaetzeUeberschrieben ? Number(termin.angezeigte_restplaetze) : freiRechnerisch;
  const effektivGebucht = Math.max(0, termin.kapazitaet - freiePlaetze);
  const belegtProzent = termin.kapazitaet > 0 ? (effektivGebucht / termin.kapazitaet) * 100 : 0;

  const basis = { gebucht, freiRechnerisch, freiePlaetze, restplaetzeUeberschrieben, belegtProzent };

  // Im neutralen Anzeige-Modus duerfen keine Platzzahlen durchsickern --
  // deshalb dort immer der feste neutrale Text, unabhaengig von Stufen/Template.
  if (termin.verfuegbarkeit_anzeige_modus === "neutral") {
    return { ...basis, dringlichkeitstext: VERFUEGBARKEIT_NEUTRAL_TEXT, quelle: "neutral", aktiveStufe: null };
  }

  const aktiveStufe =
    stufen
      .filter((s) => stufeGreift(s, effektivGebucht, freiePlaetze, belegtProzent))
      .sort((a, b) => urgencyBelegteSchwelle(b, termin.kapazitaet) - urgencyBelegteSchwelle(a, termin.kapazitaet))[0] || null;
  if (aktiveStufe?.text_vorlage) {
    return {
      ...basis,
      dringlichkeitstext: setzeUrgencyPlatzhalter(aktiveStufe.text_vorlage, freiePlaetze, termin.kapazitaet),
      quelle: "stufe",
      aktiveStufe,
    };
  }

  // Fallback: greift keine Stufe, den am Termin hinterlegten Standard-Text
  // verwenden (z.B. "Noch Plätze frei").
  if (termin.urgency_label_template) {
    return {
      ...basis,
      dringlichkeitstext: setzeUrgencyPlatzhalter(termin.urgency_label_template, freiePlaetze, termin.kapazitaet),
      quelle: "standardtext",
      aktiveStufe: null,
    };
  }

  return { ...basis, dringlichkeitstext: null, quelle: "keiner", aktiveStufe: null };
}

// Laedt Belegung + Urgency-Stufen fuer mehrere Termine und berechnet die
// Website-Anzeige. Belegung = Anzahl unterschiedlicher Teilnehmer (aktuelle
// Buchungen ohne Stornos + Alt-Daten aus legacy_buchungen, doppelt gezaehlte
// Personen vermieden). Mitarbeiter/Gastreferenten zaehlen nicht als belegter
// Platz.
export async function ladeWebsiteVerfuegbarkeit(
  supabase: SupabaseClient,
  termine: TerminFuerVerfuegbarkeit[]
): Promise<Map<string, WebsiteVerfuegbarkeit>> {
  const ergebnis = new Map<string, WebsiteVerfuegbarkeit>();
  const terminIds = termine.map((t) => t.id);
  if (!terminIds.length) return ergebnis;

  const [{ data: positionen }, { data: legacyPositionen }, { data: stufenAlle }] = await Promise.all([
    supabase
      .from("buchungspositionen")
      .select("seminartermin_id, teilnehmer_id, buchungen!inner(status), teilnehmer(rolle)")
      .in("seminartermin_id", terminIds)
      .neq("buchungen.status", "storniert"),
    supabase
      .from("legacy_buchungen")
      .select("seminartermin_id, teilnehmer_id, teilnehmer(rolle)")
      .in("seminartermin_id", terminIds),
    supabase.from("urgency_stufen").select(URGENCY_STUFE_SELECT).in("seminartermin_id", terminIds),
  ]);

  const teilnehmerProTermin = new Map<string, Set<string>>();
  const zaehleEin = (seminarterminId: string | null, teilnehmerId: string | null, rolle: string | null | undefined) => {
    if (!seminarterminId || !teilnehmerId) return;
    if (rolle && rolle !== "teilnehmer") return;
    if (!teilnehmerProTermin.has(seminarterminId)) teilnehmerProTermin.set(seminarterminId, new Set());
    teilnehmerProTermin.get(seminarterminId)!.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleEin(p.seminartermin_id, p.teilnehmer_id, p.teilnehmer?.rolle));
  (legacyPositionen || []).forEach((l: any) => zaehleEin(l.seminartermin_id, l.teilnehmer_id, l.teilnehmer?.rolle));

  const stufenProTermin = new Map<string, UrgencyStufe[]>();
  (stufenAlle || []).forEach((s: any) => {
    if (!stufenProTermin.has(s.seminartermin_id)) stufenProTermin.set(s.seminartermin_id, []);
    stufenProTermin.get(s.seminartermin_id)!.push(s);
  });

  termine.forEach((t) => {
    ergebnis.set(
      t.id,
      berechneWebsiteVerfuegbarkeit(t, teilnehmerProTermin.get(t.id)?.size || 0, stufenProTermin.get(t.id) || [])
    );
  });
  return ergebnis;
}
