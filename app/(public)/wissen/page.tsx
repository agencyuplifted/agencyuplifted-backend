export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Wissen – AgencyUplifted",
  description:
    "Artikel, Glossar und FAQ rund um Pricing, Preisstrategie und Skalierung für Agenturen.",
};

async function ladeVeroeffentlichteEintraege() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("insights_eintraege")
    .select("id, typ, slug, titel, kurzfassung, titelbild_url, titelbild_alt, veroeffentlicht_am, aktualisiert_am")
    .eq("status", "veroeffentlicht")
    .order("veroeffentlicht_am", { ascending: false, nullsFirst: false });
  return data || [];
}

export default async function WissenUebersicht() {
  const eintraege = await ladeVeroeffentlichteEintraege();

  return (
    <div className="wp-container">
      <div className="wp-intro">
        <h1>Wissen</h1>
        <p>
          Artikel, Glossar und FAQ rund um Pricing, Preisstrategie und Skalierung für Agenturen —
          aus über zehn Jahren Beratungspraxis.
        </p>
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
