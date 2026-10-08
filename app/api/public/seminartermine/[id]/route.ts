export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ladeOeffentlichenTermin } from "@/lib/public-seminartermine";

// Oeffentliche, rein lesende Schnittstelle fuer die Onepage-Website.
// Gibt bewusst nur die Felder zurueck, die auf der Website angezeigt werden
// duerfen (Termine, freie Plaetze, Preisstaffeln) - keine Teilnehmerdaten,
// keine internen Notizen. Von der Login-Middleware ausgenommen (siehe
// middleware.ts), da diese Route ohne Session erreichbar sein muss.
//
// Der Inhalt entsteht in lib/public-seminartermine.ts -- dieselbe Funktion
// nutzt der Snapshot-Cron, damit die gespeicherten Fallback-Daten garantiert
// das enthalten, was diese Route liefert.

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", "public, max-age=0, s-maxage=60");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const termin = await ladeOeffentlichenTermin(getSupabaseAdmin(), id);
  if (!termin) {
    return withCors(NextResponse.json({ error: "not_found" }, { status: 404 }));
  }
  return withCors(NextResponse.json(termin));
}
