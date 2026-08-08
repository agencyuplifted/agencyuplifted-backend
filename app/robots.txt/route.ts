import { NextRequest } from "next/server";

// Host-abhaengiges robots.txt: nur der/die in PUBLIC_HOST hinterlegte(n)
// Hostname(s) duerfen gecrawlt werden. Jeder andere Host (insbesondere die
// technische Vercel/Backstage-Domain) bekommt ein vollstaendiges Disallow.
// Siehe middleware.ts fuer den ergaenzenden X-Robots-Tag: noindex-Header.
const PUBLIC_HOSTS = (process.env.PUBLIC_HOST || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";

  const body = PUBLIC_HOSTS.includes(host)
    ? `User-agent: *\nAllow: /wissen\nDisallow: /\n\nSitemap: https://${host}/sitemap.xml\n`
    : `User-agent: *\nDisallow: /\n`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
