export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MWST_SATZ, MONATSNAMEN } from "@/lib/format";

// Oeffentliche, rein lesende Schnittstelle fuer die Onepage-Website.
// Gibt bewusst nur die Felder zurueck, die auf der Website angezeigt werden
// duerfen (Termine, freie Plaetze, Preisstaffeln) - keine Teilnehmerdaten,
// keine internen Notizen. Von der Login-Middleware ausgenommen (siehe
// middleware.ts), da diese Route ohne Session erreichbar sein muss.

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

// Menschenlesbare Datumsspanne fuer die Website-Anzeige, z.B.
// "14.-15. August 2026" (gleicher Monat), "30. September - 2. Oktober 2026"
// (unterschiedliche Monate) oder "30. Dezember 2026 - 2. Januar 2027"
// (unterschiedliche Jahre). Bei nur einem Tag: "14. August 2026".
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select(
      "id, titel, untertitel, eyebrow_text, urgency_label_template, datum_start, datum_ende, zeit_start, zeit_ende, format, kapazitaet, angezeigte_restplaetze, status, zimmerupgrade_beschreibung, zimmerupgrade_preis_netto, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), seminartermin_optionen(id, titel, beschreibung, badge, sortierung, seminartermin_options_features(text, sortierung), preisstaffeln(name, stichtag_tage_vor_start, preis))"
    )
    .eq("id", id)
    .single();

  if (!termin || termin.status === "abgesagt") {
    return withCors(NextResponse.json({ error: "not_found" }, { status: 404 }));
  }

  // Belegung = Anzahl unterschiedlicher Teilnehmer (aktuelle Buchungen + Alt-Daten
  // aus legacy_buchungen zusammengefuehrt, doppelt gezaehlte Personen vermieden).
  // Mitarbeiter/Gastreferenten zaehlen nicht als belegter Platz. Gleiche Logik
  // wie in der Backstage-Terminuebersicht (app/(backstage)/termine/page.tsx).
  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("seminartermin_id, teilnehmer_id, buchungen!inner(status), teilnehmer(rolle)")
    .eq("seminartermin_id", id)
    .neq("buchungen.status", "storniert");

  const { data: legacyPositionen } = await supabase
    .from("legacy_buchungen")
    .select("seminartermin_id, teilnehmer_id, teilnehmer(rolle)")
    .eq("seminartermin_id", id);

  const teilnehmerIds = new Set<string>();
  const zaehleEin = (teilnehmerId: string | null | undefined, rolle: string | null | undefined) => {
    if (!teilnehmerId) return;
    if (rolle && rolle !== "teilnehmer") return;
    teilnehmerIds.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleEin(p.teilnehmer_id, p.teilnehmer?.rolle));
  (legacyPositionen || []).forEach((l: any) => zaehleEin(l.teilnehmer_id, l.teilnehmer?.rolle));
  const gebucht = teilnehmerIds.size;

  // "Angezeigte Restplaetze" (Termin-Formular) erlaubt eine manuelle
  // Ueberschreibung der angezeigten Restplaetze, unabhaengig von den
  // tatsaechlichen Buchungen (z.B. um Urgency gezielt zu steuern). Die
  // Belegungsquote fuer die Urgency-Stufen richtet sich bewusst nach dieser
  // angezeigten (ggf. ueberschriebenen) Zahl, nicht nach der echten Buchungszahl -
  // damit eine manuell hochgesetzte Urgency auch tatsaechlich eine hoehere
  // Stufe (z.B. "Nur noch wenige Plaetze") auslöst.
  const freiRechnerisch = Math.max(0, termin.kapazitaet - gebucht);
  const freiePlaetze = termin.angezeigte_restplaetze ?? freiRechnerisch;
  const effektivGebucht = Math.max(0, termin.kapazitaet - freiePlaetze);
  const belegtProzent = termin.kapazitaet > 0 ? (effektivGebucht / termin.kapazitaet) * 100 : 0;

  const { data: urgencyStufen } = await supabase
    .from("urgency_stufen")
    .select("schwellenwert_prozent, text_vorlage")
    .eq("seminartermin_id", id);

  const dringlichkeitstextGestuft =
    (urgencyStufen || [])
      .filter((u) => belegtProzent >= u.schwellenwert_prozent)
      .sort((a, b) => b.schwellenwert_prozent - a.schwellenwert_prozent)[0]?.text_vorlage
      ?.replace("{remaining}", String(freiePlaetze))
      ?.replace("{total}", String(termin.kapazitaet)) || null;

  // Fallback: falls keine prozentualen Urgency-Stufen greifen, den am Termin
  // hinterlegten Standard-Text verwenden (z.B. "Noch Plätze frei").
  const dringlichkeitstext =
    dringlichkeitstextGestuft ||
    (termin as any).urgency_label_template
      ?.replace("{remaining}", String(freiePlaetze))
      ?.replace("{total}", String(termin.kapazitaet)) ||
    null;

  const optionen = ((termin as any).seminartermin_optionen || [])
    .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
    .map((o: any) => {
      const staffeln = (o.preisstaffeln || []).sort(
        (a: any, b: any) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start
      );
      const preisNetto = aktuellerPreisNetto(staffeln, termin.datum_start);
      return {
        id: o.id,
        titel: o.titel,
        beschreibung: o.beschreibung || null,
        badge: o.badge || null,
        features: (o.seminartermin_options_features || [])
          .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
          .map((f: any) => f.text),
        preisstaffeln: staffeln.map((p: any) => ({
          name: p.name,
          stichtag_tage_vor_start: p.stichtag_tage_vor_start,
          preis_netto: Number(p.preis),
          preis_brutto: brutto(Number(p.preis)),
        })),
        aktueller_preis_netto: preisNetto,
        aktueller_preis_brutto: preisNetto !== null ? brutto(preisNetto) : null,
      };
    });

  return withCors(
    NextResponse.json({
      id: termin.id,
      titel: termin.titel || (termin as any).seminartypen?.name || null,
      untertitel: (termin as any).untertitel || null,
      eyebrow_text: (termin as any).eyebrow_text || "Seminar",
      seminarart: (termin as any).seminartypen?.name || null,
      datum_start: termin.datum_start,
      datum_ende: termin.datum_ende,
      zeit_start: termin.zeit_start,
      zeit_ende: termin.zeit_ende,
      format: termin.format,
      ort: (termin as any).veranstaltungsorte
        ? {
            name: (termin as any).veranstaltungsorte.name,
            ort: (termin as any).veranstaltungsorte.ort,
            nahe_grossstadt: (termin as any).veranstaltungsorte.nahe_grossstadt || null,
          }
        : null,
      // Der Ortsname (z.B. "Weisses Ross, Illschwang") enthaelt die Stadt
      // meist schon -- die separate "ort"-Spalte deshalb NICHT anhaengen
      // (sonst "Illschwang, Illschwang"). Stattdessen optional die nahe
      // Grossstadt ergaenzen, z.B. "Weisses Ross, Illschwang bei Nuernberg".
      ort_anzeige: (termin as any).veranstaltungsorte
        ? [
            (termin as any).veranstaltungsorte.name,
            (termin as any).veranstaltungsorte.nahe_grossstadt
              ? `bei ${(termin as any).veranstaltungsorte.nahe_grossstadt}`
              : null,
          ]
            .filter(Boolean)
            .join(" ")
        : "Ort wird noch bekannt gegeben",
      datumsspanne_anzeige: formatDatumsspanne(termin.datum_start, termin.datum_ende),
      zimmerupgrade: termin.zimmerupgrade_preis_netto
        ? { beschreibung: termin.zimmerupgrade_beschreibung || "Zimmer-Upgrade", preis_netto: Number(termin.zimmerupgrade_preis_netto) }
        : null,
      kapazitaet: termin.kapazitaet,
      freie_plaetze: freiePlaetze,
      belegt_prozent: Math.round(belegtProzent),
      dringlichkeitstext,
      mwst_satz: MWST_SATZ,
      optionen,
    })
  );
}
