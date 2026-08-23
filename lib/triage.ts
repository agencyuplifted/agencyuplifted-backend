import { getSupabaseAdmin } from "./supabase";

// Phase-0-Triage der 80 Alt-Entwuerfe aus dem Contao-Import (agencyuplifted.de/blog).
// Ziel: nicht "neuen Content planen, ohne den Blog-Berg zu kennen", sondern erst
// entscheiden, was mit den vorhandenen ~80 Entwuerfen passiert -- viele sind kurze,
// pointierte Einzelgedanken (ideal als FAQ/Glossar-Baustein in einem Pillar), einige
// sind bereits selbst umfangreich genug fuer einen eigenen Deep-Dive.

export const TRIAGE_AKTION = [
  "pruefen",
  "direkt_veroeffentlichen",
  "ki_redigieren_klein",
  "cluster_sammeln",
  "ueberarbeiten_gross",
  "verwerfen",
] as const;
export type TriageAktion = (typeof TRIAGE_AKTION)[number];

export const TRIAGE_AKTION_LABEL: Record<TriageAktion, string> = {
  pruefen: "Noch prüfen",
  direkt_veroeffentlichen: "Direkt veröffentlichen",
  ki_redigieren_klein: "KI redigieren (klein/eigenständig)",
  cluster_sammeln: "Cluster-Kandidat (zusammenführen)",
  ueberarbeiten_gross: "Groß überarbeiten (Deep-Dive-Format)",
  verwerfen: "Verwerfen",
};

export const TRIAGE_AKTION_BADGE: Record<TriageAktion, string> = {
  pruefen: "au-badge-neutral",
  direkt_veroeffentlichen: "au-badge-success",
  ki_redigieren_klein: "au-badge-gold",
  cluster_sammeln: "au-badge-warning",
  ueberarbeiten_gross: "au-badge-warning",
  verwerfen: "au-badge-danger",
};

export type Groesse = "klein" | "mittel" | "gross";

export const GROESSE_LABEL: Record<Groesse, string> = {
  klein: "Klein",
  mittel: "Mittel",
  gross: "Groß",
};

// Schwellwerte anhand der tatsaechlichen Verteilung der 80 Alt-Entwuerfe gewaehlt
// (Textlaenge von suchtext, das automatisch aus den Bloecken generiert wird):
// unter ~2.500 Zeichen sind es meist einzelne pointierte Gedanken (FAQ/Glossar-
// Baustein), ueber ~7.000 Zeichen sind es bereits eigenstaendige, umfangreiche
// Artikel, die eher ins Deep-Dive-Format ueberfuehrt als "klein redigiert" werden.
export function ermittleGroesse(textLen: number): Groesse {
  if (textLen < 2500) return "klein";
  if (textLen < 7000) return "mittel";
  return "gross";
}

export type TriageEintrag = {
  id: string;
  titel: string;
  status: string;
  quelle_typ: string;
  kategorie: string | null;
  block_count: number;
  text_len: number;
  groesse: Groesse;
  triage_aktion: TriageAktion;
  triage_cluster_label: string | null;
  erstellt_am: string | null;
};

export async function ladeTriageEintraege(filter?: { kategorie?: string; groesse?: Groesse; aktion?: TriageAktion }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("insights_eintraege")
    .select(
      "id, titel, status, quelle_typ, bloecke, suchtext, triage_aktion, triage_cluster_label, erstellt_am, insights_eintrag_kategorien(ist_hauptkategorie, insights_kategorien(name))"
    )
    .neq("status", "veroeffentlicht")
    .order("erstellt_am", { ascending: true });

  if (error) throw new Error(error.message);

  let eintraege: TriageEintrag[] = (data || []).map((e: any) => {
    const hauptkategorie =
      (e.insights_eintrag_kategorien || []).find((k: any) => k.ist_hauptkategorie)?.insights_kategorien?.name ||
      (e.insights_eintrag_kategorien || [])[0]?.insights_kategorien?.name ||
      null;
    const textLen = (e.suchtext || "").length;
    return {
      id: e.id,
      titel: e.titel,
      status: e.status,
      quelle_typ: e.quelle_typ,
      kategorie: hauptkategorie,
      block_count: Array.isArray(e.bloecke) ? e.bloecke.length : 0,
      text_len: textLen,
      groesse: ermittleGroesse(textLen),
      triage_aktion: e.triage_aktion || "pruefen",
      triage_cluster_label: e.triage_cluster_label,
      erstellt_am: e.erstellt_am,
    };
  });

  if (filter?.kategorie) eintraege = eintraege.filter((e) => e.kategorie === filter.kategorie);
  if (filter?.groesse) eintraege = eintraege.filter((e) => e.groesse === filter.groesse);
  if (filter?.aktion) eintraege = eintraege.filter((e) => e.triage_aktion === filter.aktion);

  return eintraege;
}
