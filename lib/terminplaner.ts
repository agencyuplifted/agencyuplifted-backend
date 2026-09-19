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
};

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
  einstellungen: { mindestabstand_tage: number; vorlauf_tage: number };
};

export async function ladePlanerDaten(jahr: number): Promise<PlanerDaten> {
  const supabase = getSupabaseAdmin();
  const von = `${jahr - 1}-11-01`;
  const bis = `${jahr + 1}-02-28`;
  const [f, k, b, t, v, e] = await Promise.all([
    supabase.from("ferien_kalender").select("land, region, typ, bezeichnung, von, bis, gewicht").lte("von", bis).gte("bis", von),
    supabase.from("konferenz_kalender").select("name, von, bis, gewicht").lte("von", bis).gte("bis", von),
    supabase.from("persoenliche_blocker").select("bezeichnung, monat, tag, puffer_vorher, puffer_nachher, hart").eq("aktiv", true),
    supabase.from("seminartermine").select("id, kennung, titel, datum_start, datum_ende, vorabend_anreise_datum").neq("status", "abgesagt").is("deaktiviert_am", null).gte("datum_start", von).lte("datum_start", bis),
    supabase.from("terminvorschlaege").select("id, datum_start, datum_ende, anreise_datum, status").in("status", ["in_pruefung"]),
    supabase.from("terminplaner_einstellungen").select("mindestabstand_tage, vorlauf_tage").eq("id", 1).maybeSingle(),
  ]);
  return {
    ferien: (f.data || []).map((x: any) => ({ ...x, gewicht: Number(x.gewicht) })),
    konferenzen: k.data || [],
    blocker: b.data || [],
    termine: t.data || [],
    vorschlaege: v.data || [],
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
      if (abstand < daten.einstellungen.mindestabstand_tage) {
        const text = `Nur ${abstand} Tage Abstand zu ${name} (Mindestabstand ${daten.einstellungen.mindestabstand_tage})`;
        gesperrt ||= text;
        gruende.push({ art: "termin", text, punkte: -30 });
      }
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
  for (const [land, e] of [...proLand.entries()].sort((a, b) => (a[0] === "BY" ? -1 : b[0] === "BY" ? 1 : 0))) {
    const deckel = DECKEL[land] ?? 15;
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

  const score = Math.max(0, Math.min(100, 100 + gruende.reduce((s, g) => s + g.punkte, 0)));
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
