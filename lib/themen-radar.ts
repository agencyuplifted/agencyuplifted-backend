import { getSupabaseAdmin } from "./supabase";

// Themen-Radar v1 (ohne GSC) -- Ideen-Pipeline fuer Insights/Blog + LinkedIn-Zweitverwertung.
// Quellen aktuell: manuell eingetragen + Google Autocomplete (kostenlos, unauthentifiziert).
// GSC folgt als weitere Quelle, sobald Search Console fuer die Domain eingerichtet ist --
// das Datenmodell (Spalte "quelle") ist dafuer bereits vorbereitet.

export const CLUSTER = [
  "Preisfindung",
  "Führung",
  "Organisation & Zusammenarbeit",
  "Fokussierung/Akquise",
  "Sonstige",
] as const;
export type ThemenRadarCluster = (typeof CLUSTER)[number];

export const STATUS = ["neu", "vorgemerkt", "in_arbeit", "veroeffentlicht", "verworfen"] as const;
export type ThemenRadarStatus = (typeof STATUS)[number];

export const STATUS_LABEL: Record<ThemenRadarStatus, string> = {
  neu: "Neu",
  vorgemerkt: "Vorgemerkt",
  in_arbeit: "In Arbeit",
  veroeffentlicht: "Veröffentlicht",
  verworfen: "Verworfen",
};

export const QUELLE_LABEL: Record<string, string> = {
  manuell: "Manuell",
  autocomplete: "Autocomplete",
  gsc: "Search Console",
};

export type ThemenRadarIdee = {
  id: string;
  thema: string;
  cluster: string;
  quelle: string;
  status: string;
  fuer_linkedin: boolean;
  notiz: string | null;
  insights_eintrag_id: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
};

export async function ladeThemenRadarIdeen(filter?: {
  cluster?: string;
  status?: string;
}): Promise<ThemenRadarIdee[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("themen_radar_ideen")
    .select("*")
    .order("status", { ascending: true })
    .order("erstellt_am", { ascending: false });
  if (filter?.cluster) query = query.eq("cluster", filter.cluster);
  if (filter?.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as ThemenRadarIdee[];
}

// Fuer das Uebersicht-Tab: die naechsten offenen Ideen (nicht verworfen/veroeffentlicht).
export async function ladeNaechsteThemenRadarIdeen(limit = 3): Promise<ThemenRadarIdee[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("themen_radar_ideen")
    .select("*")
    .in("status", ["neu", "vorgemerkt", "in_arbeit"])
    .order("erstellt_am", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as ThemenRadarIdee[];
}

// Google Autocomplete: kostenlose, unauthentifizierte Suggest-API. Kein API-Key noetig,
// liefert verwandte Suchanfragen zu einem Startbegriff -- fuer interne Recherche stabil
// genug, ersetzt aber keine offizielle API (daher bewusst nur als Vorschlagsquelle,
// nicht automatisiert nachgeladen).
export async function holeAutocompleteVorschlaege(seed: string): Promise<string[]> {
  const trimmed = seed.trim();
  if (!trimmed) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=de&q=${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Autocomplete-Abfrage fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as [string, string[]];
  const vorschlaege = Array.isArray(data?.[1]) ? data[1] : [];
  // Duplikate raus, Startbegriff selbst nicht doppelt anzeigen
  return Array.from(new Set(vorschlaege)).filter((v) => v.toLowerCase() !== trimmed.toLowerCase());
}
