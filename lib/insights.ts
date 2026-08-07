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

// ---- Leichte Text-Auszeichnung <-> Bloecke (fuer den Editor) ----
// Erlaubt: ## / ### / #### Ueberschriften, > Zitat (+ optional "— Quelle"),
// - Liste, 1. Liste, ![Alt](URL "Bildunterschrift") Bild, **fett** Inline.
// FAQ-Bloecke werden getrennt verwaltet (eigene Frage/Antwort-Liste im Editor).

export function serialisiereBloeckeZuText(bloecke: Block[]): string {
  const zeilen: string[] = [];
  for (const b of bloecke) {
    if (b.typ === "faq") continue;
    if (b.typ === "absatz") {
      zeilen.push(b.text);
    } else if (b.typ === "ueberschrift") {
      zeilen.push(`${"#".repeat(b.ebene)} ${b.text}`);
    } else if (b.typ === "liste") {
      b.punkte.forEach((p, idx) => {
        zeilen.push(b.stil === "geordnet" ? `${idx + 1}. ${p}` : `- ${p}`);
      });
    } else if (b.typ === "zitat") {
      zeilen.push(`> ${b.text}`);
      if (b.quelle) zeilen.push(`— ${b.quelle}`);
    } else if (b.typ === "bild") {
      zeilen.push(`![${b.alt}](${b.url}${b.bildunterschrift ? ` "${b.bildunterschrift}"` : ""})`);
    }
    zeilen.push("");
  }
  return zeilen.join("\n").trim();
}

export function parseTextZuBloecke(text: string): Block[] {
  const zeilen = text.replace(/\r\n/g, "\n").split("\n");
  const bloecke: Block[] = [];
  let i = 0;

  while (i < zeilen.length) {
    const roh = zeilen[i];
    const z = roh.trim();

    // Leerzeilen sind rein kosmetisch (nur fuer die Lesbarkeit beim Bearbeiten)
    // und werden ignoriert -- ein einzelnes Enter reicht fuer einen neuen Absatz.
    if (z === "") {
      i++;
      continue;
    }

    const h4 = z.match(/^####\s+(.*)$/);
    const h3 = z.match(/^###\s+(.*)$/);
    const h2 = z.match(/^##\s+(.*)$/);
    if (h4) { bloecke.push({ typ: "ueberschrift", ebene: 4, text: h4[1] }); i++; continue; }
    if (h3) { bloecke.push({ typ: "ueberschrift", ebene: 3, text: h3[1] }); i++; continue; }
    if (h2) { bloecke.push({ typ: "ueberschrift", ebene: 2, text: h2[1] }); i++; continue; }

    const bild = z.match(/^!\[(.*?)\]\((\S+?)(?:\s+"(.*?)")?\)$/);
    if (bild) {
      bloecke.push({ typ: "bild", alt: bild[1], url: bild[2], bildunterschrift: bild[3] || undefined });
      i++;
      continue;
    }

    if (z.startsWith("> ")) {
      const zitatZeilen: string[] = [];
      while (i < zeilen.length && zeilen[i].trim().startsWith("> ")) {
        zitatZeilen.push(zeilen[i].trim().slice(2));
        i++;
      }
      let quelle: string | undefined;
      if (i < zeilen.length && zeilen[i].trim().startsWith("— ")) {
        quelle = zeilen[i].trim().slice(2);
        i++;
      }
      bloecke.push({ typ: "zitat", text: zitatZeilen.join(" "), quelle });
      continue;
    }

    if (/^-\s+/.test(z)) {
      const punkte: string[] = [];
      while (i < zeilen.length && /^-\s+/.test(zeilen[i].trim())) {
        punkte.push(zeilen[i].trim().replace(/^-\s+/, ""));
        i++;
      }
      bloecke.push({ typ: "liste", stil: "ungeordnet", punkte });
      continue;
    }

    if (/^\d+\.\s+/.test(z)) {
      const punkte: string[] = [];
      while (i < zeilen.length && /^\d+\.\s+/.test(zeilen[i].trim())) {
        punkte.push(zeilen[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      bloecke.push({ typ: "liste", stil: "geordnet", punkte });
      continue;
    }

    // Jede uebrige, nicht leere Zeile ist ein eigener Absatz -- ein Enter genuegt.
    bloecke.push({ typ: "absatz", text: z });
    i++;
  }
  return bloecke;
}
