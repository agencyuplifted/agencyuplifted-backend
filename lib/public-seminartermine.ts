import type { SupabaseClient } from "@supabase/supabase-js";
import { MWST_SATZ, MONATSNAMEN, effektiveTerminNaechte } from "./format";
import { ladeWebsiteVerfuegbarkeit, buchungsschlussErreicht, buchungsschlussZeitpunkt } from "./verfuegbarkeit";
import {
  aktuellerPreisNetto,
  sortierteStaffeln,
  gueltigBisText,
  berlinKalendertag,
  naechstePreisstufe,
} from "./preisstaffeln";

// Einzige Stelle, an der die oeffentliche Termin-Antwort gebaut wird. Vorher
// stand die Logik komplett in den beiden Route-Handlern -- inklusive einer
// Wort-fuer-Wort kopierten formatDatumsspanne(). Seit dem Fallback-Snapshot
// (07.10.2026) braucht ein dritter Aufrufer dieselben Daten: der Cron, der die
// Antwort taeglich in onepage_fallback_snapshot schreibt, damit die
// Onepage-Seiten auch dann richtige Werte zeigen, wenn der Live-Abruf im
// Browser nicht durchkommt. Ein HTTP-Selbstaufruf waere dafuer der falsche Weg
// (Deployment-URL, Auth, Zusatzlatenz) -- deshalb diese Funktionen, die Routes
// und Cron gemeinsam nutzen. Was hier herauskommt, IST die oeffentliche API.

export function brutto(netto: number): number {
  return Math.round(netto * (1 + MWST_SATZ) * 100) / 100;
}

// Menschenlesbare Datumsspanne fuer die Website-Anzeige, z.B.
// "14. – 15. August 2026" (gleicher Monat), "30. September – 2. Oktober 2026"
// (unterschiedliche Monate) oder "30. Dezember 2026 – 2. Januar 2027"
// (unterschiedliche Jahre). Bei nur einem Tag: "14. August 2026".
// Trennzeichen ist immer ein Halbgeviertstrich (En-Dash, "–") mit Leerzeichen
// davor und danach -- so an allen Terminanzeigen auf der Website (Hero,
// Kalender-Modul, etc.) konsistent zu halten.
export function formatDatumsspanne(datumStart: string, datumEnde: string): string {
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

const LISTE_SELECT =
  "id, titel, kennung, datum_start, datum_ende, zeit_start, buchungsschluss_stunden_vor_start, kapazitaet, angezeigte_restplaetze, verfuegbarkeit_anzeige_modus, urgency_label_template, onepage_slug, status, seminartyp_id, seminartypen(name), veranstaltungsorte(name, nahe_grossstadt), seminartermin_optionen(deaktiviert_am, preisstaffeln(stichtag_tage_vor_start, stichtag_datum, preis))";

const DETAIL_SELECT =
  "id, titel, untertitel, eyebrow_text, urgency_label_template, datum_start, datum_ende, zeit_start, zeit_ende, buchungsschluss_stunden_vor_start, format, kapazitaet, angezeigte_restplaetze, verfuegbarkeit_anzeige_modus, status, vorabendanreise_inklusive, zimmerupgrade_beschreibung, zimmerupgrade_preis_pro_nacht_netto, selbstauskunft_label, selbstauskunft_aktiv, zusatzteilnehmer_preis, zusatzteilnehmer_rabatt_prozent, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), seminartermin_optionen(id, titel, beschreibung, badge, sortierung, zimmerupgrade_zusatznaechte, deaktiviert_am, ratenzahlung_aktiv, ratenzahlung_anzahl_raten, vorspann_text, vorspann_anzeigen, seminartermin_options_features(text, label, hervorgehoben, sortierung), preisstaffeln(name, stichtag_tage_vor_start, stichtag_datum, preis))";

function ortAnzeige(ort: { name?: string; nahe_grossstadt?: string | null } | null): string {
  // Der Ortsname (z.B. "Weisses Ross, Illschwang") enthaelt die Stadt meist
  // schon -- die separate "ort"-Spalte deshalb NICHT anhaengen (sonst
  // "Illschwang, Illschwang"). Stattdessen optional die nahe Grossstadt.
  if (!ort) return "Ort wird noch bekannt gegeben";
  return [ort.name, ort.nahe_grossstadt ? `bei ${ort.nahe_grossstadt}` : null].filter(Boolean).join(" ");
}

/**
 * Liste der kuenftigen und laufenden Termine -- der Rumpf von
 * GET /api/public/seminartermine. seminartypIds=null liefert alle Kategorien.
 */
export async function ladeOeffentlicheTerminListe(
  supabase: SupabaseClient,
  seminartypIds: string[] | null
): Promise<{ termine: any[] } | { fehler: string }> {
  // Berliner Kalendertag, nicht UTC: Sonst wechselt die Liste erst um 02:00
  // Ortszeit auf den neuen Tag -- ein Seminar waere zwei Stunden laenger
  // gelistet, als es laeuft.
  const heuteIso = berlinKalendertag(new Date().toISOString());

  let query = supabase
    .from("seminartermine")
    .select(LISTE_SELECT)
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
  if (error) return { fehler: error.message };

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
      ort_anzeige: ortAnzeige(t.veranstaltungsorte),
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

  return { termine: ergebnis };
}

/**
 * Ein einzelner Termin mit Optionen und Preisstaffeln -- der Rumpf von
 * GET /api/public/seminartermine/[id]. null = nicht gefunden oder abgesagt.
 */
export async function ladeOeffentlichenTermin(supabase: SupabaseClient, id: string): Promise<any | null> {
  const { data: termin } = await supabase.from("seminartermine").select(DETAIL_SELECT).eq("id", id).single();
  if (!termin || (termin as any).status === "abgesagt") return null;
  const t = termin as any;

  // Der Zimmerupgrade-Aufpreis gilt pro Nacht. Basis-Naechte kommen aus
  // datum_start/datum_ende des Termins, minus einer Nacht, wenn KEINE
  // Vorabendanreise inklusive ist (vorabendanreise_inklusive = false) -- das
  // ist fuer alle Optionen dieses Termins gleich, da seminartermin_optionen
  // keine eigenen Datumsfelder hat. Einzelne Optionen koennen aber zusaetzlich
  // eine eigene Zusatzuebernachtung drauflegen (zimmerupgrade_zusatznaechte,
  // z.B. eine Verlaengerungsoption), oben drauf auf diesen bereits reduzierten
  // Termin-Wert -- deshalb wandert das Zimmerupgrade unten in die
  // Options-Ausgabe statt einmal fuer den ganzen Termin.
  const terminBasisNaechte = effektiveTerminNaechte(t.datum_start, t.datum_ende, t.vorabendanreise_inklusive);

  const verfuegbarkeit = await ladeWebsiteVerfuegbarkeit(supabase, [t]);
  const { freiePlaetze, belegtProzent, dringlichkeitstext } = verfuegbarkeit.get(t.id)!;
  const heuteBerlin = berlinKalendertag(new Date().toISOString());
  const schlussZeitpunkt = buchungsschlussZeitpunkt(t);
  const schlussErreicht = buchungsschlussErreicht(t);

  const optionen = (t.seminartermin_optionen || [])
    // Deaktivierte Optionen (deaktiviert_am gesetzt) nie oeffentlich ausliefern.
    .filter((o: any) => !o.deaktiviert_am)
    .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
    .map((o: any) => {
      const staffeln = sortierteStaffeln(o.preisstaffeln || [], t.datum_start);
      const preisNetto = aktuellerPreisNetto(staffeln, t.datum_start);
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
        zimmerupgrade: t.zimmerupgrade_preis_pro_nacht_netto
          ? {
              beschreibung: t.zimmerupgrade_beschreibung || "Zimmer-Upgrade",
              naechte: optionNaechte,
              preis_pro_nacht_netto: Number(t.zimmerupgrade_preis_pro_nacht_netto),
              preis_pro_nacht_brutto: brutto(Number(t.zimmerupgrade_preis_pro_nacht_netto)),
              // Gesamtaufpreis (Aufpreis pro Nacht x Naechte dieser Option) --
              // bewusst vorberechnet zurueckgegeben, damit Onepage nicht
              // selbst rechnen muss.
              preis_netto: Number(t.zimmerupgrade_preis_pro_nacht_netto) * optionNaechte,
              preis_brutto: brutto(Number(t.zimmerupgrade_preis_pro_nacht_netto) * optionNaechte),
            }
          : null,
      };
    });

  return {
    id: t.id,
    titel: t.titel || t.seminartypen?.name || null,
    untertitel: t.untertitel || null,
    eyebrow_text: t.eyebrow_text || "Seminar",
    seminarart: t.seminartypen?.name || null,
    datum_start: t.datum_start,
    datum_ende: t.datum_ende,
    zeit_start: t.zeit_start,
    zeit_ende: t.zeit_ende,
    format: t.format,
    ort: t.veranstaltungsorte
      ? {
          name: t.veranstaltungsorte.name,
          ort: t.veranstaltungsorte.ort,
          nahe_grossstadt: t.veranstaltungsorte.nahe_grossstadt || null,
        }
      : null,
    ort_anzeige: ortAnzeige(t.veranstaltungsorte),
    datumsspanne_anzeige: formatDatumsspanne(t.datum_start, t.datum_ende),
    selbstauskunft: t.selbstauskunft_aktiv ? t.selbstauskunft_label || "Ich bestaetige die untenstehende Angabe." : null,
    zusatzteilnehmer_preis:
      t.zusatzteilnehmer_preis !== null && t.zusatzteilnehmer_preis !== undefined ? Number(t.zusatzteilnehmer_preis) : null,
    zusatzteilnehmer_rabatt_prozent:
      t.zusatzteilnehmer_rabatt_prozent !== null && t.zusatzteilnehmer_rabatt_prozent !== undefined
        ? Number(t.zusatzteilnehmer_rabatt_prozent)
        : null,
    kapazitaet: t.kapazitaet,
    freie_plaetze: freiePlaetze,
    belegt_prozent: Math.round(belegtProzent),
    // Siehe Listen-API: buchbar ist die fertige Aussage fuer das
    // Buchungsformular, damit Onepage den Buchungsschluss nicht selbst
    // (und womoeglich in der falschen Zeitzone) nachrechnet.
    buchungsschluss_erreicht: schlussErreicht,
    buchungsschluss_datum: schlussZeitpunkt !== null ? new Date(schlussZeitpunkt).toISOString() : null,
    buchbar: !schlussErreicht && freiePlaetze > 0,
    // siehe Listen-API: laeuft gerade = erster Tag erreicht, letzter nicht vorbei
    laeuft_gerade: heuteBerlin >= t.datum_start && heuteBerlin <= t.datum_ende,
    verfuegbarkeit_anzeige_modus: t.verfuegbarkeit_anzeige_modus,
    dringlichkeitstext,
    mwst_satz: MWST_SATZ,
    optionen,
  };
}
