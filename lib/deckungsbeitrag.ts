import { ladeHotellisten, type Hotelliste } from "./hotelliste";

// Deckungsbeitrag pro Termin -- gemeinsame Rechnung fuer Termin-Seite,
// Terminliste und Dashboard (Reiter "Seminare").
//
// Kosten pro Person vor Ort (Hotel, Verpflegung), Entscheidungen Markus 01.10.2026:
// - Teilnehmer: Fremdkosten ihrer gebuchten Option (z. B. Konferenz 2 Tage
//   600 €, 3 Tage 900 €), sonst die allgemeine Pauschale.
// - Referenten/Mitarbeiter: Wert am Termin (fremdkosten_personal_pro_person_netto),
//   sonst die allgemeine Pauschale.
// - Personen nur aus den Pipedrive-Altdaten zaehlen NICHT -- die sind nur
//   Abgleich; Umsatz und Kosten kommen aus echten Buchungen (Backstage/FastBill).
//   Sonst stuende jeder vergangene Termin vor dem FastBill-Abgleich tief im Minus.
// Keine Fixkosten pro Termin.

export type Deckungsbeitrag = {
  umsatz: number;
  umsatzUnbezahlt: number;
  /** Personen mit Kosten: Teilnehmer mit Buchung + Referenten + Mitarbeiter */
  personen: number;
  /** Teilnehmer fuer die Belegungsanzeige (inkl. Altdaten-Personen) */
  teilnehmer: number;
  /** Allgemeine Pauschale aus den Einstellungen (Fallback) */
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
  const [pauschale, hotellisten, { data: positionen }, { data: legacy }, { data: termine }] = await Promise.all([
    ladeFremdkostenProPerson(supabase),
    vorgeladen ?? ladeHotellisten(supabase, terminIds),
    supabase
      .from("buchungspositionen")
      .select("seminartermin_id, teilnehmer_id, preis, buchungen!inner(status), seminartermin_optionen(fremdkosten_pro_person_netto)")
      .in("seminartermin_id", terminIds)
      .neq("buchungen.status", "storniert"),
    supabase.from("legacy_buchungen").select("seminartermin_id, teilnehmer_id").in("seminartermin_id", terminIds),
    supabase.from("seminartermine").select("id, fremdkosten_personal_pro_person_netto").in("id", terminIds),
  ]);

  for (const id of terminIds) {
    const hotel = hotellisten.get(id)!;
    const eigene = (positionen || []).filter((p: any) => p.seminartermin_id === id);
    const umsatz = eigene.reduce((s: number, p: any) => s + Number(p.preis || 0), 0);
    const umsatzUnbezahlt = eigene
      .filter((p: any) => p.buchungen?.status === "angefragt")
      .reduce((s: number, p: any) => s + Number(p.preis || 0), 0);

    // Kosten je Teilnehmer aus seiner Option; mehrere Positionen (z. B.
    // Zimmer-Upgrade-Zeile ohne Option) -> der hoechste gesetzte Wert.
    const kostenJeTeilnehmer = new Map<string, number>();
    eigene.forEach((p: any) => {
      const wert = p.seminartermin_optionen?.fremdkosten_pro_person_netto;
      if (wert === null || wert === undefined || !p.teilnehmer_id) return;
      kostenJeTeilnehmer.set(p.teilnehmer_id, Math.max(kostenJeTeilnehmer.get(p.teilnehmer_id) ?? 0, Number(wert)));
    });
    const personalRoh = (termine || []).find((t: any) => t.id === id)?.fremdkosten_personal_pro_person_netto;
    const personal = personalRoh === null || personalRoh === undefined ? pauschale : Number(personalRoh);

    const fremdkosten = hotel.zeilen.reduce((summe, z) => {
      if (z.typ === "Teilnehmer") return summe + (z.teilnehmerId && kostenJeTeilnehmer.has(z.teilnehmerId) ? kostenJeTeilnehmer.get(z.teilnehmerId)! : pauschale);
      return summe + personal;
    }, 0);

    // Belegung zeigt weiterhin auch Altdaten-Personen (wer war da), Kosten nicht.
    const bekannt = new Set(hotel.zeilen.map((z) => z.teilnehmerId).filter(Boolean));
    const legacyPersonen = new Set(
      (legacy || []).filter((l: any) => l.seminartermin_id === id && l.teilnehmer_id && !bekannt.has(l.teilnehmer_id)).map((l: any) => l.teilnehmer_id)
    );
    const teilnehmer = hotel.zeilen.filter((z) => z.typ === "Teilnehmer").length + legacyPersonen.size;

    ergebnis.set(id, {
      umsatz,
      umsatzUnbezahlt,
      personen: hotel.zeilen.length,
      teilnehmer,
      fremdkostenProPerson: pauschale,
      fremdkosten,
      db: umsatz - fremdkosten,
    });
  }
  return ergebnis;
}
