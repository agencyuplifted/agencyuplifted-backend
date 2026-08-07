import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BASIS_URL = "https://backstage.agencyuplifted.com";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("insights_eintraege")
    .select("slug, aktualisiert_am")
    .eq("status", "veroeffentlicht");

  const eintraege = data || [];
  const urls = eintraege
    .map(
      (e: any) =>
        `  <url>\n    <loc>${BASIS_URL}/oeffentlich/${e.slug}</loc>\n    <lastmod>${new Date(
          e.aktualisiert_am
        ).toISOString()}</lastmod>\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
