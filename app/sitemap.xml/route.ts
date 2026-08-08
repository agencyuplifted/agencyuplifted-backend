import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "backstage.agencyuplifted.com";
  const basisUrl = `https://${host}`;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("insights_eintraege")
    .select("slug, aktualisiert_am")
    .eq("status", "veroeffentlicht");

  const eintraege = data || [];
  const urls = eintraege
    .map(
      (e: any) =>
        `  <url>\n    <loc>${basisUrl}/wissen/${e.slug}</loc>\n    <lastmod>${new Date(
          e.aktualisiert_am
        ).toISOString()}</lastmod>\n  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
