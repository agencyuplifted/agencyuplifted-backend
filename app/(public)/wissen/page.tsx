import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Wissen – AgencyUplifted",
  description:
    "Artikel, Glossar und FAQ rund um Pricing, Preisstrategie und Skalierung für Agenturen.",
};

// Die Uebersicht bleibt dynamisch (Kategorie-Filter per ?kategorie=), ihre
// DB-Abfragen kommen aber aus dem Next-Datencache (Tag "wissen") -- geleert
// von revalidiereWissen() in lib/actions.ts, sobald sich etwas aendert.
const cacheOptionen = { tags: ["wissen"], revalidate: 86400 };
const ladeVeroeffentlichteEintraege = unstable_cache((kategorie?: string) => ladeVeroeffentlichteEintraegeRoh(kategorie), ["wissen-eintraege"], cacheOptionen);
const ladeAlleKategorien = unstable_cache(() => ladeAlleKategorienRoh(), ["wissen-kategorien"], cacheOptionen);
const ladeWissenAutor = unstable_cache(() => ladeWissenAutorRoh(), ["wissen-autor"], cacheOptionen);

async function ladeVeroeffentlichteEintraegeRoh(kategorieSlug?: string) {
  const supabase = getSupabaseAdmin();
  let eintragIds: string[] | null = null;
  if (kategorieSlug) {
    const { data: kategorie } = await supabase
      .from("insights_kategorien")
      .select("id")
      .eq("slug", kategorieSlug)
      .maybeSingle();
    if (kategorie) {
      const { data: zuordnungen } = await supabase
        .from("insights_eintrag_kategorien")
        .select("eintrag_id")
        .eq("kategorie_id", kategorie.id)
        .eq("ist_hauptkategorie", true);
      eintragIds = (zuordnungen || []).map((z: any) => z.eintrag_id);
    } else {
      eintragIds = [];
    }
  }

  let query = supabase
    .from("insights_eintraege")
    .select("id, typ, slug, titel, kurzfassung, titelbild_url, titelbild_alt, veroeffentlicht_am, aktualisiert_am")
    .eq("status", "veroeffentlicht")
    .order("veroeffentlicht_am", { ascending: false, nullsFirst: false });
  if (eintragIds) query = query.in("id", eintragIds.length > 0 ? eintragIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await query;
  return data || [];
}

async function ladeAlleKategorienRoh() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("insights_kategorien").select("name, slug").order("name");
  return data || [];
}

async function ladeWissenAutorRoh() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("mitarbeiter")
    .select("name")
    .eq("ist_wissen_autor", true)
    .maybeSingle();
  return data;
}

export default async function WissenUebersicht({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string }>;
}) {
  const { kategorie: kategorieSlug } = await searchParams;
  const [eintraege, autor, kategorien] = await Promise.all([
    ladeVeroeffentlichteEintraege(kategorieSlug),
    ladeWissenAutor(),
    ladeAlleKategorien(),
  ]);
  const aktiveKategorie = kategorien.find((k: any) => k.slug === kategorieSlug);

  return (
    <div className="wp-container">
      <div className="wp-intro">
        <h1>Wissen</h1>
        <p>
          Artikel, Glossar und FAQ rund um Pricing, Preisstrategie und Skalierung für Agenturen —
          aus über zehn Jahren Beratungspraxis.
        </p>
      </div>

      <div className="wp-filter-row">
        <Link href="/wissen" className={`wp-filter-chip${!aktiveKategorie ? " wp-filter-chip-aktiv" : ""}`}>
          Alle
        </Link>
        {kategorien.map((k: any) => (
          <Link
            key={k.slug}
            href={`/wissen?kategorie=${k.slug}`}
            className={`wp-filter-chip${aktiveKategorie?.slug === k.slug ? " wp-filter-chip-aktiv" : ""}`}
          >
            {k.name}
          </Link>
        ))}
      </div>

      {eintraege.length === 0 ? (
        <p className="wp-empty">Hier entstehen gerade neue Beiträge — schau bald wieder vorbei.</p>
      ) : (
        <ul className="wp-list">
          {eintraege.map((e) => (
            <li key={e.id} className="wp-list-item">
              <Link href={`/wissen/${e.slug}`} className="wp-card-link">
                <div className="wp-card-meta">
                  {e.veroeffentlicht_am ? formatDatum(e.veroeffentlicht_am) : formatDatum(e.aktualisiert_am)}
                  {autor && <> · von {autor.name}</>}
                </div>
                <h2 className="wp-card-title">{e.titel}</h2>
                {e.kurzfassung && <p className="wp-card-excerpt">{e.kurzfassung}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
