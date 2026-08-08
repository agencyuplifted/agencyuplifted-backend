import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/session";

// Login-basierter Zugriffsschutz: jede Anfrage ausser /login, dem
// Cron-Endpoint, den oeffentlichen Wissen-Seiten und statischen Assets
// braucht ein gueltiges, signiertes Session-Cookie (gesetzt beim Login in
// lib/actions.ts::loginAction).
//
// Zusaetzlich: Indexierungsschutz. Nur der/die in PUBLIC_HOST hinterlegte(n)
// Hostname(s) (die spaetere echte Domain, z. B. www.agencyuplifted.com,
// sobald per Cloudflare-Proxy vor /wissen geschaltet) duerfen von
// Suchmaschinen indexiert werden. Jeder andere Host -- insbesondere die
// technische Vercel/Backstage-Domain -- bekommt "noindex, nofollow", damit
// die Backstage-Domain nie versehentlich bei Google landet, auch nicht ueber
// die oeffentlichen Wissen-Seiten.
const PUBLIC_HOSTS = (process.env.PUBLIC_HOST || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function mitRobotsHeader(response: NextResponse, request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  if (!PUBLIC_HOSTS.includes(host)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/shopify/") ||
    pathname.startsWith("/oeffentlich/") ||
    pathname.startsWith("/wissen") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/login"
  ) {
    return mitRobotsHeader(NextResponse.next(), request);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("weiter", pathname);
    return mitRobotsHeader(NextResponse.redirect(loginUrl), request);
  }

  return mitRobotsHeader(NextResponse.next(), request);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
