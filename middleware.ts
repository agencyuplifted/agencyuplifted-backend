import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Einfacher Passwortschutz (HTTP Basic Auth) fuer die gesamte Admin-App,
// da hier echte Teilnehmer-/Organisationsdaten liegen. Zugangsdaten ueber
// Vercel-Projekt-Umgebungsvariablen BASIC_AUTH_USER / BASIC_AUTH_PASSWORD
// ueberschreibbar; Fallback-Werte greifen, falls diese nicht gesetzt sind.
const USER = process.env.BASIC_AUTH_USER || "agencyuplifted";
const PASS = process.env.BASIC_AUTH_PASSWORD || "Seminare-2026-Intern!";

export function middleware(request: NextRequest) {
  // Der Cron-Job (und jeder andere Server-zu-Server-Aufruf mit Bearer-Token)
  // authentifiziert sich selbst ueber CRON_SECRET in der Route -- Basic Auth
  // wuerde hier faelschlich mit 401 blocken, bevor die Route das prueft.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const sepIndex = decoded.indexOf(":");
        const user = decoded.slice(0, sepIndex);
        const pass = decoded.slice(sepIndex + 1);
        if (user === USER && pass === PASS) {
          return NextResponse.next();
        }
      } catch {
        // fällt durch zu 401
      }
    }
  }

  return new NextResponse("Zugriff geschützt – bitte anmelden.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AgencyUplifted Seminarverwaltung"' },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
