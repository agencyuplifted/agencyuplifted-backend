import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

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

// 301/302-Weiterleitungen fuer migrierte Alt-URLs (z. B. von der frueheren
// agencyuplifted.de/Contao-Seite auf die neuen /wissen-URLs), gepflegt unter
// /redirects. Die Pruefung laeuft NUR auf den PUBLIC_HOSTS -- echte Besucher
// treffen so auf keine zusaetzliche Verzoegerung/Datenbankabfrage bei jedem
// Backstage-Klick, nur auf den oeffentlichen Domains, wo migrierte Alt-URLs
// ueberhaupt aufgerufen werden koennen. createClient() statt getSupabaseAdmin()
// aus lib/supabase.ts, damit hier keine Node-spezifischen Importe in die
// Edge-Runtime der Middleware hineingezogen werden.
async function findeAktivenRedirect(pathname: string): Promise<{ neue_url: string; status_code: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase
    .from("insights_redirects")
    .select("neue_url, status_code")
    .eq("alte_url", pathname)
    .eq("aktiv", true)
    .maybeSingle();
  return data;
}

function mitRobotsHeader(response: NextResponse, request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";
  if (!PUBLIC_HOSTS.includes(host)) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

// Netzwerk "Uplifted Agencies" (/netzwerk): eigene Supabase-Auth-Session,
// komplett unabhaengig vom Backstage-Login (au_session). Frischt die Session
// auf und schickt nicht Eingeloggte zum Netzwerk-Login. Ob jemand aktives
// Mitglied ist, prueft requireMitglied() in lib/netzwerk.ts (plus RLS).
async function netzwerkMiddleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const oeffentlich = pathname === "/netzwerk/login" || pathname.startsWith("/netzwerk/auth/");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return mitRobotsHeader(response, request);

  const supabase = createServerClient(url, key, {
    cookieOptions: { path: "/netzwerk", sameSite: "lax", secure: true },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (liste) => {
        liste.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        liste.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !oeffentlich) {
    return mitRobotsHeader(NextResponse.redirect(new URL("/netzwerk/login", request.url)), request);
  }
  return mitRobotsHeader(response, request);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Achtung: "/netzwerk-einladen" ist Backstage, deshalb exakter Pfadvergleich.
  if (pathname === "/netzwerk" || pathname.startsWith("/netzwerk/")) {
    return netzwerkMiddleware(request);
  }
  const host = request.headers.get("host")?.toLowerCase() || "";

  // Weiterleitungen nur fuer Adressen pruefen, die zu keinem bekannten Bereich
  // gehoeren (Alt-URLs der frueheren Seite) -- vorher lief bei JEDEM Aufruf der
  // oeffentlichen Domain eine DB-Abfrage, auch fuer zwischengespeicherte
  // Wissen-Seiten, Bilder und Crawler-Anfragen.
  const bekannterPfad =
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname === "/wissen" ||
    pathname.startsWith("/wissen/") ||
    pathname.startsWith("/api/") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/llms.txt";
  if (PUBLIC_HOSTS.includes(host) && !bekannterPfad) {
    const redirect = await findeAktivenRedirect(pathname);
    if (redirect) {
      return mitRobotsHeader(
        NextResponse.redirect(new URL(redirect.neue_url, request.url), redirect.status_code),
        request
      );
    }
  }

  if (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/shopify/") ||
    // Apple-Kurzbefehl ohne Session -- schuetzt sich selbst per INBOX_API_TOKEN
    pathname === "/api/inbox" ||
    // Kalender-Abo: Kalender-Apps schicken keine Cookies, Token in der URL
    pathname.startsWith("/api/kalender/") ||
    // Persoenliche Teilnehmer-Seiten aus den Seminar-Mails (signierter Token)
    pathname.startsWith("/seminar/") ||
    // Abmeldeseite aus den Mails (signierter Token)
    pathname.startsWith("/abmelden/") ||
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
  // icon-*.png / apple-touch-icon.png / manifest.json sind oeffentliche PWA-
  // Assets (Home-Bildschirm-Icon, Onepage-Media-Fetch) und muessen ohne
  // Login abrufbar sein, genau wie favicon.ico.
  matcher:
    "/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|apple-touch-icon.png|manifest.json).*)",
};
