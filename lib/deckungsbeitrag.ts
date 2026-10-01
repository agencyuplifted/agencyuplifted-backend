import { ladeHotellisten, type Hotelliste } from "./hotelliste";

// Deckungsbeitrag pro Termin -- gemeinsame Rechnung fuer Termin-Seite und
// Dashboard (Reiter "Seminare"). Vorher rechnete nur das Dashboard, und
// zwar nur mit gebuchten Personen: Mitarbeiter und Referenten kosten aber
// genauso Hotel und Verpflegung (Entscheidung Markus 01.10.2026: alle vor Ort
// je Pauschale, keine Fixkosten pro Termin).

export type Deckungsbeitrag = {
  umsatz: number;
  umsatzUnbezahlt: number;
  personen: number;
  teilnehmer: number;
  fremdkostenProPerson: number;
  fremdkosten: number;
  db: number;
};

export async function ladeFremdkostenProPerson(supabase: any): Promise<number> {
  const { data } = await supabase.from("finanz_konfiguration").select("fremdkosten_pro_person_netto").eq("id", 1).single();
  return Number(data?.fremdkosten_pro_person_netto ?? 300);
}

// vorgeladen: Hotel-Listen, die der Aufrufer ohnehin schon hat (Terminliste) -- spart die doppelten Abfragen.
export async function berechneDeckungsbeitraege(
  supabase: any,
  terminIds: string[],
  vorgeladen?: Map<string, Hotelliste>
): Promise<Map<string, Deckungsbeitrag>> {
  const ergebnis = new Map<string, Deckungsbeitrag>();
  if (!terminIds.length) return ergebnis;
  const [fremdkostenProPerson, hotellisten, { data: positionen }, { data: legacy }] = await Promise.all([
    ladeFremdkostenProPerson(supabase),
    vorgeladen ?? ladeHotellisten(supabase, terminIds),
    supabase
      .from("buchungspositionen")
      .select("seminartermin_id, preis, buchungen!inner(status)")
      .in("seminartermin_id", terminIds)
      .neq("buchungen.status", "storniert"),
    // Alt-Daten haben keine Preise, aber Personen vor Ort -- ohne sie waeren
    // die Kosten vergangener Seminare zu niedrig und der DB zu hoch.
    supabase.from("legacy_buchungen").select("seminartermin_id, teilnehmer_id").in("seminartermin_id", terminIds),
  ]);

  for (const id of terminIds) {
    const hotel = hotellisten.get(id)!;
    const bekannt = new Set(hotel.zeilen.map((z) => z.teilnehmerId).filter(Boolean));
    const legacyPersonen = new Set(
      (legacy || []).filter((l: any) => l.seminartermin_id === id && l.teilnehmer_id && !bekannt.has(l.teilnehmer_id)).map((l: any) => l.teilnehmer_id)
    );
    const eigene = (positionen || []).filter((p: any) => p.seminartermin_id === id);
    const umsatz = eigene.reduce((s: number, p: any) => s + Number(p.preis || 0), 0);
    const umsatzUnbezahlt = eigene
      .filter((p: any) => p.buchungen?.status === "angefragt")
      .reduce((s: number, p: any) => s + Number(p.preis || 0), 0);
    const personen = hotel.zeilen.length + legacyPersonen.size;
    const teilnehmer = hotel.zeilen.filter((z) => z.typ === "Teilnehmer").length + legacyPersonen.size;
    const fremdkosten = personen * fremdkostenProPerson;
    ergebnis.set(id, { umsatz, umsatzUnbezahlt, personen, teilnehmer, fremdkostenProPerson, fremdkosten, db: umsatz - fremdkosten });
  }
  return ergebnis;
}
