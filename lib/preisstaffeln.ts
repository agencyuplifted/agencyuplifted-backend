import { MONATSNAMEN } from "./format";

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

// Kehrwert zu stichtagsDatumEndeDesTages: liefert das Kalenderdatum
// (YYYY-MM-DD) in Berliner Zeit fuer einen gespeicherten Stichtag-Zeitpunkt
// -- zum Vorbefuellen des Datumsfelds beim Bearbeiten einer Preisstufe.
export function berlinKalendertag(zeitpunktISO: string): string {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(zeitpunktISO));
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  return `${wert("year")}-${wert("month")}-${wert("day")}`;
}

function ersterDonnerstagUTC(jahr: number, monatIndex0: number): Date {
  const erster = new Date(Date.UTC(jahr, monatIndex0, 1));
  const diffZuDonnerstag = (4 - erster.getUTCDay() + 7) % 7; // Donnerstag = Wochentag 4
  return new Date(Date.UTC(jahr, monatIndex0, 1 + diffZuDonnerstag));
}

function monatVerschieben(jahr: number, monatIndex0: number, versatz: number): { jahr: number; monatIndex0: number } {
  const gesamt = jahr * 12 + monatIndex0 + versatz;
  return { jahr: Math.floor(gesamt / 12), monatIndex0: ((gesamt % 12) + 12) % 12 };
}

// Preisstaffel-Vorlage "Monatlicher Stichtag rueckwaerts" (siehe
// wendePreisstaffelVorlageAn in lib/actions.ts): 4 Stichtage, jeweils der
// erste Donnerstag eines Monats, monatlich rueckwaerts gezaehlt ab dem Monat
// vor Terminstart -- der letzte (spaeteste) Stichtag faellt so auf den
// ersten Donnerstag des Vormonats (ca. 4 Wochen vor Termin), die drei davor
// je einen Monat frueher. Rueckgabe als YYYY-MM-DD (Kalendertag, UTC),
// Index 0 = fruehester Stichtag (Uebergang 1) bis Index 3 = spaetester
// (Uebergang 4).
export function berechneMonatlicheStichtageRueckwaerts(terminDatumStart: string): string[] {
  const terminDatum = new Date(`${terminDatumStart}T00:00:00Z`);
  const monatVorTermin = monatVerschieben(terminDatum.getUTCFullYear(), terminDatum.getUTCMonth(), -1);
  return [1, 2, 3, 4].map((uebergangsNummer) => {
    const versatz = -(4 - uebergangsNummer);
    const m = monatVerschieben(monatVorTermin.jahr, monatVorTermin.monatIndex0, versatz);
    return ersterDonnerstagUTC(m.jahr, m.monatIndex0).toISOString().slice(0, 10);
  });
}

// Menschenlesbarer Stichtag fuer die oeffentliche Preisanzeige, z.B.
// "10. September" -- Tag ohne fuehrende Null + deutscher Monatsname, in
// Berliner Zeit (relevant nahe der Tagesgrenze/DST-Wechsel).
export function gueltigBisText(zeitpunktISO: string): string {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date(zeitpunktISO));
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  return `${Number(wert("day"))}. ${MONATSNAMEN[Number(wert("month")) - 1]}`;
}

// ---------------------------------------------------------------------------
// Gespeicherte Preisstaffel-Vorlagen (Tabelle preisstaffel_vorlagen,
// Verwaltung unter /preisstaffel-vorlagen). Anders als die fest eingebaute
// Vorlage "Monatlicher Stichtag rueckwaerts" oben kennen sie NUR den relativen
// Modus (stichtag_tage_vor_start) -- ein festes Kalenderdatum passt nicht
// automatisch zu jedem Termin, in den die Vorlage spaeter geladen wird.
// Eine Stufe hat dasselbe Format wie eine Zeile in preisstaffeln (ohne
// stichtag_datum/waehrung/sortierung), damit Laden/Speichern 1:1 abbildet.

export type PreisstaffelVorlageStufe = {
  name: string;
  stichtag_tage_vor_start: number;
  preis: number;
};

export type PreisstaffelVorlage = {
  id: string;
  name: string;
  beschreibung: string | null;
  stufen: PreisstaffelVorlageStufe[];
  erstellt_am: string;
  aktualisiert_am: string;
};

// Prueft und normalisiert Stufen (aus dem Editor oder aus der DB) und wirft
// bei ungueltigen Eingaben einen deutschen, direkt anzeigbaren Fehler.
// Wird sowohl clientseitig (sofortiges Feedback im Editor) als auch in den
// Server Actions verwendet -- der Client ist nicht die einzige Absicherung.
// Rueckgabe sortiert nach Stichtag (groesste Tageszahl = fruehester Stichtag
// zuerst), dieselbe Reihenfolge wie sortierteStaffeln fuer relative Stufen.
export function normalisiereVorlageStufen(roh: unknown): PreisstaffelVorlageStufe[] {
  if (!Array.isArray(roh) || roh.length === 0) {
    throw new Error("Eine Vorlage braucht mindestens eine Preisstufe.");
  }
  const stufen = roh.map((s: any, i) => {
    const nr = i + 1;
    const name = String(s?.name ?? "").trim();
    if (!name) throw new Error(`Stufe ${nr}: Name fehlt.`);
    const tageRoh = s?.stichtag_tage_vor_start;
    const tage = tageRoh === "" || tageRoh === null || tageRoh === undefined ? NaN : Number(tageRoh);
    if (!Number.isInteger(tage) || tage < 0) {
      throw new Error(`Stufe ${nr} („${name}“): „Tage vor Start“ muss eine ganze Zahl ab 0 sein.`);
    }
    const preisRoh = s?.preis;
    const preis = preisRoh === "" || preisRoh === null || preisRoh === undefined ? NaN : Number(preisRoh);
    if (!Number.isFinite(preis) || preis < 0) {
      throw new Error(`Stufe ${nr} („${name}“): Preis fehlt oder ist ungültig.`);
    }
    return { name, stichtag_tage_vor_start: tage, preis: Math.round(preis * 100) / 100 };
  });

  // Zwei Stufen mit identischem Stichtag waeren fuer aktuellePreisstaffel
  // nicht unterscheidbar -- welche gilt, hinge zufaellig von der Reihenfolge ab.
  const gesehen = new Set<number>();
  for (const s of stufen) {
    if (gesehen.has(s.stichtag_tage_vor_start)) {
      throw new Error(`Zwei Stufen haben denselben Stichtag (${s.stichtag_tage_vor_start} Tage vor Start).`);
    }
    gesehen.add(s.stichtag_tage_vor_start);
  }

  return stufen.sort((a, b) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start);
}

// Eine Options-Preisstaffel laesst sich nur als Vorlage speichern, wenn keine
// Stufe ein festes Datum nutzt.
export function stufenMitFestemDatum<T extends Pick<Preisstaffel, "stichtag_datum">>(staffeln: T[]): T[] {
  return staffeln.filter((s) => !!s.stichtag_datum);
}
