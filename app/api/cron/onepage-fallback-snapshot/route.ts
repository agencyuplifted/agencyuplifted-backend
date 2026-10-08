import { NextRequest } from "next/server";
import { schreibeAlleFallbackSnapshots } from "@/lib/onepage-fallback";

export const dynamic = "force-dynamic";
// Fuenf Seminartypen, pro Typ zwei Abfragen plus Upsert -- laeuft deutlich
// unter der Standardgrenze, der Spielraum ist nur Sicherheitsabstand.
export const maxDuration = 60;

// Einmal taeglich vor 04:00 deutscher Zeit (vercel.json: 0 1 * * * UTC), damit
// die Onepage-Sync-Routine am Morgen auf frische Werte trifft. Zusaetzlich
// zieht jede Aenderung an Terminen, Optionen, Preisstaffeln oder Buchungen den
// betroffenen Snapshot sofort nach (siehe lib/onepage-fallback.ts) -- der Cron
// ist das Netz darunter, nicht die einzige Aktualisierung.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const ergebnis = await schreibeAlleFallbackSnapshots("backend-cron");
  return Response.json(ergebnis, { status: ergebnis.fehler.length ? 500 : 200 });
}
