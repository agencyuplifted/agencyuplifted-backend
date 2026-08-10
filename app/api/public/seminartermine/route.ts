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
      "id, titel, datum_start, datum_ende, kapazitaet, angezeigte_restplaetze, urgency_label_template, onepage_slug, status, seminartypen(name), veranstaltungsorte(name, nahe_grossstadt), seminartermin_optionen(preisstaffeln(stichtag_tage_vor_start, preis))"
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

  // Belegung = Anzahl unterschiedlicher Teilnehmer (aktuelle Buchungen + Alt-
  // Daten aus legacy_buchungen zusammengefuehrt, doppelt gezaehlte Personen
  // vermieden). Mitarbeiter/Gastreferenten zaehlen nicht als belegter Platz.
  // Gleiche Logik wie in /api/public/seminartermine/[id] und der
  // Backstage-Terminuebersicht.
  const { data: positionen } = terminIds.length
    ? await supabase
        .from("buchungspositionen")
        .select("seminartermin_id, teilnehmer_id, buchungen!inner(status), teilnehmer(rolle)")
        .in("seminartermin_id", terminIds)
        .neq("buchungen.status", "storniert")
    : { data: [] as any[] };

  const { data: legacyPositionen } = terminIds.length
    ? await supabase
        .from("legacy_buchungen")
        .select("seminartermin_id, teilnehmer_id, teilnehmer(rolle)")
        .in("seminartermin_id", terminIds)
    : { data: [] as any[] };

  const teilnehmerProTermin = new Map<string, Set<string>>();
  const zaehleEin = (seminarterminId: string | null, teilnehmerId: string | null, rolle: string | null | undefined) => {
    if (!seminarterminId || !teilnehmerId) return;
    if (rolle && rolle !== "teilnehmer") return;
    if (!teilnehmerProTermin.has(seminarterminId)) teilnehmerProTermin.set(seminarterminId, new Set());
    teilnehmerProTermin.get(seminarterminId)!.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleEin(p.seminartermin_id, p.teilnehmer_id, p.teilnehmer?.rolle));
  (legacyPositionen || []).forEach((l: any) => zaehleEin(l.seminartermin_id, l.teilnehmer_id, l.teilnehmer?.rolle));

  const { data: urgencyStufenAlle } = terminIds.length
    ? await supabase
        .from("urgency_stufen")
        .select("seminartermin_id, schwellenwert_prozent, text_vorlage")
        .in("seminartermin_id", terminIds)
    : { data: [] as any[] };
  const urgencyStufenProTermin = new Map<string, { schwellenwert_prozent: number; text_vorlage: string }[]>();
  (urgencyStufenAlle || []).forEach((u: any) => {
    if (!urgencyStufenProTermin.has(u.seminartermin_id)) urgencyStufenProTermin.set(u.seminartermin_id, []);
    urgencyStufenProTermin.get(u.seminartermin_id)!.push(u);
  });

  const ergebnis = (termine || []).map((t: any) => {
    const gebucht = teilnehmerProTermin.get(t.id)?.size || 0;
    const freiRechnerisch = Math.max(0, t.kapazitaet - gebucht);
    // "Angezeigte Restplaetze" erlaubt eine manuelle Ueberschreibung,
    // unabhaengig von den tatsaechlichen Buchungen (z.B. um Urgency gezielt
    // zu steuern). Die Belegungsquote fuer die Urgency-Stufen richtet sich
    // bewusst nach dieser angezeigten (ggf. ueberschriebenen) Zahl.
    const freiePlaetze = t.angezeigte_restplaetze ?? freiRechnerisch;
    const effektivGebucht = Math.max(0, t.kapazitaet - freiePlaetze);
    const belegtProzent = t.kapazitaet > 0 ? (effektivGebucht / t.kapazitaet) * 100 : 0;

    const stufen = urgencyStufenProTermin.get(t.id) || [];
    const dringlichkeitstextGestuft = stufen
      .filter((u) => belegtProzent >= u.schwellenwert_prozent)
      .sort((a, b) => b.schwellenwert_prozent - a.schwellenwert_prozent)[0]?.text_vorlage
      ?.replace("{remaining}", String(freiePlaetze))
      ?.replace("{total}", String(t.kapazitaet));

    const dringlichkeitstext =
      dringlichkeitstextGestuft ||
      (t.urgency_label_template
        ?.replace("{remaining}", String(freiePlaetze))
        ?.replace("{total}", String(t.kapazitaet))) ||
      null;

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
      // Der Ortsname enthaelt die Stadt meist schon -- die separate "ort"-
      // Spalte deshalb NICHT anhaengen (sonst "Illschwang, Illschwang").
      // Stattdessen optional die nahe Grossstadt ergaenzen.
      ort_anzeige: t.veranstaltungsorte
        ? [t.veranstaltungsorte.name, t.veranstaltungsorte.nahe_grossstadt ? `bei ${t.veranstaltungsorte.nahe_grossstadt}` : null]
            .filter(Boolean)
            .join(" ")
        : "Ort wird noch bekannt gegeben",
      kapazitaet: t.kapazitaet,
      freie_plaetze: freiePlaetze,
      belegt_prozent: Math.round(belegtProzent),
      dringlichkeitstext,
      onepage_slug: t.onepage_slug || null,
      ab_preis_netto: abPreisNetto,
      ab_preis_brutto: abPreisNetto !== null ? brutto(abPreisNetto) : null,
      hat_preisdaten: alleStaffeln.length > 0,
    };
  });

  return withCors(NextResponse.json({ termine: ergebnis }));
}
