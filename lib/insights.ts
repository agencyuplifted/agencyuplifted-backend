import { getSupabaseAdmin } from "./supabase";

export type InsightsTyp = "artikel" | "glossar" | "faq" | "guide";
export type InsightsStatus = "entwurf" | "review" | "veroeffentlicht" | "archiviert";

export type Block =
  | { typ: "absatz"; text: string }
  | { typ: "ueberschrift"; ebene: 2 | 3 | 4; text: string }
  | { typ: "liste"; stil: "ungeordnet" | "geordnet"; punkte: string[] }
  | { typ: "zitat"; text: string; quelle?: string }
  | { typ: "bild"; url: string; alt: string; bildunterschrift?: string }
  | { typ: "faq"; frage: string; antwort: string };

export type InsightsEintrag = {
  id: string;
  typ: InsightsTyp;
  slug: string;
  sprache: string;
  titel: string;
  kurzfassung: string | null;
  bloecke: Block[];
  status: InsightsStatus;
  titelbild_url: string | null;
  titelbild_alt: string | null;
  autor_id: string | null;
  quelle_typ: string | null;
  quelle_referenz: string | null;
  veroeffentlicht_am: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
};

const TYP_LABEL: Record<InsightsTyp, string> = {
  artikel: "Artikel",
  glossar: "Glossar",
  faq: "FAQ",
  guide: "Guide",
};

export function insightsTypLabel(typ: InsightsTyp): string {
  return TYP_LABEL[typ] || typ;
}

export function erzeugeSlug(titel: string): string {
  return (
    titel
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80) || "eintrag"
  );
}

export async function ladeInsightsListe(filter?: { typ?: InsightsTyp; status?: InsightsStatus }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("insights_eintraege")
    .select("id, typ, slug, titel, kurzfassung, status, sprache, veroeffentlicht_am, aktualisiert_am, quelle_typ")
    .order("aktualisiert_am", { ascending: false });
  if (filter?.typ) query = query.eq("typ", filter.typ);
  if (filter?.status) query = query.eq("status", filter.status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function ladeInsightsEintrag(id: string): Promise<InsightsEintrag | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("insights_eintraege").select("*").eq("id", id).single();
  if (error) return null;
  return data as InsightsEintrag;
}

export async function ladeKategorien() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("insights_kategorien").select("id, name, slug").order("name");
  return data || [];
}

export async function ladeKategorienFuerEintrag(eintragId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("insights_eintrag_kategorien")
    .select("kategorie_id, ist_hauptkategorie")
    .eq("eintrag_id", eintragId);
  return data || [];
}

export async function eindeutigerSlug(basisSlug: string, typ: InsightsTyp, ausgenommenId?: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  let kandidat = basisSlug;
  let zaehler = 2;
  for (;;) {
    let query = supabase.from("insights_eintraege").select("id").eq("slug", kandidat).eq("typ", typ);
    if (ausgenommenId) query = query.neq("id", ausgenommenId);
    const { data } = await query.maybeSingle();
    if (!data) return kandidat;
    kandidat = `${basisSlug}-${zaehler}`;
    zaehler += 1;
  }
}
