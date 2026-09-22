import { getSupabaseAdmin } from "./supabase";

// Programme (eigener Navigationsbereich): Foundation, Uplift, Advance. Welche
// Termine ein Programm-Kalender zeigt, ergibt sich dynamisch aus der
// Zuordnung -- Seminarkategorien (seminartypen.programm) fuer Seminartermine
// und Planer-Formate (termin_formate.programm) fuer die neuen Terminarten
// (Sparrings, Sessions, Days …). Nichts wird pro Termin gepflegt.

export type ProgrammKey = "foundation" | "uplift" | "advance";

export const PROGRAMME: Record<ProgrammKey, { titel: string; beschreibung: string }> = {
  foundation: {
    titel: "Foundation",
    beschreibung: "Seminare der Foundation-Kategorien und Foundation-Sparrings.",
  },
  uplift: {
    titel: "Uplift",
    beschreibung: "Uplift-Sessions, Uplift-Days und Retreat.",
  },
  advance: {
    titel: "Advance",
    beschreibung: "Hier kommt noch nichts rein – Platzhalter für das künftige Angebot.",
  },
};

export const PROGRAMM_KEYS = Object.keys(PROGRAMME) as ProgrammKey[];

export function istProgramm(wert: string | null | undefined): wert is ProgrammKey {
  return !!wert && wert in PROGRAMME;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Kalender eines Programms: feste Seminartermine + im Planer fest eingeplante
 * Termine (vollflaechig) und noch vorgeplante Kandidaten (gestrichelt "?").
 * Zeitraum wie in /termine: ab Vormonat bis zum letzten Eintrag, mindestens
 * 12 Monate (Programme werden weit voraus geplant), hoechstens 36.
 */
export async function ladeProgrammKalender(programm: ProgrammKey) {
  const supabase = getSupabaseAdmin();
  const heute = new Date();
  const von = iso(new Date(heute.getFullYear(), heute.getMonth() - 1, 1));
  const bisMax = iso(new Date(heute.getFullYear(), heute.getMonth() + 36, 0));

  const [{ data: seminare }, { data: vorschlaege }] = await Promise.all([
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, datum_ende, kapazitaet, seminartypen!inner(name, farbe, programm)")
      .eq("seminartypen.programm", programm)
      .neq("status", "abgesagt")
      .is("deaktiviert_am", null)
      .gte("datum_start", von)
      .lte("datum_start", bisMax)
      .order("datum_start"),
    supabase
      .from("terminvorschlaege")
      .select("id, datum_start, datum_ende, anreise_datum, status, start_uhrzeit, seminartypen(name, farbe, programm), termin_formate(name, farbe, programm, terminart)")
      .in("status", ["vorgeschlagen", "in_pruefung", "fest"])
      .gte("datum_start", von)
      .lte("datum_start", bisMax),
  ]);

  // Kandidat gehoert zum Programm: neue Terminarten ueber ihr Format,
  // Seminar-Kandidaten ueber ihre Kategorie
  const imProgramm = (v: any) =>
    v.termin_formate?.terminart && v.termin_formate.terminart !== "seminar"
      ? v.termin_formate.programm === programm
      : v.seminartypen?.programm === programm;

  const eintraege = [
    ...(seminare || []),
    ...(vorschlaege || [])
      .filter(imProgramm)
      .map((v: any) => ({ ...v, id: `v-${v.id}`, fest: v.status === "fest", vorgeplant: v.status !== "fest" })),
  ];

  const letzter = eintraege.reduce((max: string, t: any) => ((t.datum_ende || t.datum_start) > max ? t.datum_ende || t.datum_start : max), iso(heute));
  const [lJahr, lMonat] = letzter.split("-").map(Number);
  const anzahl = Math.min(36, Math.max(12, (lJahr - heute.getFullYear()) * 12 + (lMonat - 1 - heute.getMonth()) + 2));
  const monate = Array.from({ length: anzahl }, (_, i) => {
    const d = new Date(heute.getFullYear(), heute.getMonth() - 1 + i, 1);
    return { jahr: d.getFullYear(), monatIndex: d.getMonth() };
  });

  const zaehler = {
    seminare: (seminare || []).length,
    fest: eintraege.filter((t: any) => t.fest).length,
    vorgeplant: eintraege.filter((t: any) => t.vorgeplant).length,
  };

  return { eintraege, monate, zaehler, heuteISO: iso(heute) };
}
