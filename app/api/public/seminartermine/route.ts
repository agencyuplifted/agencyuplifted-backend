export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ladeOeffentlicheTerminListe } from "@/lib/public-seminartermine";

// Oeffentliche, rein lesende Liste kuenftiger und laufender Seminartermine fuer
// die Onepage-Website - z.B. fuer eine Terminuebersicht auf einer Kategorieseite
// ("alle Termine dieser Seminarart"). Filterbar per Query-Param seminartyp_id
// (kommagetrennt fuer mehrere IDs, z.B. wenn eine Kategorie aus mehreren
// Seminartypen besteht). Ohne Filter: alle Termine.
// Von der Login-Middleware ausgenommen (siehe middleware.ts).
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

export async function GET(request: NextRequest) {
  const seminartypIdsRaw = request.nextUrl.searchParams.get("seminartyp_id");
  const seminartypIds = seminartypIdsRaw
    ? seminartypIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const ergebnis = await ladeOeffentlicheTerminListe(getSupabaseAdmin(), seminartypIds);
  if ("fehler" in ergebnis) {
    return withCors(NextResponse.json({ error: "query_fehler", detail: ergebnis.fehler }, { status: 500 }));
  }
  return withCors(NextResponse.json(ergebnis));
}
