import { getSupabaseAdmin } from "./supabase";

// Seminar-Terminplaner: erzeugt moegliche Termine fuer ein Zieljahr und
// bewertet jeden Kandidaten nachvollziehbar (jeder Abzug/Bonus als eigene
// Zeile in `gruende`, keine Black Box). Harte Grenzen ("gesperrt"): Kollision
// oder zu wenig Abstand zu einem eigenen Seminartermin, harter persoenlicher
// Blocker, zu kurzer Vorlauf. Bei manuell gewaehlten Terminen sind das nur
// Warnungen -- ausser der Kollision, die muss ausdruecklich bestaetigt werden.

const TAG_MS = 86_400_000;
const d = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const isoPlus = (iso: string, tage: number) => new Date(d(iso) + tage * TAG_MS).toISOString().slice(0, 10);
const tageZwischen = (a: string, b: string) => Math.round((d(b) - d(a)) / TAG_MS);
/** ISO-Wochentag 1=Mo … 7=So */
export const wochentag = (iso: string) => ((new Date(d(iso)).getUTCDay() + 6) % 7) + 1;
const ueberlappt = (aVon: string, aBis: string, bVon: string, bBis: string) => aVon <= bBis && bVon <= aBis;

export type Format = {
  id: string;
  name: string;
  start_wochentag: number | null;
  seminar_tage: number;
  halbtag: boolean;
  vorabend: boolean;
  abendprogramm: boolean;
  start_uhrzeit?: string | null;
  end_uhrzeit?: string | null;
  /** false = Abend-/Halbtagsformat: keine Hotelanfrage, Location direkt */
  benoetigt_uebernachtung?: boolean;
  /** abschlag = Ferien meiden (Skills-Trainings), neutral = egal, bonus = bewusst in Ferien (Erlebnis/Retreat) */
  ferien_gewichtung_modus?: "abschlag" | "neutral" | "bonus";
  /** null/undefined = Standard aus den Einstellungen */
  mindestabstand_tage?: number | null;
  /** seminar = wird zum seminartermin; online/praesenz = eigene Terminart, im Planer nur "fest eingeplant" */
  terminart?: Terminart;
  serien_regel?: SerienRegel | null;
  farbe?: string | null;
};

export type Terminart = "seminar" | "online" | "praesenz";
export const TERMINART_LABEL: Record<Terminart, string> = { seminar: "Seminar", online: "Online", praesenz: "Präsenz (kein Seminar)" };

export type Rhythmus = "monatlich" | "zweimonatlich" | "quartalsweise" | "halbjaehrlich" | "jaehrlich";
export const RHYTHMUS_MONATE: Record<Rhythmus, number> = { monatlich: 1, zweimonatlich: 2, quartalsweise: 3, halbjaehrlich: 6, jaehrlich: 12 };
export const RHYTHMUS_LABEL: Record<Rhythmus, string> = {
  monatlich: "monatlich",
  zweimonatlich: "alle 2 Monate",
  quartalsweise: "quartalsweise",
  halbjaehrlich: "halbjährlich",
  jaehrlich: "jährlich",
};

/**
 * Serie eines Formats pro Kalenderjahr. modus "regel" = feste Routine (z. B.
 * 2. Freitag im Monat), von der nur bei Konflikt abgewichen wird -- Teilnehmer
 * koennen sich den Rhythmus merken. modus "bester_tag" = je Periode der
 * bestbewertete Tag (fuer Praesenz-Formate ohne feste Routine).
 */
export type SerienRegel = {
  rhythmus: Rhythmus;
  start_monat: number;
  modus: "regel" | "bester_tag";
  woche_im_monat?: number | null; // 1-4, -1 = letzte
  wochentag?: number | null; // ISO 1=Mo
  wochentage?: number[] | null; // bester_tag: erlaubte Wochentage
};

export const istSeminarFormat = (f?: { terminart?: string | null } | null) => !f?.terminart || f.terminart === "seminar";

/** Mindestabstand fuer dieses Format (eigener Wert oder Standard) */
export const abstandFuer = (format: Format, daten: PlanerDaten) => format.mindestabstand_tage ?? daten.einstellungen.mindestabstand_tage;

export type Grund = { art: "ferien" | "konferenz" | "blocker" | "feiertag" | "termin" | "vorschlag" | "vorlauf" | "bonus"; text: string; punkte: number };

export type Bewertung = {
  datum_start: string;
  datum_ende: string;
  anreise_datum: string | null;
  score: number;
  gruende: Grund[];
  /** Grund, warum der Algorithmus diesen Termin nie vorschlaegt (manuell nur Warnung) */
  gesperrt: string | null;
  /** echte Ueberschneidung mit eigenem Seminartermin -> manuell nur mit Bestaetigung */
  kollision: string | null;
};

export type PlanerDaten = {
  ferien: { land: string; region: string | null; typ: string; bezeichnung: string; von: string; bis: string; gewicht: number }[];
  konferenzen: { name: string; von: string; bis: string; gewicht: number }[];
  blocker: { bezeichnung: string; monat: number; tag: number; puffer_vorher: number; puffer_nachher: number; hart: boolean }[];
  termine: { id: string; kennung: string | null; titel: string | null; datum_start: string; datum_ende: string | null; vorabend_anreise_datum: string | null }[];
  vorschlaege: { id: string; datum_start: string; datum_ende: string; anreise_datum: string | null; status: string }[];
  /** Im Planer fest eingeplante Termine der neuen Terminarten -- blockieren wie ein Seminar */
  fest: { id: string; datum_start: string; datum_ende: string; anreise_datum: string | null; name: string }[];
  einstellungen: { mindestabstand_tage: number; vorlauf_tage: number };
};

/** Ostersonntag (gregorianisch, Gauss/Anonymous-Algorithmus) */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31), tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

/**
 * Termine, die jedes Jahr automatisch gelten und nicht gepflegt werden muessen.
 * Karneval (Weiberfastnacht bis Rosenmontag): kein gesetzlicher Feiertag und
 * deshalb in keinem Ferienkalender, im Rheinland arbeiten Agenturen da aber
 * kaum. Haengt am Osterdatum (Weiberfastnacht = Ostern −52, Rosenmontag = −48).
 */
export function automatischeTermine(jahre: number[]): { name: string; von: string; bis: string; gewicht: number; automatisch: true }[] {
  return jahre.map((j) => {
    const ostern = ostersonntag(j);
    return { name: "Karneval (Weiberfastnacht bis Rosenmontag)", von: isoPlus(ostern, -52), bis: isoPlus(ostern, -48), gewicht: 2, automatisch: true as const };
  });
}

// Ferien fuer ein Jahr, das noch fehlt, beim ersten Aufruf selbst laden --
// hoechstens einmal pro Stunde und Server-Instanz versuchen, falls OpenHolidays
// fuer weit entfernte Jahre noch nichts hat.
const importVersuche = new Map<number, number>();
export async function stelleFerienSicher(jahr: number): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase.from("ferien_kalender").select("id", { count: "exact", head: true }).eq("jahr", jahr);
  if (count) return;
  const letzter = importVersuche.get(jahr) || 0;
  if (Date.now() - letzter < 3_600_000) return;
  importVersuche.set(jahr, Date.now());
  try {
    await importiereFerien(jahr);
  } catch (e: any) {
    console.error("Ferien-Import", jahr, e?.message);
  }
}

export async function ladePlanerDaten(jahr: number): Promise<PlanerDaten> {
  const supabase = getSupabaseAdmin();
  const von = `${jahr - 1}-11-01`;
  const bis = `${jahr + 1}-02-28`;
  const [f, k, b, t, v, e] = await Promise.all([
    supabase.from("ferien_kalender").select("land, region, typ, bezeichnung, von, bis, gewicht").lte("von", bis).gte("bis", von),
    supabase.from("konferenz_kalender").select("name, von, bis, gewicht").lte("von", bis).gte("bis", von),
    supabase.from("persoenliche_blocker").select("bezeichnung, monat, tag, puffer_vorher, puffer_nachher, hart").eq("aktiv", true),
    supabase.from("seminartermine").select("id, kennung, titel, datum_start, datum_ende, vorabend_anreise_datum").neq("status", "abgesagt").is("deaktiviert_am", null).gte("datum_start", von).lte("datum_start", bis),
    supabase
      .from("terminvorschlaege")
      .select("id, datum_start, datum_ende, anreise_datum, status, termin_formate(name)")
      .in("status", ["in_pruefung", "fest"])
      .lte("datum_start", bis)
      .gte("datum_ende", von),
    supabase.from("terminplaner_einstellungen").select("mindestabstand_tage, vorlauf_tage").eq("id", 1).maybeSingle(),
  ]);
  return {
    ferien: (f.data || []).map((x: any) => ({ ...x, gewicht: Number(x.gewicht) })),
    konferenzen: [...(k.data || []), ...automatischeTermine([jahr - 1, jahr, jahr + 1]).filter((a) => a.bis >= von && a.von <= bis)],
    blocker: b.data || [],
    termine: t.data || [],
    vorschlaege: (v.data || []).filter((x: any) => x.status === "in_pruefung"),
    fest: (v.data || [])
      .filter((x: any) => x.status === "fest")
      .map((x: any) => ({ id: x.id, datum_start: x.datum_start, datum_ende: x.datum_ende, anreise_datum: x.anreise_datum, name: x.termin_formate?.name || "Termin" })),
    einstellungen: e.data || { mindestabstand_tage: 14, vorlauf_tage: 60 },
  };
}

/** Belegte Tage eines Kandidaten: Anreise (falls Vorabend) bis letzter Seminartag */
export function kandidat(start: string, format: Format) {
  const ende = isoPlus(start, format.seminar_tage - 1);
  return { datum_start: start, datum_ende: ende, anreise_datum: format.vorabend ? isoPlus(start, -1) : null };
}

const fmt = (iso: string) => {
  const [y, m, t] = iso.split("-");
  return `${t}.${m}.${y.slice(2)}`;
};

export function bewerte(start: string, format: Format, daten: PlanerDaten, heute: string, ausser?: { vorschlagId?: string }): Bewertung {
  const k = kandidat(start, format);
  const belegtVon = k.anreise_datum || k.datum_start;
  const belegtBis = k.datum_ende;
  const gruende: Grund[] = [];
  let gesperrt: string | null = null;
  let kollision: string | null = null;
  const mindestabstand = abstandFuer(format, daten);

  // Eigene Seminartermine: Ueberschneidung = Kollision, zu nah = gesperrt
  for (const t of daten.termine) {
    const tVon = t.vorabend_anreise_datum || t.datum_start;
    const tBis = t.datum_ende || t.datum_start;
    const name = t.kennung || t.titel || "Seminar";
    if (ueberlappt(belegtVon, belegtBis, tVon, tBis)) {
      kollision = `Überschneidet sich mit ${name} (${fmt(t.datum_start)}–${fmt(tBis)})`;
      gruende.push({ art: "termin", text: kollision, punkte: -100 });
    } else {
      const abstand = belegtBis < tVon ? tageZwischen(belegtBis, tVon) : tageZwischen(tBis, belegtVon);
      if (abstand < mindestabstand) {
        const text = `Nur ${abstand} Tage Abstand zu ${name} (Mindestabstand ${mindestabstand})`;
        gesperrt ||= text;
        gruende.push({ art: "termin", text, punkte: -30 });
      }
    }
  }
  // Fest eingeplante Termine (Sparrings, Sessions, Uplift-Days …): Ueberschneidung
  // wie bei einem Seminar = Kollision (manuell uebergehbar), aber kein
  // Mindestabstand -- ein 3-Stunden-Online-Termin soll keine zwei Wochen sperren.
  for (const f of daten.fest || []) {
    if (f.id === ausser?.vorschlagId) continue;
    if (ueberlappt(belegtVon, belegtBis, f.anreise_datum || f.datum_start, f.datum_ende)) {
      const text = `Überschneidet sich mit fest eingeplantem ${f.name} (${fmt(f.datum_start)})`;
      kollision ||= text;
      gruende.push({ art: "termin", text, punkte: -100 });
    }
  }
  // Termine "in Prüfung" beim Hotel: noch nicht fest, aber praktisch belegt
  for (const v of daten.vorschlaege) {
    if (v.id === ausser?.vorschlagId) continue;
    if (ueberlappt(belegtVon, belegtBis, v.anreise_datum || v.datum_start, v.datum_ende)) {
      gruende.push({ art: "vorschlag", text: `Überschneidet sich mit Kandidat in Prüfung (${fmt(v.datum_start)})`, punkte: -40 });
    }
  }

  // Vorlauf
  const vorlauf = tageZwischen(heute, belegtVon);
  if (vorlauf < daten.einstellungen.vorlauf_tage) {
    const text = vorlauf < 0 ? "Liegt in der Vergangenheit" : `Nur ${vorlauf} Tage Vorlauf (mindestens ${daten.einstellungen.vorlauf_tage})`;
    gesperrt ||= text;
    gruende.push({ art: "vorlauf", text, punkte: -20 });
  }

  // Persoenliche Blocker (jaehrlich wiederkehrend, mit Puffer)
  for (const b of daten.blocker) {
    for (const jahr of [Number(belegtVon.slice(0, 4)), Number(belegtBis.slice(0, 4))]) {
      const tag = `${jahr}-${String(b.monat).padStart(2, "0")}-${String(b.tag).padStart(2, "0")}`;
      if (ueberlappt(belegtVon, belegtBis, isoPlus(tag, -b.puffer_vorher), isoPlus(tag, b.puffer_nachher))) {
        const text = `${b.bezeichnung}${b.puffer_vorher || b.puffer_nachher ? " (inkl. Puffer)" : ""}`;
        if (b.hart) gesperrt ||= text;
        gruende.push({ art: "blocker", text: b.hart ? `${text} – NOGO` : text, punkte: b.hart ? -100 : -25 });
        break;
      }
    }
  }

  // Konferenzen (±1 Tag Vor-/Nachlauf), Abzug nach Gewicht
  for (const c of daten.konferenzen) {
    if (ueberlappt(belegtVon, belegtBis, isoPlus(c.von, -1), isoPlus(c.bis, 1))) {
      gruende.push({ art: "konferenz", text: `${c.name} (${fmt(c.von)}–${fmt(c.bis)}, Gewicht ${c.gewicht})`, punkte: -10 * c.gewicht });
    }
  }

  // Schulferien: gestuft -- Ueberschneidung voll, 1–2 Tage davor/danach leicht.
  // Pro Land zusammengefasst (sonst ergaeben 16 Bundeslaender im Sommer -128),
  // Bayern als eigene, staerkere Gruppe (Standort Illschwang, Vorgabe "Bayern
  // hoeher gewichten") -- im Sammelabzug "Deutschland" ging es sonst unter.
  const proLand = new Map<string, { voll: string[]; nah: string[]; punkte: number }>();
  for (const f of daten.ferien) {
    if (f.typ === "feiertag") continue;
    const voll = ueberlappt(belegtVon, belegtBis, f.von, f.bis);
    const nah = !voll && ueberlappt(belegtVon, belegtBis, isoPlus(f.von, -2), isoPlus(f.bis, 2));
    if (!voll && !nah) continue;
    const gruppe = f.land === "DE" && f.region === "BY" ? "BY" : f.land;
    const eintrag = proLand.get(gruppe) || { voll: [], nah: [], punkte: 0 };
    const regionName = f.region || f.land;
    (voll ? eintrag.voll : eintrag.nah).push(regionName);
    eintrag.punkte += gruppe === "BY" ? (voll ? 12 : 3) * f.gewicht : (voll ? 6 : 2) * f.gewicht;
    proLand.set(gruppe, eintrag);
  }
  const LANDNAME: Record<string, string> = { BY: "Bayern", DE: "übrige Bundesländer", AT: "Österreich", CH: "Schweiz" };
  const DECKEL: Record<string, number> = { BY: 40, DE: 30, AT: 15, CH: 12 };
  // Ferien-Wertung pro Format: Skills-Trainings meiden Ferien (Abschlag),
  // Erlebnis-/Community-Formate liegen bewusst darin (Bonus, halbe Staerke,
  // nur echte Ueberschneidung), manche Formate sind davon unabhaengig (neutral).
  const modus = format.ferien_gewichtung_modus || "abschlag";
  for (const [land, e] of [...proLand.entries()].sort((a, b) => (a[0] === "BY" ? -1 : b[0] === "BY" ? 1 : 0))) {
    const deckel = DECKEL[land] ?? 15;
    if (modus === "neutral") {
      if (e.voll.length && !gruende.some((g) => g.art === "ferien" && g.punkte === 0)) {
        gruende.push({ art: "ferien", text: "Ferienzeit – für dieses Format nicht gewertet", punkte: 0 });
      }
      continue;
    }
    if (modus === "bonus") {
      if (!e.voll.length) continue;
      const bonus = Math.round(Math.min(deckel, e.punkte) / 2);
      gruende.push({ art: "bonus", text: `${LANDNAME[land] || land}: Ferienzeit – für dieses Format erwünscht`, punkte: bonus });
      continue;
    }
    const punkte = -Math.min(deckel, Math.round(e.punkte));
    const teile = land === "BY"
      ? [e.voll.length ? "Schulferien" : "direkt vor/nach Schulferien"]
      : [
      e.voll.length ? `Ferien in ${[...new Set(e.voll)].slice(0, 6).join(", ")}${e.voll.length > 6 ? ` +${new Set(e.voll).size - 6}` : ""}` : null,
      e.nah.length ? `direkt vor/nach Ferien in ${[...new Set(e.nah)].slice(0, 4).join(", ")}${new Set(e.nah).size > 4 ? " …" : ""}` : null,
    ].filter(Boolean);
    gruende.push({ art: "ferien", text: `${LANDNAME[land] || land}: ${teile.join("; ")}`, punkte });
  }

  // Feiertage (bundesweit oder Bayern): auf einem Seminartag = Abzug;
  // Feiertag kurz nach dem Seminar = leichter Bonus (Brueckentag-Effekt)
  const feiertage = daten.ferien.filter((f) => f.typ === "feiertag" && f.land === "DE" && (!f.region || f.region === "BY"));
  for (const f of feiertage) {
    if (ueberlappt(belegtVon, belegtBis, f.von, f.bis)) {
      gruende.push({ art: "feiertag", text: `${f.bezeichnung} (${fmt(f.von)})`, punkte: -15 });
    } else if (f.von > belegtBis && tageZwischen(belegtBis, f.von) <= 3 && wochentag(f.von) <= 5) {
      gruende.push({ art: "bonus", text: `Kurz vor ${f.bezeichnung} – Brückentag-Effekt`, punkte: 5 });
    }
  }

  // Ueber 100 nur durch Boni (Brueckentag, Ferien bei Erlebnisformaten)
  const score = Math.max(0, Math.min(120, 100 + gruende.reduce((s, g) => s + g.punkte, 0)));
  return { ...k, score, gruende, gesperrt, kollision };
}

/** Alle moeglichen Startdaten im Zeitraum, passend zum Format, bewertet und sortiert */
export function generiere(von: string, bis: string, format: Format, daten: PlanerDaten, heute: string): Bewertung[] {
  const ergebnis: Bewertung[] = [];
  for (let tag = von; tag <= bis; tag = isoPlus(tag, 1)) {
    if (format.start_wochentag ? wochentag(tag) !== format.start_wochentag : wochentag(tag) > 5) continue;
    // Seminartage muessen Werktage sein (Wochenende nur, wenn das Format dort startet)
    if (!format.start_wochentag) {
      let werktage = true;
      for (let i = 0; i < format.seminar_tage; i++) if (wochentag(isoPlus(tag, i)) > 5) werktage = false;
      if (!werktage) continue;
    }
    const b = bewerte(tag, format, daten, heute);
    if (!b.gesperrt && !b.kollision) ergebnis.push(b);
  }
  return ergebnis.sort((a, b) => b.score - a.score || a.datum_start.localeCompare(b.datum_start));
}

export function zeitraumGrenzen(jahr: number, zeitraum: string): [string, string] {
  const q: Record<string, [string, string]> = {
    jahr: ["01-01", "12-31"],
    H1: ["01-01", "06-30"],
    H2: ["07-01", "12-31"],
    Q1: ["01-01", "03-31"],
    Q2: ["04-01", "06-30"],
    Q3: ["07-01", "09-30"],
    Q4: ["10-01", "12-31"],
  };
  const [a, b] = q[zeitraum] || q.jahr;
  return [`${jahr}-${a}`, `${jahr}-${b}`];
}

/**
 * Beste, untereinander nicht kollidierende Auswahl (mit Mindestabstand) --
 * damit ein Bedarf von 2 Terminen nicht zwei Vorschlaege in derselben Woche bekommt.
 */
export function waehleVerteilt(kandidaten: Bewertung[], anzahl: number, mindestabstand: number): Bewertung[] {
  const gewaehlt: Bewertung[] = [];
  for (const k of kandidaten) {
    if (gewaehlt.length >= anzahl) break;
    const zuNah = gewaehlt.some((g) => Math.abs(tageZwischen(g.datum_start, k.datum_start)) < Math.max(mindestabstand, 7));
    if (!zuNah) gewaehlt.push(k);
  }
  return gewaehlt.sort((a, b) => a.datum_start.localeCompare(b.datum_start));
}

// ---------- Ferien/Feiertage aus OpenHolidays (openholidaysapi.org) ----------

const CH_KANTONE = ["ZH", "BE", "LU", "BS", "BL", "AG", "SG", "ZG", "SZ", "TG"];

function ferienTyp(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("sommer")) return "sommer";
  if (n.includes("oster") || n.includes("frühling")) return "ostern";
  if (n.includes("pfingst")) return "pfingsten";
  if (n.includes("herbst")) return "herbst";
  if (n.includes("weihnacht")) return "winter";
  if (n.includes("fasching") || n.includes("winter") || n.includes("sport") || n.includes("frühjahr") || n.includes("semester") || n.includes("energie")) return "fasching";
  return "sonstige";
}

/** Laedt Schulferien (DE, AT, ausgewaehlte CH-Kantone) und deutsche Feiertage fuer ein Jahr; bestehende Eintraege bleiben. */
export async function importiereFerien(jahr: number): Promise<{ neu: number }> {
  const basis = "https://openholidaysapi.org";
  const zeitraum = `validFrom=${jahr}-01-01&validTo=${jahr}-12-31&languageIsoCode=DE`;
  const hole = async (pfad: string) => {
    const r = await fetch(`${basis}/${pfad}&${zeitraum}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`OpenHolidays antwortet mit ${r.status}`);
    return (await r.json()) as any[];
  };
  const zeilen: any[] = [];
  for (const land of ["DE", "AT", "CH"]) {
    for (const h of await hole(`SchoolHolidays?countryIsoCode=${land}`)) {
      const name = h.name?.find((n: any) => n.language === "DE")?.text || h.name?.[0]?.text || "Ferien";
      const regionen: string[] = h.nationwide || !h.subdivisions?.length ? [""] : h.subdivisions.map((s: any) => s.shortName);
      for (const region of regionen) {
        if (land === "CH" && region && !CH_KANTONE.includes(region)) continue;
        zeilen.push({
          land,
          region: region || null,
          typ: ferienTyp(name),
          bezeichnung: name,
          von: h.startDate,
          bis: h.endDate,
          jahr,
          gewicht: land === "DE" && region === "BY" ? 3 : land === "CH" ? 0.5 : 1,
        });
      }
    }
  }
  for (const h of await hole("PublicHolidays?countryIsoCode=DE")) {
    const name = h.name?.find((n: any) => n.language === "DE")?.text || "Feiertag";
    const regionen: string[] = h.nationwide ? [""] : (h.subdivisions || []).map((s: any) => s.shortName);
    for (const region of regionen) {
      zeilen.push({ land: "DE", region: region || null, typ: "feiertag", bezeichnung: name, von: h.startDate, bis: h.endDate, jahr, gewicht: 1 });
    }
  }
  // Doppelte (gleicher Schluessel) vor dem Einfuegen entfernen
  const eindeutig = [...new Map(zeilen.map((z) => [`${z.land}|${z.region}|${z.typ}|${z.von}|${z.bezeichnung}`, z])).values()];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ferien_kalender")
    .upsert(eindeutig, { onConflict: "land,region,typ,von,bezeichnung", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return { neu: data?.length || 0 };
}

// ---------- Serien (Online-Routinen, halbjaehrliche Praesenz-Formate) ----------

/** n-ter Wochentag (ISO 1=Mo) eines Monats, n = -1 fuer den letzten */
export function nterWochentag(jahr: number, monat: number, n: number, wt: number): string {
  const erster = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  if (n > 0) {
    const versatz = (wt - wochentag(erster) + 7) % 7;
    return isoPlus(erster, versatz + (n - 1) * 7);
  }
  const letzter = isoPlus(monat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}-01`, -1);
  return isoPlus(letzter, -((wochentag(letzter) - wt + 7) % 7));
}

const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WT_KURZ = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WOCHE_TEXT: Record<string, string> = { "1": "1.", "2": "2.", "3": "3.", "4": "4.", "-1": "letzter" };

export function serienRegelText(r: SerienRegel): string {
  const basis = RHYTHMUS_LABEL[r.rhythmus] || r.rhythmus;
  if (r.modus === "regel" && r.woche_im_monat && r.wochentag) {
    const monate = RHYTHMUS_MONATE[r.rhythmus] > 1 ? ` (ab ${MONATE_KURZ[(r.start_monat || 1) - 1]})` : "";
    return `${basis}, ${WOCHE_TEXT[String(r.woche_im_monat)]} ${WT_KURZ[r.wochentag]} im Monat${monate}`;
  }
  const tage = r.wochentage?.length ? r.wochentage.map((w) => WT_KURZ[w]).join("/") : "Mo–Fr";
  return `${basis}, bester Tag je Periode (${tage})`;
}

/** Perioden eines Jahres, z. B. zweimonatlich ab Jan: Jan–Feb, Mär–Apr, … */
export function serienPerioden(jahr: number, r: SerienRegel): { label: string; von: string; bis: string; monat: number }[] {
  const schritt = RHYTHMUS_MONATE[r.rhythmus] || 1;
  const erster = (((r.start_monat || 1) - 1) % schritt) + 1;
  const perioden = [];
  for (let m = erster; m <= 12; m += schritt) {
    const bisMonat = Math.min(12, m + schritt - 1);
    const von = `${jahr}-${String(m).padStart(2, "0")}-01`;
    const bis = isoPlus(bisMonat === 12 ? `${jahr + 1}-01-01` : `${jahr}-${String(bisMonat + 1).padStart(2, "0")}-01`, -1);
    perioden.push({ label: schritt === 1 ? `${MONATE_KURZ[m - 1]} ${jahr}` : `${MONATE_KURZ[m - 1]}–${MONATE_KURZ[bisMonat - 1]} ${jahr}`, von, bis, monat: m });
  }
  return perioden;
}

export type SerienZeile = {
  periode: { label: string; von: string; bis: string };
  /** Termin laut Regel (nur modus "regel") */
  regeltag: Bewertung | null;
  /** Vorschlag des Planers: Regeltag oder Ausweichtag bzw. bester Tag */
  vorschlag: Bewertung | null;
  ausgewichen: boolean;
  /** schon vorhandener Kandidat/fester Termin dieses Formats in der Periode */
  vorhanden: { id: string; status: string; datum_start: string } | null;
};

// Regeltag "passt nicht", wenn er gesperrt ist, kollidiert oder einen
// spuerbaren Abzug hat (Feiertag -15, Blocker, Konferenz ab Gewicht 2 …).
// Ferien zaehlen bei neutralen Formaten ohnehin nicht.
const hatProblem = (b: Bewertung) => !!b.gesperrt || !!b.kollision || b.gruende.some((g) => g.punkte <= -15);

export function planeSerie(
  format: Format,
  jahr: number,
  daten: PlanerDaten,
  heute: string,
  bestehende: { id: string; format_id: string; status: string; datum_start: string }[]
): SerienZeile[] {
  const r = format.serien_regel;
  if (!r) return [];
  return serienPerioden(jahr, r).map((p) => {
    const vorhanden =
      bestehende
        .filter((k) => k.format_id === format.id && k.status !== "verworfen" && k.datum_start >= p.von && k.datum_start <= p.bis)
        .sort((a, b) => (a.status === "fest" ? -1 : b.status === "fest" ? 1 : 0))[0] || null;

    if (r.modus === "regel" && r.woche_im_monat && r.wochentag) {
      const tag = nterWochentag(jahr, p.monat, r.woche_im_monat, r.wochentag);
      const regeltag = bewerte(tag, format, daten, heute);
      if (!hatProblem(regeltag)) return { periode: p, regeltag, vorschlag: regeltag, ausgewichen: false, vorhanden };

      // Ausweichen: zuerst derselbe Wochentag eine Woche frueher/spaeter (die
      // Routine "freitags" bleibt), dann andere Werktage derselben Woche, dann
      // derselbe Wochentag +/-2 Wochen -- jeweils nur innerhalb der Periode.
      // (Erst "gleiche Woche" ergab in der Simulation oft einen Montag direkt
      // vor der Seminar-Anreise.)
      const montag = isoPlus(tag, 1 - wochentag(tag));
      const stufen: string[][] = [
        [isoPlus(tag, -7), isoPlus(tag, 7)],
        [0, 1, 2, 3, 4].map((i) => isoPlus(montag, i)).filter((t) => t !== tag),
        [isoPlus(tag, -14), isoPlus(tag, 14)],
      ];
      let fallback: Bewertung | null = null;
      for (const stufe of stufen) {
        const bewertet = stufe
          .filter((t) => t >= p.von && t <= p.bis)
          .map((t) => bewerte(t, format, daten, heute))
          .filter((b) => !b.gesperrt && !b.kollision)
          .sort((a, b) => b.score - a.score || Math.abs(tageZwischen(tag, a.datum_start)) - Math.abs(tageZwischen(tag, b.datum_start)));
        const gut = bewertet.find((b) => !hatProblem(b));
        if (gut) return { periode: p, regeltag, vorschlag: gut, ausgewichen: true, vorhanden };
        fallback ||= bewertet[0] || null;
      }
      // Nichts Besseres gefunden: Regeltag behalten, wenn er zumindest nicht
      // gesperrt ist -- sonst den am wenigsten schlechten Ausweichtag.
      const vorschlag = !regeltag.gesperrt && !regeltag.kollision ? regeltag : fallback;
      return { periode: p, regeltag, vorschlag, ausgewichen: !!vorschlag && vorschlag !== regeltag, vorhanden };
    }

    // bester_tag: alle passenden Tage der Periode bewerten, bester gewinnt
    const erlaubt = r.wochentage?.length ? r.wochentage : null;
    const beste = generiere(p.von, p.bis, format, daten, heute).filter((b) => !erlaubt || erlaubt.includes(wochentag(b.datum_start)));
    // Unter den (fast) gleich guten Tagen den zur Periodenmitte naechsten --
    // sonst landet z. B. ein halbjaehrlicher Uplift-Day immer Anfang Januar/Juli
    // und die beiden Termine liegen nicht sinnvoll verteilt.
    const mitte = isoPlus(p.von, Math.floor(tageZwischen(p.von, p.bis) / 2));
    const spitze = beste.length ? beste[0].score : 0;
    const vorschlag =
      beste
        .filter((b) => b.score >= spitze - 5)
        .sort((a, b) => Math.abs(tageZwischen(mitte, a.datum_start)) - Math.abs(tageZwischen(mitte, b.datum_start)) || b.score - a.score)[0] || null;
    return { periode: p, regeltag: null, vorschlag, ausgewichen: false, vorhanden };
  });
}

export function normalisiereSerienRegel(roh: Record<string, FormDataEntryValue | null>): SerienRegel | null {
  const rhythmus = String(roh.rhythmus || "");
  if (!rhythmus || !(rhythmus in RHYTHMUS_MONATE)) return null;
  const modus = roh.modus === "bester_tag" ? "bester_tag" : "regel";
  const zahl = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
  const woche = zahl(roh.woche_im_monat);
  const wt = zahl(roh.wochentag);
  const regel: SerienRegel = {
    rhythmus: rhythmus as Rhythmus,
    start_monat: Math.min(12, Math.max(1, zahl(roh.start_monat) || 1)),
    modus,
  };
  if (modus === "regel") {
    if (!woche || ![1, 2, 3, 4, -1].includes(woche) || !wt || wt < 1 || wt > 7) {
      throw new Error("Für eine feste Regel bitte Woche im Monat und Wochentag wählen.");
    }
    regel.woche_im_monat = woche;
    regel.wochentag = wt;
  } else {
    const tage = String(roh.wochentage || "")
      .split(",")
      .map(Number)
      .filter((n) => n >= 1 && n <= 7);
    regel.wochentage = tage.length ? [...new Set(tage)].sort() : null;
  }
  return regel;
}
