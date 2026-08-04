export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MWST_SATZ, MONATSNAMEN } from "@/lib/format";

// Oeffentliche, rein lesende Liste kuenftiger Seminartermine fuer die
// Onepage-Website - z.B. fuer eine Terminuebersicht auf einer Kategorieseite
// ("alle Termine dieser Seminarart"). Filterbar per Query-Param
// seminartyp_id (kommagetrennt fuer mehrere IDs, z.B. wenn eine Kategorie aus
// mehreren Seminartypen besteht). Ohne Filter: alle kuenftigen Termine.
// Von der Login-Middleware ausgenommen (siehe middleware.ts).

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

function brutto(netto: number): number {
  return Math.round(netto * (1 + MWST_SATZ) * 100) / 100;
}

function formatDatumsspanne(datumStart: string, datumEnde: string): string {
  const start = new Date(datumStart);
  const ende = new Date(datumEnde);
  const monatStart = MONATSNAMEN[start.getMonth()];
  const monatEnde = MONATSNAMEN[ende.getMonth()];
  const jahrStart = start.getFullYear();
  const jahrEnde = ende.getFullYear();

  if (datumStart === datumEnde) {
    return `${start.getDate()}. ${monatStart} ${jahrStart}`;
  }
  if (jahrStart !== jahrEnde) {
    return `${start.getDate()}. ${monatStart} ${jahrStart} - ${ende.getDate()}. ${monatEnde} ${jahrEnde}`;
  }
  if (monatStart !== monatEnde) {
    return `${start.getDate()}. ${monatStart} - ${ende.getDate()}. ${monatEnde} ${jahrStart}`;
  }
  return `${start.getDate()}.-${ende.getDate()}. ${monatStart} ${jahrStart}`;
}

function aktuellerPreisNetto(preisstaffeln: { stichtag_tage_vor_start: number; preis: number }[], datumStart: string): number | null {
  if (!preisstaffeln.length) return null;
  const heute = new Date();
  const start = new Date(datumStart);
  const tageBisStart = Math.ceil((start.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  const sortiert = [...preisstaffeln].sort((a, b) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start);
  const aktiv = sortiert.find((p) => tageBisStart >= p.stichtag_tage_vor_start);
  const gewaehlt = aktiv || sortiert[sortiert.length - 1];
  return gewaehlt ? Number(gewaehlt.preis) : null;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const seminartypIdsRaw = request.nextUrl.searchParams.get("seminartyp_id");
  const seminartypIds = seminartypIdsRaw ? seminartypIdsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;

  const heuteIso = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("seminartermine")
    .select(
      "id, titel, datum_start, datum_ende, kapazitaet, angezeigte_restplaetze, status, seminartypen(name), veranstaltungsorte(name, ort), seminartermin_optionen(preisstaffeln(stichtag_tage_vor_start, preis))"
    )
    .gte("datum_start", heuteIso)
    .neq("status", "abgesagt")
    .order("datum_start", { ascending: true });

  if (seminartypIds && seminartypIds.length) {
    query = query.in("seminartyp_id", seminartypIds);
  }

  const { data: termine, error } = await query;
  if (error) {
    return withCors(NextResponse.json({ error: "query_fehler", detail: error.message }, { status: 500 }));
  }

  const terminIds = (termine || []).map((t: any) => t.id);
  const { data: positionen } = terminIds.length
    ? await supabase
        .from("buchungspositionen")
        .select("seminartermin_id, buchungen!inner(status)")
        .in("seminartermin_id", terminIds)
        .neq("buchungen.status", "storniert")
    : { data: [] as any[] };

  const gebuchtProTermin = new Map<string, number>();
  for (const p of positionen || []) {
    const key = (p as any).seminartermin_id;
    gebuchtProTermin.set(key, (gebuchtProTermin.get(key) || 0) + 1);
  }

  const ergebnis = (termine || []).map((t: any) => {
    const gebucht = gebuchtProTermin.get(t.id) || 0;
    const freiRechnerisch = Math.max(0, t.kapazitaet - gebucht);
    const freiePlaetze = t.angezeigte_restplaetze ?? freiRechnerisch;

    const alleStaffeln = (t.seminartermin_optionen || []).flatMap((o: any) => o.preisstaffeln || []);
    const preiseProOption = (t.seminartermin_optionen || [])
      .map((o: any) => aktuellerPreisNetto(o.preisstaffeln || [], t.datum_start))
      .filter((p: number | null): p is number => p !== null);
    const abPreisNetto = preiseProOption.length ? Math.min(...preiseProOption) : null;

    return {
      id: t.id,
      titel: t.titel || t.seminartypen?.name || null,
      seminarart: t.seminartypen?.name || null,
      datum_start: t.datum_start,
      datum_ende: t.datum_ende,
      datumsspanne_anzeige: formatDatumsspanne(t.datum_start, t.datum_ende),
      ort_anzeige: t.veranstaltungsorte
        ? [t.veranstaltungsorte.name, t.veranstaltungsorte.ort].filter(Boolean).join(", ")
        : "Ort wird noch bekannt gegeben",
      kapazitaet: t.kapazitaet,
      freie_plaetze: freiePlaetze,
      ab_preis_netto: abPreisNetto,
      ab_preis_brutto: abPreisNetto !== null ? brutto(abPreisNetto) : null,
      hat_preisdaten: alleStaffeln.length > 0,
    };
  });

  return withCors(NextResponse.json({ termine: ergebnis }));
}
