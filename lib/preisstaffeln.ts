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

// Letzter Kalendertag (YYYY-MM-DD, Berliner Zeit), an dem die Stufe noch
// gilt -- fuer die Backstage-Anzeige "gilt bis einschl. ...". Die beiden
// Stichtag-Arten enden zu unterschiedlichen Uhrzeiten: ein festes Datum um
// 23:59:59 Berlin des gewaehlten Tages (stichtagsDatumEndeDesTages), "N Tage
// vor Start" dagegen um 00:00 UTC (= 01/02 Uhr Berlin) des N-ten Tages vor
// Start, faktisch also schon mit Ablauf des Vortags. Minus 3 Stunden landet
// in beiden Faellen sicher auf dem letzten vollen Gueltigkeitstag.
export function letzterGueltigerTag(
  staffel: Pick<Preisstaffel, "stichtag_tage_vor_start" | "stichtag_datum">,
  datumStart: string
): string {
  return berlinKalendertag(new Date(stichtagAlsZeitpunkt(staffel, datumStart) - 3 * 60 * 60 * 1000).toISOString());
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
  stichtag_regel: StichtagRegel | null;
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

// ---------------------------------------------------------------------------
// Stichtag-Regel einer Vorlage: verschiebt die Stichtage beim Laden in eine
// Option auf einen "guten" Kalendertag (z. B. nur Donnerstag, kein Sonntag,
// keine Feiertage) -- Hintergrund: an Sonntagen/Feiertagen konvertiert eine
// auslaufende Fruehbucherfrist schlechter.
//
// Bewusst NUR beim Laden ausgewertet (Ergebnis wird als festes stichtag_datum
// gespeichert), nicht live in stichtagAlsZeitpunkt: so bleiben Preislogik,
// oeffentliche API und die Onepage-Syncs unveraendert. Konsequenz: wird der
// Termin danach verschoben, wandern diese Stichtage nicht mit.

export type FeiertagsLand = "DE" | "AT" | "CH";

export type StichtagRegel = {
  wochentage: number[]; // erlaubte Wochentage, 0 = Sonntag ... 6 = Samstag (wie Date.getUTCDay)
  feiertage_laender: FeiertagsLand[];
  max_verschiebung_tage: number;
};

export const FEIERTAGS_LAENDER: FeiertagsLand[] = ["DE", "AT", "CH"];
export const WOCHENTAG_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

// Obergrenze fuer die Suche, falls innerhalb max_verschiebung_tage kein
// passender Tag existiert (z. B. "nur Donnerstag" +/- 2 und der naechste
// Donnerstag ist Christi Himmelfahrt) -- lieber weiter verschieben und
// deutlich warnen, als still auf einen Sonntag zu fallen.
const SUCHGRENZE_TAGE = 14;

export function normalisiereStichtagRegel(roh: unknown): StichtagRegel | null {
  if (roh === null || roh === undefined || roh === "") return null;
  if (typeof roh !== "object" || Array.isArray(roh)) throw new Error("Stichtag-Regel ist ungültig.");
  const r = roh as any;
  const wochentage = Array.from(
    new Set((Array.isArray(r.wochentage) ? r.wochentage : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6))
  ).sort() as number[];
  if (!wochentage.length) throw new Error("Stichtag-Regel: mindestens einen erlaubten Wochentag auswählen.");
  const feiertage_laender = FEIERTAGS_LAENDER.filter((l) => Array.isArray(r.feiertage_laender) && r.feiertage_laender.includes(l));
  const max = Number(r.max_verschiebung_tage);
  if (!Number.isInteger(max) || max < 0 || max > SUCHGRENZE_TAGE) {
    throw new Error(`Stichtag-Regel: maximale Verschiebung muss eine ganze Zahl von 0 bis ${SUCHGRENZE_TAGE} sein.`);
  }
  return { wochentage, feiertage_laender, max_verschiebung_tage: max };
}

export function stichtagRegelText(regel: StichtagRegel): string {
  const tage =
    regel.wochentage.length === 7
      ? "alle Wochentage"
      : [1, 2, 3, 4, 5, 6, 0].filter((w) => regel.wochentage.includes(w)).map((w) => WOCHENTAG_KURZ[w]).join(", ");
  const feiertage = regel.feiertage_laender.length ? `, keine Feiertage (${regel.feiertage_laender.join("/")})` : "";
  return `${tage}${feiertage}, max. ±${regel.max_verschiebung_tage} Tage`;
}

// --- Kalender-Hilfen auf reinen Kalendertagen (YYYY-MM-DD, UTC-Arithmetik,
// keine Uhrzeit/Zeitzone -- sonst verrutscht der Tag an DST-Grenzen).

function tagZuDate(iso: string): Date {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t));
}

function dateZuTag(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function tagePlus(iso: string, tage: number): string {
  const d = tagZuDate(iso);
  d.setUTCDate(d.getUTCDate() + tage);
  return dateZuTag(d);
}

export function wochentagVon(iso: string): number {
  return tagZuDate(iso).getUTCDay();
}

// Ostersonntag (gregorianisch, anonymer Algorithmus nach Meeus/Jones/Butcher).
function ostersonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return dateZuTag(new Date(Date.UTC(jahr, monat - 1, tag)));
}

// Landesweit geltende Feiertage. Regionale (Bundeslaender/Kantone, z. B.
// Fronleichnam in DE, Berchtoldstag in CH) sind bewusst nicht dabei -- Kunden
// kommen aus dem ganzen DACH-Raum, ein regionaler Feiertag trifft nur einen
// kleinen Teil. In CH ist nur der 1. August bundesrechtlich geregelt; die
// uebrigen hier sind in (fast) allen Kantonen arbeitsfrei.
function feiertageImJahr(jahr: number, land: FeiertagsLand): [string, string][] {
  const ostern = ostersonntag(jahr);
  const fest = (mmtt: string, name: string): [string, string] => [`${jahr}-${mmtt}`, name];
  const bewegl = (versatz: number, name: string): [string, string] => [tagePlus(ostern, versatz), name];

  if (land === "DE") {
    return [
      fest("01-01", "Neujahr"),
      bewegl(-2, "Karfreitag"),
      bewegl(1, "Ostermontag"),
      fest("05-01", "Tag der Arbeit"),
      bewegl(39, "Christi Himmelfahrt"),
      bewegl(50, "Pfingstmontag"),
      fest("10-03", "Tag der Deutschen Einheit"),
      fest("12-25", "1. Weihnachtstag"),
      fest("12-26", "2. Weihnachtstag"),
    ];
  }
  if (land === "AT") {
    return [
      fest("01-01", "Neujahr"),
      fest("01-06", "Heilige Drei Könige"),
      bewegl(1, "Ostermontag"),
      fest("05-01", "Staatsfeiertag"),
      bewegl(39, "Christi Himmelfahrt"),
      bewegl(50, "Pfingstmontag"),
      bewegl(60, "Fronleichnam"),
      fest("08-15", "Mariä Himmelfahrt"),
      fest("10-26", "Nationalfeiertag"),
      fest("11-01", "Allerheiligen"),
      fest("12-08", "Mariä Empfängnis"),
      fest("12-25", "Christtag"),
      fest("12-26", "Stefanitag"),
    ];
  }
  return [
    fest("01-01", "Neujahr"),
    bewegl(-2, "Karfreitag"),
    bewegl(1, "Ostermontag"),
    bewegl(39, "Auffahrt"),
    bewegl(50, "Pfingstmontag"),
    fest("08-01", "Bundesfeiertag"),
    fest("12-25", "Weihnachten"),
    fest("12-26", "Stephanstag"),
  ];
}

// Liefert z. B. "Christi Himmelfahrt (DE/AT/CH)" oder null.
export function feiertagAm(iso: string, laender: FeiertagsLand[]): string | null {
  const jahr = Number(iso.slice(0, 4));
  const treffer = new Map<string, FeiertagsLand[]>();
  for (const land of laender) {
    for (const [datum, name] of feiertageImJahr(jahr, land)) {
      if (datum === iso) treffer.set(name, [...(treffer.get(name) || []), land]);
    }
  }
  if (!treffer.size) return null;
  return Array.from(treffer.entries())
    .map(([name, l]) => `${name} (${l.join("/")})`)
    .join(", ");
}

function istErlaubterTag(iso: string, regel: StichtagRegel): boolean {
  return regel.wochentage.includes(wochentagVon(iso)) && !feiertagAm(iso, regel.feiertage_laender);
}

export type BerechneterStichtag = {
  ausgangstag: string; // Terminstart - X Tage (YYYY-MM-DD)
  stichtag: string; // nach Regel verschoben (YYYY-MM-DD)
  verschiebung: number; // in Tagen, negativ = frueher
  grund: string | null; // warum der Ausgangstag nicht passte
  ausserhalbMax: boolean; // kein passender Tag innerhalb max_verschiebung_tage
  gefunden: boolean; // false = auch bis SUCHGRENZE_TAGE nichts gefunden, Ausgangstag bleibt
};

// Kalendertag des Stichtags = Terminstart minus X Tage; die Stufe gilt bis
// 23:59 Uhr (Berlin) dieses Tages (siehe stichtagsDatumEndeDesTages). Der
// rein relative Modus laesst die Stufe dagegen schon um 00:00 UTC dieses
// Tages enden -- mit fester Regel gilt der Stichtag also ganztaegig, was fuer
// eine kommunizierte Frist ("nur noch bis Donnerstag") das Erwartete ist.
// Naechstgelegener erlaubter Tag gewinnt, bei Gleichstand der fruehere.
export function berechneStichtagMitRegel(terminDatumStart: string, tageVorStart: number, regel: StichtagRegel): BerechneterStichtag {
  const ausgangstag = tagePlus(terminDatumStart.slice(0, 10), -tageVorStart);
  const wochentagGrund = !regel.wochentage.includes(wochentagVon(ausgangstag)) ? WOCHENTAG_KURZ[wochentagVon(ausgangstag)] : null;
  const feiertag = feiertagAm(ausgangstag, regel.feiertage_laender);
  const grund = [wochentagGrund, feiertag].filter(Boolean).join(", ") || null;

  for (let abstand = 0; abstand <= SUCHGRENZE_TAGE; abstand++) {
    for (const verschiebung of abstand === 0 ? [0] : [-abstand, abstand]) {
      const kandidat = tagePlus(ausgangstag, verschiebung);
      // Nie auf oder nach den Terminstart schieben -- die Stufe waere sonst
      // bis zum Seminarbeginn gueltig und wuerde den Normalpreis verdraengen.
      if (kandidat >= terminDatumStart.slice(0, 10)) continue;
      if (istErlaubterTag(kandidat, regel)) {
        return {
          ausgangstag,
          stichtag: kandidat,
          verschiebung,
          grund,
          ausserhalbMax: abstand > regel.max_verschiebung_tage,
          gefunden: true,
        };
      }
    }
  }
  return { ausgangstag, stichtag: ausgangstag, verschiebung: 0, grund, ausserhalbMax: true, gefunden: false };
}

// Wendet die Regel auf alle Stufen an. Stufen mit 0 Tagen (Normalpreis bis
// Seminarstart) werden nie verschoben und bleiben relativ. Liefert zusaetzlich
// Kollisionen: durch das Verschieben koennen zwei Stufen auf denselben Tag
// fallen oder ihre Reihenfolge tauschen -- dann waere nicht eindeutig, welcher
// Preis gilt.
export function berechneVorlagenStichtage(
  stufen: PreisstaffelVorlageStufe[],
  terminDatumStart: string,
  regel: StichtagRegel
): { stichtage: (BerechneterStichtag | null)[]; kollision: string | null } {
  const stichtage = stufen.map((s) =>
    s.stichtag_tage_vor_start === 0 ? null : berechneStichtagMitRegel(terminDatumStart, s.stichtag_tage_vor_start, regel)
  );
  const sortiert = stufen
    .map((s, i) => ({ s, st: stichtage[i] }))
    .filter((x) => x.st)
    .sort((a, b) => b.s.stichtag_tage_vor_start - a.s.stichtag_tage_vor_start);
  let kollision: string | null = null;
  for (let i = 1; i < sortiert.length && !kollision; i++) {
    if (sortiert[i].st!.stichtag <= sortiert[i - 1].st!.stichtag) {
      kollision = `„${sortiert[i - 1].s.name}“ und „${sortiert[i].s.name}“ fallen nach dem Verschieben auf denselben Stichtag bzw. tauschen die Reihenfolge – Abstand zwischen den Stufen vergrößern oder Regel lockern.`;
    }
  }
  return { stichtage, kollision };
}

// "Do 10.09.2026" fuer einen reinen Kalendertag (YYYY-MM-DD).
export function formatKalendertag(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-");
  return `${WOCHENTAG_KURZ[wochentagVon(iso)]} ${t}.${m}.${j}`;
}
