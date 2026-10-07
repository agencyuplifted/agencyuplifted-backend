export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MWST_SATZ, MONATSNAMEN } from "@/lib/format";
import { berlinKalendertag } from "@/lib/preisstaffeln";
import { ladeWebsiteVerfuegbarkeit, buchungsschlussErreicht, buchungsschlussZeitpunkt } from "@/lib/verfuegbarkeit";
import { aktuellerPreisNetto, naechstePreisstufe } from "@/lib/preisstaffeln";

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
    return `${start.getDate()}. ${monatStart} ${jahrStart} – ${ende.getDate()}. ${monatEnde} ${jahrEnde}`;
  }
  if (monatStart !== monatEnde) {
    return `${start.getDate()}. ${monatStart} – ${ende.getDate()}. ${monatEnde} ${jahrStart}`;
  }
  return `${start.getDate()}. – ${ende.getDate()}. ${monatStart} ${jahrStart}`;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const seminartypIdsRaw = request.nextUrl.searchParams.get("seminartyp_id");
  const seminartypIds = seminartypIdsRaw ? seminartypIdsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;

  // Berliner Kalendertag, nicht UTC: Sonst wechselt die Liste erst um 02:00
  // Ortszeit auf den neuen Tag -- ein Seminar waere zwei Stunden laenger
  // gelistet, als es laeuft.
  const heuteIso = berlinKalendertag(new Date().toISOString());

  let query = supabase
    .from("seminartermine")
    .select(
      "id, titel, kennung, datum_start, datum_ende, zeit_start, buchungsschluss_stunden_vor_start, kapazitaet, angezeigte_restplaetze, verfuegbarkeit_anzeige_modus, urgency_label_template, onepage_slug, status, seminartyp_id, seminartypen(name), veranstaltungsorte(name, nahe_grossstadt), seminartermin_optionen(deaktiviert_am, preisstaffeln(stichtag_tage_vor_start, stichtag_datum, preis))"
    )
    // Bis einschliesslich des LETZTEN Seminartags listen, nicht nur bis zum
    // ersten (Fix vom 07.10.2026): Vorher verschwand ein dreitaegiges Seminar
    // am Morgen des zweiten Tages mitten aus Kalender und Terminliste -- fuer
    // Teilnehmer, die waehrend des Seminars nach Uhrzeiten oder Anfahrt
    // schauen, sah das aus wie ein Fehler. Gebucht werden kann es ohnehin
    // nicht mehr, dafuer sorgt der Buchungsschluss.
    .gte("datum_ende", heuteIso)
    .neq("status", "abgesagt")
    .order("datum_start", { ascending: true });

  if (seminartypIds && seminartypIds.length) {
    query = query.in("seminartyp_id", seminartypIds);
  }

  const { data: termine, error } = await query;
  if (error) {
    return withCors(NextResponse.json({ error: "query_fehler", detail: error.message }, { status: 500 }));
  }

  // Belegung, Restplaetze und Dringlichkeitstext kommen aus
  // lib/verfuegbarkeit.ts -- dieselbe Berechnung zeigt Backstage unter
  // /termine als "Website zeigt" an.
  const verfuegbarkeit = await ladeWebsiteVerfuegbarkeit(supabase, (termine || []) as any[]);

  const ergebnis = (termine || []).map((t: any) => {
    const { freiePlaetze, belegtProzent, dringlichkeitstext } = verfuegbarkeit.get(t.id)!;
    const schlussZeitpunkt = buchungsschlussZeitpunkt(t);
    const schlussErreicht = buchungsschlussErreicht(t);

    // Deaktivierte Optionen (deaktiviert_am gesetzt) nie in Preis-/Verfuegbarkeitsberechnung
    // einbeziehen -- sonst koennte z.B. der guenstigste Preis einer laengst
    // deaktivierten Option als "ab Preis" angezeigt werden.
    const aktiveOptionen = (t.seminartermin_optionen || []).filter((o: any) => !o.deaktiviert_am);
    const alleStaffeln = aktiveOptionen.flatMap((o: any) => o.preisstaffeln || []);
    const preiseProOption = aktiveOptionen
      .map((o: any) => aktuellerPreisNetto(o.preisstaffeln || [], t.datum_start))
      .filter((p: number | null): p is number => p !== null);
    const abPreisNetto = preiseProOption.length ? Math.min(...preiseProOption) : null;

    // Naechste Preiserhoehung der Option, aus der der "ab"-Preis stammt --
    // der Terminwaehler baut daraus seinen Dringlichkeitshinweis ("Steigt in
    // X Tagen auf Y €") und staffelt die Formulierung nach Restzeit. Die
    // Pricing-Karte rechnet dasselbe aus den vollen preisstaffeln der
    // Detail-API; hier reicht ein Feld pro Termin, weil die Liste keine
    // Optionen ausgibt.
    const abPreisOption =
      abPreisNetto === null
        ? null
        : aktiveOptionen.find(
            (o: any) => aktuellerPreisNetto(o.preisstaffeln || [], t.datum_start) === abPreisNetto
          ) || null;
    const naechsteStufe = abPreisOption
      ? naechstePreisstufe(abPreisOption.preisstaffeln || [], t.datum_start)
      : null;

    return {
      id: t.id,
      kennung: t.kennung || null,
      seminartyp_id: t.seminartyp_id,
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
      // "zahlen" = Restplatzzahl + Fuellstandsbalken anzeigen (bisheriges
      // Verhalten), "neutral" = Onepage soll Zahlen/Balken ausblenden und
      // stattdessen nur dringlichkeitstext (den festen neutralen Text) zeigen.
      verfuegbarkeit_anzeige_modus: t.verfuegbarkeit_anzeige_modus,
      dringlichkeitstext,
      onepage_slug: t.onepage_slug || null,
      ab_preis_netto: abPreisNetto,
      ab_preis_brutto: abPreisNetto !== null ? brutto(abPreisNetto) : null,
      hat_preisdaten: alleStaffeln.length > 0,
      naechste_preisstufe: naechsteStufe,
      // Buchbarkeit als fertige Aussage statt als Rohdaten: Onepage soll den
      // Buchungsschluss nicht selbst ausrechnen muessen (und dabei die
      // Zeitzone verfehlen). buchbar fasst Buchungsschluss UND Restplaetze
      // zusammen -- das ist die einzige Zahl, die der Terminwaehler braucht.
      buchungsschluss_erreicht: schlussErreicht,
      buchungsschluss_datum: schlussZeitpunkt !== null ? new Date(schlussZeitpunkt).toISOString() : null,
      buchbar: !schlussErreicht && freiePlaetze > 0,
      // Laeuft gerade: erster Seminartag erreicht, letzter noch nicht vorbei.
      // Vom Backend entschieden, damit die Sektionen kein eigenes Datum
      // bilden muessen -- ein im Browser gerechnetes "heute" weicht beim
      // Server-Rendern ab und loest Hydration-Fehler aus (siehe die
      // Kommentare im termin-resolver).
      laeuft_gerade: t.datum_start <= heuteIso && heuteIso <= t.datum_ende,
    };
  });

  return withCors(NextResponse.json({ termine: ergebnis }));
}
