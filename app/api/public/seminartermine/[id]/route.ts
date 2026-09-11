export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MWST_SATZ, MONATSNAMEN, effektiveTerminNaechte, VERFUEGBARKEIT_NEUTRAL_TEXT } from "@/lib/format";
import { aktuellerPreisNetto, sortierteStaffeln, gueltigBisText } from "@/lib/preisstaffeln";

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
// "14. – 15. August 2026" (gleicher Monat), "30. September – 2. Oktober 2026"
// (unterschiedliche Monate) oder "30. Dezember 2026 – 2. Januar 2027"
// (unterschiedliche Jahre). Bei nur einem Tag: "14. August 2026".
// Trennzeichen ist immer ein Halbgeviertstrich (En-Dash, "–") mit Leerzeichen
// davor und danach -- so an allen Terminanzeigen auf der Website (Hero,
// Kalender-Modul, etc.) konsistent zu halten.
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

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select(
      "id, titel, untertitel, eyebrow_text, urgency_label_template, datum_start, datum_ende, zeit_start, zeit_ende, format, kapazitaet, angezeigte_restplaetze, verfuegbarkeit_anzeige_modus, status, vorabendanreise_inklusive, zimmerupgrade_beschreibung, zimmerupgrade_preis_pro_nacht_netto, selbstauskunft_label, selbstauskunft_aktiv, zusatzteilnehmer_preis, zusatzteilnehmer_rabatt_prozent, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), seminartermin_optionen(id, titel, beschreibung, badge, sortierung, zimmerupgrade_zusatznaechte, deaktiviert_am, seminartermin_options_features(text, sortierung), preisstaffeln(name, stichtag_tage_vor_start, stichtag_datum, preis))"
      )
    .eq("id", id)
    .single();

  if (!termin || termin.status === "abgesagt") {
    return withCors(NextResponse.json({ error: "not_found" }, { status: 404 }));
  }

  // Der Zimmerupgrade-Aufpreis gilt pro Nacht. Basis-Naechte kommen aus
  // datum_start/datum_ende des Termins, minus einer Nacht, wenn KEINE
  // Vorabendanreise inklusive ist (vorabendanreise_inklusive = false) -- das
  // ist fuer alle Optionen dieses Termins gleich, da seminartermin_optionen
  // keine eigenen Datumsfelder hat. Einzelne Optionen koennen aber zusaetzlich
  // eine eigene Zusatzuebernachtung drauflegen (zimmerupgrade_zusatznaechte,
  // z.B. eine Verlaengerungsoption), oben drauf auf diesen bereits reduzierten
  // Termin-Wert -- deshalb wandert das Zimmerupgrade unten in die
  // Options-Ausgabe statt einmal fuer den ganzen Termin.
  const terminBasisNaechte = effektiveTerminNaechte(termin.datum_start, termin.datum_ende, termin.vorabendanreise_inklusive);

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
  // hinterlegten Standard-Text verwenden (z.B. "Noch Plätze frei"). Im
  // neutralen Anzeige-Modus duerfen aber keine Platzzahlen durchsickern --
  // deshalb dort immer der feste neutrale Text, unabhaengig von Stufen/Template.
  const dringlichkeitstext =
    (termin as any).verfuegbarkeit_anzeige_modus === "neutral"
      ? VERFUEGBARKEIT_NEUTRAL_TEXT
      : dringlichkeitstextGestuft ||
        (termin as any).urgency_label_template
          ?.replace("{remaining}", String(freiePlaetze))
          ?.replace("{total}", String(termin.kapazitaet)) ||
        null;

  const optionen = ((termin as any).seminartermin_optionen || [])
    // Deaktivierte Optionen (deaktiviert_am gesetzt) nie oeffentlich ausliefern.
    .filter((o: any) => !o.deaktiviert_am)
    .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
    .map((o: any) => {
      const staffeln = sortierteStaffeln(o.preisstaffeln || [], termin.datum_start);
      const preisNetto = aktuellerPreisNetto(staffeln, termin.datum_start);
      // Effektive Naechte dieser Option = Termin-Basisnaechte + ggf. eigene
      // Zusatzuebernachtung (siehe terminBasisNaechte oben) -- Beschreibung
      // und Preis pro Nacht sind termin-weit gleich, nur die Naechteanzahl
      // (und damit der Gesamtpreis) kann pro Option abweichen.
      const optionNaechte = terminBasisNaechte + (o.zimmerupgrade_zusatznaechte || 0);
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
          stichtag_datum: p.stichtag_datum || null,
          ...(p.stichtag_datum ? { gueltigBisText: gueltigBisText(p.stichtag_datum) } : {}),
          preis_netto: Number(p.preis),
          preis_brutto: brutto(Number(p.preis)),
        })),
        aktueller_preis_netto: preisNetto,
        aktueller_preis_brutto: preisNetto !== null ? brutto(preisNetto) : null,
        zimmerupgrade: termin.zimmerupgrade_preis_pro_nacht_netto
          ? {
              beschreibung: termin.zimmerupgrade_beschreibung || "Zimmer-Upgrade",
              naechte: optionNaechte,
              preis_pro_nacht_netto: Number(termin.zimmerupgrade_preis_pro_nacht_netto),
              preis_pro_nacht_brutto: brutto(Number(termin.zimmerupgrade_preis_pro_nacht_netto)),
              // Gesamtaufpreis (Aufpreis pro Nacht x Naechte dieser Option) --
              // bewusst vorberechnet zurueckgegeben, damit Onepage nicht
              // selbst rechnen muss.
              preis_netto: Number(termin.zimmerupgrade_preis_pro_nacht_netto) * optionNaechte,
              preis_brutto: brutto(Number(termin.zimmerupgrade_preis_pro_nacht_netto) * optionNaechte),
            }
          : null,
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
      selbstauskunft: termin.selbstauskunft_aktiv ? (termin.selbstauskunft_label || "Ich bestaetige die untenstehende Angabe.") : null,
      zusatzteilnehmer_preis: termin.zusatzteilnehmer_preis !== null && termin.zusatzteilnehmer_preis !== undefined ? Number(termin.zusatzteilnehmer_preis) : null,
      zusatzteilnehmer_rabatt_prozent: termin.zusatzteilnehmer_rabatt_prozent !== null && termin.zusatzteilnehmer_rabatt_prozent !== undefined ? Number(termin.zusatzteilnehmer_rabatt_prozent) : null,
      kapazitaet: termin.kapazitaet,
      freie_plaetze: freiePlaetze,
      belegt_prozent: Math.round(belegtProzent),
      // "zahlen" = Restplatzzahl + Fuellstandsbalken anzeigen (bisheriges
      // Verhalten), "neutral" = Onepage soll Zahlen/Balken ausblenden und
      // stattdessen nur dringlichkeitstext (den festen neutralen Text) zeigen.
      verfuegbarkeit_anzeige_modus: (termin as any).verfuegbarkeit_anzeige_modus,
      dringlichkeitstext,
      mwst_satz: MWST_SATZ,
      optionen,
    })
  );
}
