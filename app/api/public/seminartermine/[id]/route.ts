export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MWST_SATZ, MONATSNAMEN, effektiveTerminNaechte } from "@/lib/format";
import { ladeWebsiteVerfuegbarkeit } from "@/lib/verfuegbarkeit";
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
      "id, titel, untertitel, eyebrow_text, urgency_label_template, datum_start, datum_ende, zeit_start, zeit_ende, format, kapazitaet, angezeigte_restplaetze, verfuegbarkeit_anzeige_modus, status, vorabendanreise_inklusive, zimmerupgrade_beschreibung, zimmerupgrade_preis_pro_nacht_netto, selbstauskunft_label, selbstauskunft_aktiv, zusatzteilnehmer_preis, zusatzteilnehmer_rabatt_prozent, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), seminartermin_optionen(id, titel, beschreibung, badge, sortierung, zimmerupgrade_zusatznaechte, deaktiviert_am, ratenzahlung_aktiv, ratenzahlung_anzahl_raten, vorspann_text, vorspann_anzeigen, seminartermin_options_features(text, label, hervorgehoben, sortierung), preisstaffeln(name, stichtag_tage_vor_start, stichtag_datum, preis))"
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

  // Belegung, Restplaetze und Dringlichkeitstext kommen aus
  // lib/verfuegbarkeit.ts -- dieselbe Berechnung zeigt Backstage auf der
  // Terminseite als "Website zeigt" an.
  const verfuegbarkeit = await ladeWebsiteVerfuegbarkeit(supabase, [termin as any]);
  const { freiePlaetze, belegtProzent, dringlichkeitstext } = verfuegbarkeit.get(termin.id)!;

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
        // Vorspann-Text ("Alles aus Move, plus:") -- bereits serverseitig zur
        // Anzeige-Entscheidung verdichtet (Freitext + Ein/Aus-Schalter), damit
        // Onepage nur noch "vorhanden -> anzeigen" pruefen muss, statt beide
        // Rohfelder selbst kombinieren zu muessen.
        introLabel: o.vorspann_anzeigen && o.vorspann_text ? o.vorspann_text : null,
        features: (o.seminartermin_options_features || [])
          .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
          .map((f: any) => ({
            label: f.label || null,
            detail: f.text,
            isHighlighted: !!f.hervorgehoben,
          })),
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
        // Reine Zahlungsvereinbarung (keine automatische Abbuchung) -- Onepage
        // berechnet den Ratenbetrag selbst live aus dem aktuellen Preis, siehe
        // auch buchungspositionen.metadata bei der Buchung selbst.
        ratenzahlung_aktiv: o.ratenzahlung_aktiv || false,
        ratenzahlung_anzahl_raten: o.ratenzahlung_anzahl_raten ?? null,
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
