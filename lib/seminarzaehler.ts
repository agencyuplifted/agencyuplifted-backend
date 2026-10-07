// Laufende Durchlauf-Nummer je Seminarkategorie ("Seminar #49").
//
// Die fruehen Durchlaeufe stehen nicht einzeln in seminartermine (nur
// aggregiert in legacy_buchungen, ohne Kennung). Deshalb: feste historische
// Basis bis zu einem Stichtag + live gezaehlte Termine danach, erkannt am
// Praefix der Kennung (SPS + Instanz + Jahr, z. B. SPS426).
//
// Weitere Kategorien (FUH, SOZ, POS, AUK, FOK): einfach einen Eintrag mit
// ihrer Basis ergaenzen -- ohne Eintrag erscheint die Kategorie nicht.
export type SeminarZaehlerKonfig = {
  praefix: string;
  /** Anzahl Durchlaeufe bis einschliesslich Stichtag */
  basis: number;
  /** Termin-Beginn des letzten in der Basis enthaltenen Durchlaufs */
  stichtag: string;
  seit: string;
  bezeichnung: string;
};

export const SEMINAR_ZAEHLER: SeminarZaehlerKonfig[] = [
  {
    praefix: "SPS",
    // Stand SPS326, 7. Oktober 2026 – alle SPS-Durchläufe seit Dezember 2017
    // inkl. SPE118 (Geschäftsführer-Variante, wird mitgezählt).
    basis: 49,
    stichtag: "2026-10-07",
    seit: "Dezember 2017",
    bezeichnung: "Wertorientierte Preisfindung in Agenturen",
  },
];

export type SeminarZaehlerStand = SeminarZaehlerKonfig & {
  /** bisher begonnene Durchlaeufe (Basis + live) */
  anzahl: number;
  laeuftGerade: { kennung: string; datum_start: string } | null;
  naechster: { id: string; kennung: string; datum_start: string; nummer: number } | null;
};

// Abgesagte (status 'abgesagt') und deaktivierte Termine zaehlen nicht --
// sie "verbrauchen" ihre Kennung trotzdem, daher Luecken in der Nummerierung
// (z. B. kein SPS623). Gezaehlt wird NUR, was bis heute begonnen hat
// ("x Seminare absolviert", Markus 07.10.2026) -- kuenftige Termine nie;
// der naechste bekommt nur seine kuenftige Nummer ("SPS426 = das 50.").
export async function ladeSeminarZaehler(supabase: any, heute: string): Promise<SeminarZaehlerStand[]> {
  const ergebnis: SeminarZaehlerStand[] = [];
  for (const k of SEMINAR_ZAEHLER) {
    const { data } = await supabase
      .from("seminartermine")
      .select("id, kennung, datum_start, datum_ende")
      .ilike("kennung", `${k.praefix}%`)
      .neq("status", "abgesagt")
      .is("deaktiviert_am", null)
      .order("datum_start");
    // Praefix exakt + Ziffer, damit z. B. "SPSX..." oder "SPE..." nicht mitlaufen
    const termine = ((data || []) as any[]).filter((t) => new RegExp(`^${k.praefix}\\d`, "i").test(t.kennung || ""));
    const nachStichtag = termine.filter((t) => t.datum_start > k.stichtag);
    const begonnen = nachStichtag.filter((t) => t.datum_start <= heute).length;
    const anzahl = k.basis + begonnen;
    const laeuft = termine.find((t) => t.datum_start <= heute && (t.datum_ende || t.datum_start) >= heute) || null;
    const kuenftig = nachStichtag.filter((t) => t.datum_start > heute);
    const n = kuenftig[0];
    ergebnis.push({
      ...k,
      anzahl,
      laeuftGerade: laeuft ? { kennung: laeuft.kennung, datum_start: laeuft.datum_start } : null,
      naechster: n ? { id: n.id, kennung: n.kennung, datum_start: n.datum_start, nummer: anzahl + 1 } : null,
    });
  }
  return ergebnis;
}
