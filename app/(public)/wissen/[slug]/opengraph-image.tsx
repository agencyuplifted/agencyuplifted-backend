import { ImageResponse } from "next/og";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "edge";
export const alt = "AgencyUplifted Wissen";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function ladeDaten(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data: eintrag } = await supabase
    .from("insights_eintraege")
    .select("id, titel, kurzfassung")
    .eq("slug", slug)
    .eq("status", "veroeffentlicht")
    .maybeSingle();
  if (!eintrag) return null;

  const { data: kategorieZuordnung } = await supabase
    .from("insights_eintrag_kategorien")
    .select("kategorie_id")
    .eq("eintrag_id", eintrag.id)
    .eq("ist_hauptkategorie", true)
    .maybeSingle();

  let kategorieName: string | null = null;
  if (kategorieZuordnung?.kategorie_id) {
    const { data: kategorie } = await supabase
      .from("insights_kategorien")
      .select("name")
      .eq("id", kategorieZuordnung.kategorie_id)
      .maybeSingle();
    kategorieName = kategorie?.name || null;
  }

  return { titel: eintrag.titel as string, kategorieName };
}

export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const daten = await ladeDaten(slug);
  const titel = daten?.titel || "AgencyUplifted";
  const kategorieName = daten?.kategorieName;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0B1B33 0%, #1a3d6e 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {kategorieName && (
            <div
              style={{
                display: "flex",
                color: "#f9f9fb",
                background: "rgba(255,255,255,0.14)",
                borderRadius: "999px",
                padding: "10px 26px",
                fontSize: 28,
                letterSpacing: "0.02em",
              }}
            >
              {kategorieName}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            color: "#ffffff",
            fontSize: titel.length > 70 ? 54 : 64,
            fontWeight: 700,
            lineHeight: 1.2,
            maxWidth: "1000px",
          }}
        >
          {titel}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", color: "#f9f9fb", fontSize: 30, fontWeight: 600 }}>
            AgencyUplifted
          </div>
          <div style={{ display: "flex", color: "rgba(255,255,255,0.7)", fontSize: 26 }}>
            Wissen
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
