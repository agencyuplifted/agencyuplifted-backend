// Gemeinsame Logik fuer Preisstaffeln (Fruehbucher-/Normalpreise einer
// Seminaroption) -- verwendet sowohl von den oeffentlichen APIs (Onepage-
// Preisanzeige, Buchungserstellung) als auch von den Backstage-Vorschauen
// (Termin-Detail, neue Buchung), damit "welcher Preis gilt gerade" ueberall
// exakt gleich berechnet wird.
//
// Pro Preisstufe ist genau eines der beiden Stichtag-Felder gesetzt, nie
// beide: stichtag_datum (fester Zeitpunkt, unabhaengig vom Terminstart --
// z.B. "Fruehbucherpreis bis 1. Maerz") hat Vorrang, falls gesetzt; sonst
// gilt stichtag_tage_vor_start (Tage vor Seminarstart, z.B. "bis 30 Tage
// vorher").

export type Preisstaffel = {
  stichtag_tage_vor_start: number | null;
  stichtag_datum: string | null;
  preis: number | string;
};

function stichtagAlsZeitpunkt(
  staffel: Pick<Preisstaffel, "stichtag_tage_vor_start" | "stichtag_datum">,
  datumStart: string
): number {
  if (staffel.stichtag_datum) return new Date(staffel.stichtag_datum).getTime();
  const start = new Date(datumStart).getTime();
  return start - (staffel.stichtag_tage_vor_start ?? 0) * 24 * 60 * 60 * 1000;
}

// Aktiv, solange der Stichtag noch nicht erreicht ist ("jetzt <= Stichtag").
export function istPreisstaffelAktiv(
  staffel: Pick<Preisstaffel, "stichtag_tage_vor_start" | "stichtag_datum">,
  datumStart: string
): boolean {
  return Date.now() <= stichtagAlsZeitpunkt(staffel, datumStart);
}

// Aufsteigend nach Stichtag (frueheste Frist zuerst) -- entspricht der
// bisherigen Anzeige-/Auswahlreihenfolge "guenstigste/fruehste Stufe zuerst,
// Normalpreis zuletzt".
export function sortierteStaffeln<T extends Preisstaffel>(preisstaffeln: T[], datumStart: string): T[] {
  return [...preisstaffeln].sort(
    (a, b) => stichtagAlsZeitpunkt(a, datumStart) - stichtagAlsZeitpunkt(b, datumStart)
  );
}

// Waehlt die aktuell guenstigste noch aktive Preisstufe (kleinster Stichtag,
// der noch nicht verstrichen ist). Sind alle Stichtage bereits verstrichen
// (Termin steht unmittelbar bevor oder liegt bereits in der Vergangenheit),
// gilt als Fallback die Stufe mit dem spaetesten Stichtag (i.d.R. der
// Normalpreis) -- so wie zuvor.
export function aktuellePreisstaffel<T extends Preisstaffel>(preisstaffeln: T[], datumStart: string): T | null {
  if (!preisstaffeln.length) return null;
  const sortiert = sortierteStaffeln(preisstaffeln, datumStart);
  return sortiert.find((p) => istPreisstaffelAktiv(p, datumStart)) || sortiert[sortiert.length - 1];
}

export function aktuellerPreisNetto(preisstaffeln: Preisstaffel[], datumStart: string): number | null {
  const staffel = aktuellePreisstaffel(preisstaffeln, datumStart);
  return staffel ? Number(staffel.preis) : null;
}

function berlinOffsetStunden(zeitpunktUTC: Date): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    timeZoneName: "shortOffset",
  }).formatToParts(zeitpunktUTC);
  const offsetText = teile.find((t) => t.type === "timeZoneName")?.value || "GMT+1";
  return Number(offsetText.replace("GMT", "")) || 1;
}

// Wandelt ein per Datumsfeld gewaehltes Kalenderdatum (YYYY-MM-DD) in den
// Zeitpunkt "23:59:59 Uhr an diesem Tag in Berlin" um (als UTC-ISO-String).
// Ohne diese Umrechnung wuerde ein als Stichtag gewaehlter Tag (z.B. "gueltig
// bis 1. Maerz") faelschlich schon um 00:00 UTC (= 1-2 Uhr nachts deutscher
// Zeit) ablaufen, statt den ganzen gewaehlten Tag ueber gueltig zu sein.
export function stichtagsDatumEndeDesTages(datumISO: string): string {
  const [jahr, monat, tag] = datumISO.split("-").map(Number);
  const mittagUTC = new Date(Date.UTC(jahr, monat - 1, tag, 12));
  const offset = berlinOffsetStunden(mittagUTC);
  return new Date(Date.UTC(jahr, monat - 1, tag, 23 - offset, 59, 59)).toISOString();
}
