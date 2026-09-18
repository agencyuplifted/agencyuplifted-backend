export const dynamic = "force-dynamic";

import {
  createPreisstaffel,
  createUrgencyStufe,
  updateUrgencyStufe,
  updateVerfuegbarkeitsAnzeige,
  deleteUrgencyStufe,
  previewSeminarterminUpdate,
  createSeminarOption,
  createOptionFeature,
  duplicateSeminartermin,
  previewSeminarterminLoeschen,
  previewSeminarterminStornieren,
  reaktiviereSeminartermin,
  duplicateSeminarOption,
  importSeminarOptions,
  updateOptionBadge,
  updateSeminarOption,
  uebernehmeOptionSchnelleinfuegen,
  deaktivierenSeminarOption,
  reaktiviereSeminarOption,
  loescheSeminarOption,
  deleteOptionFeature,
  updateOptionFeature,
  moveOptionFeature,
  moveSeminarOption,
  deletePreisstaffel,
  updatePreisstaffel,
  copyPreisstaffelnFromOption,
  wendePreisstaffelVorlageAn,
  ersetzePreisstaffelnDurchVorlage,
  speicherePreisstaffelnAlsVorlage,
  addMitarbeiterZuTermin,
  removeMitarbeiterVonTermin,
  setzeZimmerpartner,
  entferneZimmerpartner,
  erzeugeUnterlagenUpload,
  speichereSeminarUnterlage,
  verschiebeSeminarUnterlage,
  loescheSeminarUnterlage,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto, effektiveTerminNaechte, VERFUEGBARKEIT_NEUTRAL_TEXT } from "@/lib/format";
import { renderFett } from "@/lib/richtext";
import { FettTextarea, FettInput } from "../BoldEditor";
import PreisstaffelStichtagFelder from "./PreisstaffelStichtagFelder";
import UrgencyStufeZeile, { UrgencySchwellenwertFelder } from "./UrgencyStufeZeile";
import UrgencyTextFeld from "./UrgencyTextFeld";
import WebsiteAnzeigeHinweis from "../WebsiteAnzeigeHinweis";
import { ladeWebsiteVerfuegbarkeit, beschreibeUrgencyStufe, setzeUrgencyPlatzhalter, urgencyBelegteSchwelle } from "@/lib/verfuegbarkeit";
import PreisstaffelZeile, { type PreisstaffelZeileDaten } from "./PreisstaffelZeile";
import KopierePreisstaffelnButton from "./KopierePreisstaffelnButton";
import PreisstaffelVorlagenAktionen from "./PreisstaffelVorlagenAktionen";
import DeaktivierenOptionButton from "./DeaktivierenOptionButton";
import OptionLoeschenButton from "./OptionLoeschenButton";
import NeueOptionSchnelleinfuegen from "./NeueOptionSchnelleinfuegen";
import OptionSchnelleinfuegen from "./OptionSchnelleinfuegen";
import OptionenImportExportTabs from "./OptionenImportExportTabs";
import {
  exportiereSchnelleinfuegenText,
  exportiereAlleSchnelleinfuegenText,
  pruefeSchnelleinfuegenRoundTrip,
} from "@/lib/schnelleinfuegen";
import { aktuellerPreisNetto, aktuellePreisstaffel, istPreisstaffelAktiv, letzterGueltigerTag, sortierteStaffeln, berlinKalendertag, berechneMonatlicheStichtageRueckwaerts, type PreisstaffelVorlage } from "@/lib/preisstaffeln";
import Link from "next/link";
import SeitenTabs from "../../SeitenTabs";
import UnterlagenVerwaltung from "./UnterlagenVerwaltung";
import { seminarLinks } from "@/lib/seminar-links";
import AufklappBereich from "../../AufklappBereich";

const badgeLabel: Record<string, string> = {
  empfohlen: "Empfohlen",
  meistgekauft: "Meistgekauft",
};

// Rein optische Unterscheidungshilfe beim Bearbeiten mehrerer Optionen (kein
// semantischer Status wie "Fehler"/"Warnung") -- als farbiger Streifen links an
// der Optionskarte statt vollflaechig eingefaerbter Karten. Reihenfolge folgt
// der Sortierung (1. gruen, 2. gelb, 3. rot, dann blau/lila/tuerkis).
const OPTION_AKZENT = ["#16a34a", "#ca8a04", "#dc2626", "#2563eb", "#9333ea", "#0891b2"];

function formatZeit(t: string | null) {
  return t ? t.slice(0, 5) + " Uhr" : "";
}

// Markiert ein hervorgehobenes ("neu") Feature in den Backstage-Vorschauen --
// gruener Kreis mit weissem Plus, angelehnt an das spaetere Onepage-Rendering
// (dort: grauer Haken fuer normale Punkte, gruener Plus-Kreis fuer
// hervorgehobene). Bewusst kein Stern -- liest sich sonst wie eine
// Bewertung/Favorit statt "zusaetzlich enthalten".
function HervorgehobenMarker({ inline = false }: { inline?: boolean } = {}) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      style={inline ? { verticalAlign: "-2px", marginRight: "0.3rem", flexShrink: 0 } : { position: "absolute", left: "0", top: "3px" }}
    >
      <title>Neu/hervorgehoben</title>
      <circle cx="8" cy="8" r="8" fill="#16A34A" />
      <path d="M8 4v8M4 8h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// Tabellenzeilen fuer die Preisstaffeln einer Option: "gilt ab" ist der Tag
// nach dem Ende der vorherigen Stufe (erste Stufe: offen), "gilt aktuell"
// dieselbe Stufe, die auch die oeffentliche API als Preis ausliefert
// (aktuellePreisstaffel, inkl. Fallback auf die letzte Stufe).
// Warnung, wenn die spaeteste Stufe vor dem Vortag des Seminars endet (siehe
// Kommentar in PreisstaffelStichtagFelder zum Normalpreis).
function normalpreisLuecke(staffeln: any[], datumStart: string): { name: string; bis: string } | null {
  if (!staffeln.length) return null;
  const letzte = sortierteStaffeln(staffeln, datumStart)[staffeln.length - 1];
  const bis = letzterGueltigerTag(letzte, datumStart);
  const vortag = letzterGueltigerTag({ stichtag_tage_vor_start: 0, stichtag_datum: null }, datumStart);
  return bis < vortag ? { name: letzte.name, bis } : null;
}

function preisstaffelZeilen(staffeln: any[], datumStart: string): PreisstaffelZeileDaten[] {
  const sortiert = sortierteStaffeln(staffeln, datumStart);
  const aktuell = aktuellePreisstaffel(sortiert, datumStart);
  let vorherBis: string | null = null;
  return sortiert.map((p) => {
    const bis = letzterGueltigerTag(p, datumStart);
    let ab: string | null = null;
    if (vorherBis) {
      const [j, m, t] = vorherBis.split("-").map(Number);
      ab = new Date(Date.UTC(j, m - 1, t + 1)).toISOString().slice(0, 10);
    }
    vorherBis = bis;
    return {
      id: p.id,
      name: p.name,
      preis: p.preis,
      waehrung: p.waehrung,
      sortierung: p.sortierung,
      stichtag_tage_vor_start: p.stichtag_datum ? null : p.stichtag_tage_vor_start,
      stichtag_kalendertag: p.stichtag_datum ? berlinKalendertag(p.stichtag_datum) : null,
      gilt_ab: ab,
      gilt_bis: bis,
      status: p === aktuell ? "aktuell" : istPreisstaffelAktiv(p, datumStart) ? "kommend" : "abgelaufen",
    };
  });
}

export default async function TerminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ importVon?: string }>;
}) {
  const { id } = await params;
  const { importVon } = await searchParams;
  const supabase = getSupabaseAdmin();

  // Alle folgenden Abfragen sind voneinander unabhaengig (jede filtert direkt
  // auf die Termin-ID aus der URL, keine haengt vom Ergebnis einer anderen ab).
  // Frueher wurden sie einzeln nacheinander mit await geladen -- bei ~12
  // Round-Trips a 150-300ms summierte sich das auf 10-15+ Sekunden pro
  // Seitenaufruf. Nach einer Formular-Aktion (z.B. Preisstaffel anlegen) rendert
  // Next.js dieselbe Seite fuer den Redirect ein zweites Mal in derselben
  // Funktionsausfuehrung -- das hat zusammen das Vercel-Timeout gerissen und zu
  // einer leeren Seite (503) gefuehrt, obwohl die Daten korrekt gespeichert
  // wurden. Mit Promise.all laufen alle Abfragen parallel (~1 Anfrage-Dauer
  // statt 12), das behebt das Timeout-Problem grundlegend.
  const [
    { data: termin },
    { data: seminartypen },
    { data: orte },
    { data: trainerListe },
    { data: optionen },
    { data: urgencyStufen },
    { data: mitarbeiterListe },
    { data: terminMitarbeiter },
    { data: protokoll },
    { data: buchungsPositionen },
    { data: legacyTeilnehmer },
    { data: zimmerpartner },
    { data: andereTermine },
    { data: alleOptionenFuerKopie },
    { data: preisstaffelVorlagen },
    { data: unterlagen },
  ] = await Promise.all([
    supabase
      .from("seminartermine")
      .select("*, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), trainer(name)")
      .eq("id", id)
      .single(),
    supabase.from("seminartypen").select("*").order("name"),
    supabase.from("veranstaltungsorte").select("*").order("name"),
    supabase.from("trainer").select("*").order("name"),
    supabase
      .from("seminartermin_optionen")
      .select("*, seminartermin_options_features(*), preisstaffeln(*)")
      .eq("seminartermin_id", id)
      .order("sortierung", { ascending: true })
      .order("erstellt_am", { ascending: true }),
    supabase
      .from("urgency_stufen")
      .select("*")
      .eq("seminartermin_id", id)
      .order("sortierung", { ascending: true }),
    supabase
      .from("mitarbeiter")
      .select("*")
      .eq("aktiv", true)
      .order("name"),
    supabase
      .from("seminartermin_mitarbeiter")
      .select("*, mitarbeiter(name)")
      .eq("seminartermin_id", id)
      .order("erstellt_am", { ascending: true }),
    supabase
      .from("aenderungsprotokoll")
      .select("*")
      .eq("bezug_typ", "seminartermin")
      .eq("bezug_id", id)
      .order("erstellt_am", { ascending: false }),
    supabase
      .from("buchungspositionen")
      .select(
        "teilnehmer_id, seminartermin_option_id, beschreibung, preis, buchungen(status, organisationen(name)), teilnehmer(id, vorname, nachname, email, telefon, mobiltelefon, ernaehrung_sonderwuensche, firma_freitext, rolle)"
      )
      .eq("seminartermin_id", id),
    supabase
      .from("legacy_buchungen")
      .select("teilnehmer(id, vorname, nachname, email, telefon, mobiltelefon, ernaehrung_sonderwuensche, firma_freitext, rolle), organisationen(name)")
      .eq("seminartermin_id", id),
    supabase
      .from("seminartermin_zimmerpartner")
      .select("id, teilnehmer_a:teilnehmer_id_a(id, vorname, nachname), teilnehmer_b:teilnehmer_id_b(id, vorname, nachname)")
      .eq("seminartermin_id", id),
    supabase
      .from("seminartermine")
      .select("id, kennung, titel, datum_start, seminartypen(name)")
      .neq("id", id)
      .order("datum_start", { ascending: true }),
    // Fuer "Preisstaffeln aus anderem Seminar kopieren" (ueber alle Termine
    // hinweg, nicht nur diesen) -- nur Optionen mit mind. einer Preisstaffel
    // sind als Quelle sinnvoll, der Rest wird unten herausgefiltert.
    supabase
      .from("seminartermin_optionen")
      .select("id, titel, preisstaffeln(id), seminartermine(kennung, titel, datum_start, seminartypen(name))"),
    // Gespeicherte Preisstaffel-Vorlagen fuer "Aus gespeicherter Vorlage laden"
    // (einmal fuer alle Optionen geladen, nicht pro Option).
    supabase.from("preisstaffel_vorlagen").select("*").order("name"),
    supabase.from("seminar_unterlagen").select("id, titel, datei_url, position").eq("seminartermin_id", id).order("position").order("erstellt_am"),
  ]);

  // Exakt dieselbe Berechnung wie /api/public/seminartermine/[id], die der
  // Onepage-Hero live abfragt -- damit "Website zeigt" hier nie von der
  // tatsaechlichen Anzeige abweicht.
  const websiteAnzeige = termin ? (await ladeWebsiteVerfuegbarkeit(supabase, [termin as any])).get(termin.id)! : null;
  const urgencyStufenZeilen = [...(urgencyStufen || [])]
    .sort((a: any, b: any) => urgencyBelegteSchwelle(a, termin?.kapazitaet ?? 0) - urgencyBelegteSchwelle(b, termin?.kapazitaet ?? 0))
    .map((u: any) => ({
      ...u,
      beschreibung: beschreibeUrgencyStufe(u),
      greiftAktuell: websiteAnzeige?.aktiveStufe?.id === u.id,
      textVorschau: setzeUrgencyPlatzhalter(u.text_vorlage, websiteAnzeige?.freiePlaetze ?? 0, termin?.kapazitaet ?? 0),
    }));

  // Optionen des gewaehlten Quell-Termins fuer den Options-Import (nur geladen,
  // wenn im Import-Panel bereits ein Quell-Termin ausgewaehlt wurde).
  const importQuellTermin = importVon ? (andereTermine as any[])?.find((t) => t.id === importVon) : null;
  const { data: importQuellOptionen } = importQuellTermin
    ? await supabase
        .from("seminartermin_optionen")
        .select("*, seminartermin_options_features(*), preisstaffeln(*)")
        .eq("seminartermin_id", importVon)
        .order("sortierung", { ascending: true })
    : { data: null as any[] | null };

  type TeilnehmerZeile = {
    id: string;
    name: string;
    orga: string;
    telefon: string;
    email: string;
    zimmer: string;
    essen: string;
    quelle: "aktuell" | "legacy";
    rolle: string;
  };

  const teilnehmerMap = new Map<string, TeilnehmerZeile>();

  (buchungsPositionen || []).forEach((p: any) => {
    if (p.buchungen?.status === "storniert") return;
    if (!p.teilnehmer) return;
    const bestehend = teilnehmerMap.get(p.teilnehmer.id);
    const hatZimmerUpgrade = p.seminartermin_option_id === null;
    if (bestehend) {
      if (hatZimmerUpgrade) bestehend.zimmer = p.beschreibung || "Ja";
      return;
    }
    teilnehmerMap.set(p.teilnehmer.id, {
      id: p.teilnehmer.id,
      name: `${p.teilnehmer.vorname} ${p.teilnehmer.nachname}`,
      orga: p.buchungen?.organisationen?.name || p.teilnehmer.firma_freitext || "—",
      telefon: p.teilnehmer.telefon || p.teilnehmer.mobiltelefon || "—",
      email: p.teilnehmer.email || "—",
      zimmer: hatZimmerUpgrade ? (p.beschreibung || "Ja") : "—",
      essen: p.teilnehmer.ernaehrung_sonderwuensche || "—",
      quelle: "aktuell",
      rolle: p.teilnehmer.rolle || "teilnehmer",
    });
  });

  (legacyTeilnehmer || []).forEach((l: any) => {
    if (!l.teilnehmer || teilnehmerMap.has(l.teilnehmer.id)) return;
    teilnehmerMap.set(l.teilnehmer.id, {
      id: l.teilnehmer.id,
      name: `${l.teilnehmer.vorname} ${l.teilnehmer.nachname}`,
      orga: l.organisationen?.name || l.teilnehmer.firma_freitext || "—",
      telefon: l.teilnehmer.telefon || l.teilnehmer.mobiltelefon || "—",
      email: l.teilnehmer.email || "—",
      zimmer: "—",
      essen: l.teilnehmer.ernaehrung_sonderwuensche || "—",
      quelle: "legacy",
      rolle: l.teilnehmer.rolle || "teilnehmer",
    });
  });

  const teilnehmerListe = [...teilnehmerMap.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const echteTeilnehmerAnzahl = teilnehmerListe.filter((t) => t.rolle === "teilnehmer").length;

  const rolleBadge: Record<string, string> = {
    mitarbeiter: "Mitarbeiter",
    organisator: "Organisator",
    gastreferent: "Gastreferent",
  };

  const partnerVonTeilnehmer = new Map<string, { name: string; zuordnungId: string }>();
  (zimmerpartner || []).forEach((z: any) => {
    if (!z.teilnehmer_a || !z.teilnehmer_b) return;
    partnerVonTeilnehmer.set(z.teilnehmer_a.id, {
      name: `${z.teilnehmer_b.vorname} ${z.teilnehmer_b.nachname}`,
      zuordnungId: z.id,
    });
    partnerVonTeilnehmer.set(z.teilnehmer_b.id, {
      name: `${z.teilnehmer_a.vorname} ${z.teilnehmer_a.nachname}`,
      zuordnungId: z.id,
    });
  });
  const anzahlZimmer = teilnehmerListe.length - (zimmerpartner?.length || 0);

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const titelAnzeige = termin.titel || termin.seminartypen?.name;
  const zeitraum = termin.datum_ende && termin.datum_ende !== termin.datum_start
    ? `${formatDatum(termin.datum_start)}${termin.zeit_start ? ", " + formatZeit(termin.zeit_start) : ""} bis ${formatDatum(termin.datum_ende)}${termin.zeit_ende ? ", " + formatZeit(termin.zeit_ende) : ""}`
    : `${formatDatum(termin.datum_start)}${termin.zeit_start ? ", " + formatZeit(termin.zeit_start) : ""}${termin.zeit_ende ? " – " + formatZeit(termin.zeit_ende) : ""}`;

  // Fuer "Preisstaffeln aus anderem Seminar kopieren" (pro Option angeboten):
  // alle Optionen mit mind. einer Preisstaffel, gruppiert nach Seminarkategorie,
  // je Gruppe sortiert nach Termin-Bezeichnung. Die aktuell bearbeitete Option
  // selbst wird erst beim Rendern pro Option herausgefiltert (dort ist ihre id
  // bekannt).
  const kopierbareOptionenFlat = ((alleOptionenFuerKopie as any[]) || [])
    .filter((o) => (o.preisstaffeln?.length || 0) > 0)
    .map((o) => ({
      id: o.id as string,
      titel: o.titel as string,
      seminartyp: o.seminartermine?.seminartypen?.name || "Ohne Kategorie",
      terminLabel: `${o.seminartermine?.kennung ? o.seminartermine.kennung + " – " : ""}${
        o.seminartermine?.titel || o.seminartermine?.seminartypen?.name || "Termin"
      } (${o.seminartermine?.datum_start ? formatDatum(o.seminartermine.datum_start) : "?"})`,
    }))
    .sort((a, b) => a.seminartyp.localeCompare(b.seminartyp, "de") || a.terminLabel.localeCompare(b.terminLabel, "de"));

  const kopierbareGruppenMap = new Map<string, typeof kopierbareOptionenFlat>();
  kopierbareOptionenFlat.forEach((o) => {
    if (!kopierbareGruppenMap.has(o.seminartyp)) kopierbareGruppenMap.set(o.seminartyp, []);
    kopierbareGruppenMap.get(o.seminartyp)!.push(o);
  });
  const kopierbareGruppen = [...kopierbareGruppenMap.entries()];

  // Der Zimmerupgrade-Aufpreis gilt pro Nacht (siehe zimmerupgrade_preis_pro_nacht_netto) --
  // die Naechteanzahl selbst wird nicht separat gepflegt, sondern immer aus
  // datum_start/datum_ende dieses Termins abgeleitet (Optionen haben keine
  // eigenen Datumsfelder, die Aufenthaltsdauer ist also fuer alle Optionen
  // eines Termins gleich).
  const terminNaechte = effektiveTerminNaechte(termin.datum_start, termin.datum_ende, termin.vorabendanreise_inklusive);

  // Deaktivierte Optionen bleiben in der Bearbeiten-Liste sichtbar (ausgegraut,
  // mit Badge), erscheinen aber nicht in der Vorschau -- die zeigt, wie es
  // auf Onepage aussieht, und dort werden deaktivierte Optionen ja gefiltert
  // (siehe app/api/public/seminartermine/*).
  const aktiveOptionen = (optionen || []).filter((o: any) => !o.deaktiviert_am);

  // Vorschau-Stichtage fuer die Preisstaffel-Vorlage "Monatlicher Stichtag
  // rueckwaerts" (gleich fuer alle Optionen dieses Termins, da nur von
  // termin.datum_start abhaengig) -- siehe wendePreisstaffelVorlageAn.
  const vorlagenStichtage = berechneMonatlicheStichtageRueckwaerts(termin.datum_start);

  const heuteISO = new Date().toISOString().slice(0, 10);
  const tageBisStart = Math.round((Date.parse(termin.datum_start) - Date.parse(heuteISO)) / 86400000);
  const kapazitaet = Number(termin.kapazitaet) || 0;
  const belegungAnteil = kapazitaet ? Math.min(1, echteTeilnehmerAnzahl / kapazitaet) : 0;
  const umsatzNetto = (buchungsPositionen || [])
    .filter((p: any) => p.buchungen?.status !== "storniert")
    .reduce((summe: number, p: any) => summe + Number(p.preis || 0), 0);
  const optionenMitWarnung = aktiveOptionen.filter(
    (o: any) => !(o.preisstaffeln || []).length || normalpreisLuecke(o.preisstaffeln || [], termin.datum_start)
  ).length;
  // Vorschau der Teilnehmer-Seiten mit dem Link des ersten echten Teilnehmers
  const vorschauTeilnehmer = teilnehmerListe.find((tl) => tl.rolle === "teilnehmer") || teilnehmerListe[0];
  const vorschauLinks = vorschauTeilnehmer ? seminarLinks(vorschauTeilnehmer.id, id) : null;
  const vorschauPerson = vorschauTeilnehmer?.name || "";
  const statusStil: Record<string, string> = { geplant: "au-badge-neutral", bestaetigt: "au-badge-success", unterbesetzt: "au-badge-warning", abgesagt: "au-badge-danger" };
  const ortText = [termin.veranstaltungsorte?.name, termin.veranstaltungsorte?.ort].filter(Boolean).join(", ");

  const uebersicht = (
    <div className="au-dash-raster">
      <div className="au-dash-haupt">
        <Bereich titel="Eckdaten" aktion={<a href="#einstellungen" className="au-panel-link">Bearbeiten →</a>}>
          <dl className="au-eckdaten">
            <dt>Zeitraum</dt><dd>{zeitraum}</dd>
            {termin.vorabend_anreise_datum && (<><dt>Vorabendanreise</dt><dd>{formatDatum(termin.vorabend_anreise_datum)}{termin.vorabend_anreise_uhrzeit ? `, ${formatZeit(termin.vorabend_anreise_uhrzeit)}` : ""}</dd></>)}
            <dt>Ort</dt><dd>{ortText || "—"}{termin.veranstaltungsorte?.nahe_grossstadt ? ` (bei ${termin.veranstaltungsorte.nahe_grossstadt})` : ""}</dd>
            <dt>Format</dt><dd>{termin.format === "praesenz" ? "Präsenz" : termin.format}</dd>
            <dt>Trainer</dt><dd>{termin.trainer?.name || "—"}</dd>
            <dt>Kapazität</dt><dd>{kapazitaet} Plätze · mind. {termin.mindestteilnehmerzahl ?? "—"} · +{termin.ueberbuchungspuffer ?? 0} Puffer intern</dd>
            {(termin.zusatzteilnehmer_preis || termin.zusatzteilnehmer_rabatt_prozent) && (<><dt>Weitere Person</dt><dd>{termin.zusatzteilnehmer_preis ? formatEUR(Number(termin.zusatzteilnehmer_preis)) : `${termin.zusatzteilnehmer_rabatt_prozent} % Rabatt`}</dd></>)}
            {termin.zimmerupgrade_preis_pro_nacht_netto && (<><dt>Zimmer-Upgrade</dt><dd>{termin.zimmerupgrade_beschreibung || "Upgrade"}: {formatEUR(Number(termin.zimmerupgrade_preis_pro_nacht_netto))} pro Nacht</dd></>)}
          </dl>
        </Bereich>

        <Bereich titel="Optionen & aktuelle Preise" aktion={<a href="#optionen" className="au-panel-link">Bearbeiten →</a>}>
          {!aktiveOptionen.length && <p className="au-leer">Noch keine Optionen – ohne Option ist der Termin nicht buchbar.</p>}
          <ul className="au-kompaktliste">
            {aktiveOptionen.map((o: any) => {
              const aktuell: any = (o.preisstaffeln || []).length ? aktuellePreisstaffel(o.preisstaffeln, termin.datum_start) : null;
              return (
                <li key={o.id}>
                  <span>{o.titel}{o.badge && <span className="au-badge au-badge-gold" style={{ marginLeft: "0.4rem" }}>{badgeLabel[o.badge] || o.badge}</span>}</span>
                  {aktuell ? (
                    <span style={{ textAlign: "right" }}>
                      <strong>{formatEUR(Number(aktuell.preis))}</strong>
                      <span className="au-klein" style={{ display: "block" }}>bis {formatDatum(letzterGueltigerTag(aktuell, termin.datum_start))}</span>
                    </span>
                  ) : (
                    <span className="au-text-danger">kein Preis</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Bereich>
      </div>
      <div className="au-dash-seite">
        {websiteAnzeige && (
          <Bereich titel="Website zeigt" aktion={<a href="#website" className="au-panel-link">Ändern →</a>}>
            <WebsiteAnzeigeHinweis anzeige={websiteAnzeige} termin={termin} />
          </Bereich>
        )}
        <Bereich titel="Teilnehmer" aktion={<a href="#teilnehmer" className="au-panel-link">Alle →</a>}>
          {!teilnehmerListe.length && <p className="au-leer">Noch keine Teilnehmer.</p>}
          <ul className="au-kompaktliste">
            {teilnehmerListe.slice(0, 8).map((t) => (
              <li key={t.id}>
                <Link href={`/teilnehmer/${t.id}`}>{t.name}</Link>
                <span className="au-klein">{rolleBadge[t.rolle] || t.orga}</span>
              </li>
            ))}
          </ul>
          {teilnehmerListe.length > 8 && <p className="au-klein" style={{ margin: "0.4rem 0 0" }}>+ {teilnehmerListe.length - 8} weitere</p>}
        </Bereich>
      </div>
    </div>
  );

  const gefahrenzone = (
    <Bereich titel="Termin stornieren oder löschen">
      <div className="au-gefahr">
        <div>
          <strong>{termin.status === "abgesagt" ? "Termin wieder aktivieren" : "Termin stornieren"}</strong>
          <p className="au-klein" style={{ margin: "0.2rem 0 0" }}>
            {termin.status === "abgesagt"
              ? "Setzt den Termin zurück auf „geplant“ – er erscheint wieder auf der Website und ist buchbar."
              : "Verschwindet von der Website. Bestehende Buchungen bleiben erhalten und können umgebucht werden. Du bekommst vorher eine Bestätigungsseite."}
          </p>
        </div>
        {termin.status === "abgesagt" ? (
          <form action={reaktiviereSeminartermin}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Wieder aktivieren</button>
          </form>
        ) : (
          <form action={previewSeminarterminStornieren}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-danger au-btn-sm">Stornieren …</button>
          </form>
        )}
      </div>
      <div className="au-gefahr">
        <div>
          <strong>Termin löschen</strong>
          <p className="au-klein" style={{ margin: "0.2rem 0 0" }}>Endgültig. Du bekommst vorher eine Bestätigungsseite mit allem, was betroffen ist.</p>
        </div>
        <form action={previewSeminarterminLoeschen}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen …</button>
        </form>
      </div>
    </Bereich>
  );

  return (
    <main>
      <p className="au-brotkrumen"><Link href="/termine">Seminartermine</Link> <span>›</span> {termin.kennung || titelAnzeige}</p>
      <header className="au-dash-kopf">
        <div style={{ minWidth: 0 }}>
          <p className="au-dash-datum">
            {termin.seminartypen?.name}
            {termin.kennung && <> · <span className="au-badge au-badge-neutral">{termin.kennung}</span></>}
            {" "}<span className={`au-badge ${statusStil[termin.status] || "au-badge-neutral"}`}>{termin.status === "bestaetigt" ? "bestätigt" : termin.status}</span>
          </p>
          <h1>{titelAnzeige}</h1>
          <p className="au-termin-unterzeile">{zeitraum}{ortText ? ` · ${ortText}` : ""}{termin.trainer?.name ? ` · ${termin.trainer.name}` : ""}</p>
        </div>
        <div className="au-dash-aktionen">
          <Link href={`/termine/${id}/teilnehmerliste`} className="au-btn au-btn-secondary au-btn-sm">Hotel-Liste</Link>
          <form action={duplicateSeminartermin}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm" title="Legt eine Kopie dieses Termins inkl. Optionen, Featurelisten, Preisstaffeln und Urgency-Stufen an">
              Duplizieren
            </button>
          </form>
        </div>
      </header>

      <div className="au-kennzahlen">
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Belegung</div>
          <div className="au-kennzahl-wert">{echteTeilnehmerAnzahl}<span className="au-kennzahl-von"> / {kapazitaet}</span></div>
          <span className="au-belegung-balken" style={{ margin: "0.3rem 0 0.35rem" }}><span style={{ width: `${belegungAnteil * 100}%`, background: echteTeilnehmerAnzahl < (termin.mindestteilnehmerzahl || 0) ? "var(--color-warning)" : undefined }} /></span>
          <div className="au-kennzahl-kontext">
            {echteTeilnehmerAnzahl < (termin.mindestteilnehmerzahl || 0)
              ? `noch ${(termin.mindestteilnehmerzahl || 0) - echteTeilnehmerAnzahl} bis zur Mindestzahl`
              : `Mindestzahl ${termin.mindestteilnehmerzahl ?? "—"} erreicht`}
          </div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Personen vor Ort</div>
          <div className="au-kennzahl-wert">{teilnehmerListe.length}</div>
          <div className="au-kennzahl-kontext">{anzahlZimmer} {anzahlZimmer === 1 ? "Zimmer" : "Zimmer"}{zimmerpartner?.length ? ` · ${zimmerpartner.length} geteilt` : ""}</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Umsatz netto</div>
          <div className="au-kennzahl-wert">{formatEUR(umsatzNetto)}</div>
          <div className="au-kennzahl-kontext">brutto {formatEURBrutto(umsatzNetto)} · neues System</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">{tageBisStart >= 0 ? "Bis zum Start" : "Seit dem Start"}</div>
          <div className="au-kennzahl-wert">{Math.abs(tageBisStart)} <span className="au-kennzahl-von">{Math.abs(tageBisStart) === 1 ? "Tag" : "Tage"}</span></div>
          <div className="au-kennzahl-kontext">{formatDatum(termin.datum_start)}</div>
        </div>
      </div>

      <SeitenTabs
        speicherSchluessel={`termin-${id}`}
        ariaLabel="Bereiche des Termins"
        tabs={[
          { key: "uebersicht", label: "Übersicht", inhalt: uebersicht },
          {
            key: "teilnehmer",
            label: "Teilnehmer",
            anzahl: echteTeilnehmerAnzahl,
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel={`Teilnehmer · ${echteTeilnehmerAnzahl}`} aktion={<Link href={`/termine/${id}/teilnehmerliste`} className="au-panel-link">Hotel-Liste zum Kopieren →</Link>}>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Alle Personen, die für diesen Termin gebucht haben oder (aus Alt-Daten) hatten — inklusive zugeordneter Legacy-Buchungen.
          {zimmerpartner && zimmerpartner.length > 0 && <> · {anzahlZimmer} Zimmer benötigt ({zimmerpartner.length} geteilt)</>}
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Organisation</th>
              <th>Telefon</th>
              <th>E-Mail</th>
              <th>Zimmer</th>
              <th>Essen</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            {teilnehmerListe.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/teilnehmer/${t.id}`}>{t.name}</Link>
                  {rolleBadge[t.rolle] && (
                    <span className="au-badge au-badge-gold" style={{ marginLeft: "0.5rem", fontSize: "0.72rem" }}>
                      {rolleBadge[t.rolle]}
                    </span>
                  )}
                </td>
                <td>{t.orga}</td>
                <td>{t.telefon}</td>
                <td>{t.email}</td>
                <td>
                  {t.zimmer}
                  {partnerVonTeilnehmer.has(t.id) && (
                    <>
                      {t.zimmer !== "—" ? " · " : ""}
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.82rem" }}>
                        teilt Zimmer mit {partnerVonTeilnehmer.get(t.id)!.name}
                      </span>
                    </>
                  )}
                </td>
                <td>{t.essen}</td>
                <td>{t.quelle === "legacy" ? <span className="au-badge">Alt-Daten</span> : "Aktuell"}</td>
              </tr>
            ))}
            {!teilnehmerListe.length && (
              <tr className="au-table-empty"><td colSpan={7}>Noch keine Teilnehmer für diesen Termin.</td></tr>
            )}
          </tbody>
        </table>
      </Bereich>

      <Bereich titel="Zimmerpartner">
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Für Paare (z. B. Ehepaare), die sich ein Zimmer teilen — reduziert die Zimmerzahl automatisch, beide Personen bleiben in der Teilnehmerliste sichtbar.
        </p>
        {zimmerpartner && zimmerpartner.length > 0 && (
          <table className="au-table" style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th>Person A</th>
                <th>Person B</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zimmerpartner.map((z: any) => (
                <tr key={z.id}>
                  <td>{z.teilnehmer_a ? `${z.teilnehmer_a.vorname} ${z.teilnehmer_a.nachname}` : "—"}</td>
                  <td>{z.teilnehmer_b ? `${z.teilnehmer_b.vorname} ${z.teilnehmer_b.nachname}` : "—"}</td>
                  <td>
                    <form action={entferneZimmerpartner} style={{ display: "inline" }}>
                      <input type="hidden" name="zuordnung_id" value={z.id} />
                      <input type="hidden" name="seminartermin_id" value={id} />
                      <button type="submit" className="au-link-danger">entfernen</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {teilnehmerListe.length >= 2 ? (
          <form action={setzeZimmerpartner} className="au-row-2">
            <input type="hidden" name="seminartermin_id" value={id} />
            <div>
              <label className="au-label">Person A</label>
              <select className="au-input" name="teilnehmer_id_a" required>
                <option value="">— wählen —</option>
                {teilnehmerListe.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="au-label">Person B</label>
              <select className="au-input" name="teilnehmer_id_b" required>
                <option value="">— wählen —</option>
                {teilnehmerListe.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="au-btn au-btn-primary">Als Zimmerpartner verknüpfen</button>
            </div>
          </form>
        ) : (
          <p style={{ color: "var(--color-text-faint)", fontSize: "0.85rem" }}>Mindestens 2 Teilnehmer nötig.</p>
        )}
      </Bereich>

      <Bereich titel="Mitarbeiter beim Termin">
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Referenten/Assistenz, die bei diesem Termin dabei sind — nicht als Teilnehmer, sondern als Personal erfasst.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terminMitarbeiter?.map((tm: any) => (
              <tr key={tm.id}>
                <td>{tm.mitarbeiter?.name}</td>
                <td>{tm.rolle}</td>
                <td>
                  <form action={removeMitarbeiterVonTermin} style={{ display: "inline" }}>
                    <input type="hidden" name="zuordnung_id" value={tm.id} />
                    <input type="hidden" name="seminartermin_id" value={id} />
                    <button type="submit" className="au-link-danger">entfernen</button>
                  </form>
                </td>
              </tr>
            ))}
            {!terminMitarbeiter?.length && (
              <tr><td colSpan={3} style={{ color: "var(--color-text-faint)" }}>Noch keine Mitarbeiter zugeordnet.</td></tr>
            )}
          </tbody>
        </table>
        <form action={addMitarbeiterZuTermin} className="au-row-2">
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label className="au-label">Mitarbeiter</label>
            <select className="au-input" name="mitarbeiter_id" required>
              <option value="">— wählen —</option>
              {mitarbeiterListe?.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="au-label">Rolle</label>
            <select className="au-input" name="rolle" defaultValue="Referent">
              <option value="Referent">Referent</option>
              <option value="Assistenz">Assistenz</option>
              <option value="Co-Trainer">Co-Trainer</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="au-btn au-btn-primary">Mitarbeiter zuordnen</button>
          </div>
        </form>
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Fehlt jemand in der Liste? Unter <a href="/mitarbeiter" >Mitarbeiter</a> neu anlegen.
        </p>
      </Bereich>

              </div>
            ),
          },
          {
            key: "optionen",
            label: "Optionen & Preise",
            anzahl: aktiveOptionen.length,
            warnung: optionenMitWarnung > 0,
            inhalt: (
      <div className="au-optionen">
        <p className="au-bereich-hinweis">
          Jede Option ist ein eigenes buchbares Paket mit Titel, Beschreibung, Features und Preisstufen (Frühbucher bis Normalpreis). Klick auf „Bearbeiten“ öffnet Inhalt, Features und Preise einer Option.
        </p>

        <AufklappBereich
          merkSchluessel={`vorschau-${id}`}
          className="au-aufklapp-panel"
          zusammenfassung={<><strong>Website-Vorschau</strong><span className="au-klein"> · so erscheinen die {aktiveOptionen.length} aktiven Optionen ungefähr auf Onepage</span></>}
        >
        {aktiveOptionen.length ? (
          <div className="au-option-preview-grid">
            {aktiveOptionen.map((opt: any) => {
              const previewPreis = aktuellerPreisNetto(opt.preisstaffeln || [], termin.datum_start);
              const featuresSortiert = (opt.seminartermin_options_features || [])
                .slice()
                .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0));
              return (
                <div
                  key={opt.id}
                  className={`au-option-preview-card ${opt.badge === "empfohlen" ? "au-option-preview-card-empfohlen" : ""}`}
                >
                  {opt.badge && <span className="au-badge au-badge-gold">{badgeLabel[opt.badge] || opt.badge}</span>}
                  <p className="au-option-preview-title">{opt.titel}</p>
                  {opt.beschreibung && <p className="au-option-preview-desc">{renderFett(opt.beschreibung)}</p>}
                  {previewPreis !== null ? (
                    <p className="au-option-preview-price">
                      {formatEUR(previewPreis)}
                      <span className="au-option-preview-price-hinweis"> netto · {formatEURBrutto(previewPreis)} brutto</span>
                    </p>
                  ) : (
                    <p className="au-option-preview-price-fehlt">Noch kein Preis hinterlegt</p>
                  )}
                  {opt.vorspann_anzeigen && opt.vorspann_text && (
                    <p style={{ fontWeight: 600, fontSize: "0.85rem", margin: "0.4rem 0 0.1rem" }}>{renderFett(opt.vorspann_text)}</p>
                  )}
                  {featuresSortiert.length > 0 && (
                    <ul className="au-option-preview-features">
                      {featuresSortiert.map((f: any) => (
                        <li key={f.id} className={f.hervorgehoben ? "au-feature-hervorgehoben" : undefined}>
                          {f.hervorgehoben && <HervorgehobenMarker />}
                          {f.label && <strong>{renderFett(f.label)}: </strong>}
                          {renderFett(f.text)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {opt.zusatz_teilnehmer_hinweis && (
                    <p className="au-option-preview-zusatz">{renderFett(opt.zusatz_teilnehmer_hinweis)}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="au-option-preview-empty">Noch keine Optionen angelegt – die Vorschau erscheint hier, sobald mindestens eine Option existiert.</div>
        )}
        </AufklappBereich>

        {optionen?.map((opt: any, optIndex: number) => (
          <div
            key={opt.id}
            className={`au-option-karte${opt.deaktiviert_am ? " deaktiviert" : ""}`}
            style={{ borderLeftColor: OPTION_AKZENT[optIndex % OPTION_AKZENT.length] }}
          >
            {(() => {
              const staffeln = opt.preisstaffeln || [];
              const aktuell: any = staffeln.length ? aktuellePreisstaffel(staffeln, termin.datum_start) : null;
              const luecke = normalpreisLuecke(staffeln, termin.datum_start);
              const features = (opt.seminartermin_options_features || []).length;
              return (
                <div className="au-option-kopf">
                  <div className="au-option-titelbereich">
                    <div className="au-option-titelzeile">
                      <strong>{opt.titel}</strong>
                      {opt.badge && <span className="au-badge au-badge-gold">{badgeLabel[opt.badge] || opt.badge}</span>}
                      {opt.deaktiviert_am && <span className="au-badge au-badge-neutral">Deaktiviert</span>}
                    </div>
                    {opt.beschreibung && <p className="au-option-beschreibung">{renderFett(opt.beschreibung)}</p>}
                    <div className="au-option-meta">
                      {aktuell ? (
                        <span className="au-option-preis">
                          {formatEUR(Number(aktuell.preis))} <span className="au-klein">netto · {aktuell.name}, bis {formatDatum(letzterGueltigerTag(aktuell, termin.datum_start))}</span>
                        </span>
                      ) : (
                        <span className="au-badge au-badge-danger">Kein Preis hinterlegt</span>
                      )}
                      <span className="au-klein">{features} {features === 1 ? "Feature" : "Features"}</span>
                      <span className="au-klein">{staffeln.length} {staffeln.length === 1 ? "Preisstufe" : "Preisstufen"}</span>
                      {opt.ratenzahlung_aktiv && <span className="au-klein">Ratenzahlung ({opt.ratenzahlung_anzahl_raten || "?"}×)</span>}
                      {luecke && <span className="au-badge au-badge-warning" title={`„${luecke.name}“ endet schon am ${formatDatum(luecke.bis)}`}>Normalpreis endet zu früh</span>}
                    </div>
                  </div>
                  <div className="au-option-werkzeuge">
                <form action={moveSeminarOption}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <input type="hidden" name="richtung" value="hoch" />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm" disabled={optIndex === 0} title="Option nach oben verschieben">↑</button>
                </form>
                <form action={moveSeminarOption}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <input type="hidden" name="richtung" value="runter" />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm" disabled={optIndex === (optionen?.length || 0) - 1} title="Option nach unten verschieben">↓</button>
                </form>
                <form action={duplicateSeminarOption}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm" title="Legt eine Kopie dieser Option (inkl. Features und Preisstaffeln) an, z. B. als Basis für Option B">
                    Duplizieren
                  </button>
                </form>
                <OptionLoeschenButton optionId={opt.id} seminarterminId={id} titel={opt.titel || ""} loeschenAction={loescheSeminarOption} />
                  </div>
                </div>
              );
            })()}

            <AufklappBereich merkSchluessel={`option-${opt.id}`} className="au-option-details" zusammenfassung={<span>Bearbeiten: Inhalt, Features &amp; Preise</span>}>
            <h4 className="au-option-abschnitt">Inhalt &amp; Einstellungen</h4>
            <details className="au-unterklapp">
              <summary>Titel, Beschreibung, Vorspann, Ratenzahlung …</summary>
              <OptionSchnelleinfuegen
                seminarterminOptionId={opt.id}
                seminarterminId={id}
                titelAktuell={opt.titel || ""}
                beschreibungAktuell={opt.beschreibung || ""}
                featuresAnzahlAktuell={(opt.seminartermin_options_features || []).length}
                uebernehmenAction={uebernehmeOptionSchnelleinfuegen}
                exportText={exportiereSchnelleinfuegenText(opt)}
                exportHinweise={pruefeSchnelleinfuegenRoundTrip(opt)}
              />
              <form action={updateSeminarOption} style={{ marginTop: "0.6rem", maxWidth: 480 }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <label className="au-label">Titel</label>
                <input className="au-input" name="titel" defaultValue={opt.titel} required />
                <label className="au-label">Beschreibung</label>
                <FettTextarea name="beschreibung" defaultValue={opt.beschreibung || ""} placeholder="Kurze Beschreibung dieser Option" />
                <label className="au-label">Vorspann-Text (nur wenn diese Option auf einer günstigeren Option aufbaut)</label>
                <input className="au-input" name="vorspann_text" defaultValue={opt.vorspann_text || ""} placeholder='z. B. "Alles aus Move, plus:"' />
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  <input type="checkbox" name="vorspann_anzeigen" defaultChecked={opt.vorspann_anzeigen || false} /> Vorspann-Text anzeigen
                </label>
                <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "-0.5rem 0 0.75rem" }}>
                  Text kann stehen bleiben, auch wenn er gerade nicht angezeigt werden soll – einfach den Schalter ausschalten statt den Text zu löschen.
                </p>
                <label className="au-label">Sortierung (0 = zuerst)</label>
                <input className="au-input" name="sortierung" type="number" defaultValue={opt.sortierung ?? 0} />
                <label className="au-label">Zusätzliche Nächte für Zimmer-Upgrade (nur bei Verlängerung/Zusatzübernachtung, sonst leer lassen)</label>
                <input className="au-input" name="zimmerupgrade_zusatznaechte" type="number" min={0} defaultValue={opt.zimmerupgrade_zusatznaechte || ""} placeholder="z. B. 1" />
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.9rem" }}>
                  <input type="checkbox" name="ratenzahlung_aktiv" defaultChecked={opt.ratenzahlung_aktiv || false} /> Ratenzahlung anbieten
                </label>
                <label className="au-label">Anzahl Raten (nur bei aktiver Ratenzahlung relevant)</label>
                <input className="au-input" name="ratenzahlung_anzahl_raten" type="number" min={2} defaultValue={opt.ratenzahlung_anzahl_raten || ""} placeholder="z. B. 3" />
                <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "-0.5rem 0 0.75rem" }}>
                  Reine Zahlungsvereinbarung, keine automatische Abbuchung — 1. Rate sofort fällig, restliche Raten gleich hoch auf die Folgemonate verteilt (Rundungsdifferenz bei der letzten Rate). Zahlungseingänge weiterhin manuell auf der Buchung markieren.
                </p>
                <label className="au-label">Hinweis: zusätzlicher Teilnehmer (erscheint unter der Preistabelle auf Onepage)</label>
                <FettTextarea
                  name="zusatz_teilnehmer_hinweis"
                  defaultValue={opt.zusatz_teilnehmer_hinweis || ""}
                  placeholder="z. B. Jeder weitere zusätzliche Teilnehmer aus Deiner Agentur im Seminar pro Person 3.480 €. Inklusive drei Übernachtungen im Einzelzimmer mit Frühstück, drei gemeinsamen Mittag- und Abendessen. Inklusive allen Getränken (exklusive Hotelbar)"
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="au-btn au-btn-secondary">Speichern</button>
                </div>
              </form>
              {opt.deaktiviert_am ? (
                <form action={reaktiviereSeminarOption} style={{ marginTop: "0.5rem" }}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Wieder aktivieren</button>
                </form>
              ) : (
                <form action={deaktivierenSeminarOption} style={{ marginTop: "0.5rem" }}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <DeaktivierenOptionButton titel={opt.titel} />
                </form>
              )}
            </details>

            <form action={updateOptionBadge} style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" }}>
              <input type="hidden" name="seminartermin_option_id" value={opt.id} />
              <input type="hidden" name="seminartermin_id" value={id} />
              <label className="au-label" style={{ marginBottom: 0 }}>Kennzeichnung</label>
              <select name="badge" defaultValue={opt.badge || ""} style={{ padding: "0.35rem" }}>
                <option value="">Keine</option>
                <option value="empfohlen">Empfohlen</option>
                <option value="meistgekauft">Meistgekauft</option>
              </select>
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
            </form>

            <div style={{ marginTop: "0.75rem" }}>
              <h4 className="au-option-abschnitt">Features</h4>
              <ul style={{ margin: "0.35rem 0 0.5rem", paddingLeft: "1.2rem" }}>
                {(() => {
                  const featuresGeordnet = [...(opt.seminartermin_options_features || [])].sort(
                    (a: any, b: any) => a.sortierung - b.sortierung || new Date(a.erstellt_am).getTime() - new Date(b.erstellt_am).getTime()
                  );
                  return featuresGeordnet.map((f: any, idx: number) => (
                    <li
                      key={f.id}
                      style={{
                        fontSize: "0.9rem",
                        listStyle: "none",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                        background: "#fafafa",
                        padding: "0.5rem 0.65rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", flex: 1, minWidth: 160 }}>
                          {f.hervorgehoben && <HervorgehobenMarker inline />}
                          {f.label && <strong>{renderFett(f.label)}: </strong>}
                          {renderFett(f.text)}
                        </span>
                        <form action={moveOptionFeature} style={{ display: "inline" }}>
                          <input type="hidden" name="feature_id" value={f.id} />
                          <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                          <input type="hidden" name="seminartermin_id" value={id} />
                          <input type="hidden" name="richtung" value="hoch" />
                          <button type="submit" className="au-btn au-btn-secondary au-btn-sm" disabled={idx === 0} title="Nach oben verschieben">↑</button>
                        </form>
                        <form action={moveOptionFeature} style={{ display: "inline" }}>
                          <input type="hidden" name="feature_id" value={f.id} />
                          <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                          <input type="hidden" name="seminartermin_id" value={id} />
                          <input type="hidden" name="richtung" value="runter" />
                          <button type="submit" className="au-btn au-btn-secondary au-btn-sm" disabled={idx === featuresGeordnet.length - 1} title="Nach unten verschieben">↓</button>
                        </form>
                        <form action={deleteOptionFeature} style={{ display: "inline" }}>
                          <input type="hidden" name="feature_id" value={f.id} />
                          <input type="hidden" name="seminartermin_id" value={id} />
                          <button type="submit" className="au-link-danger">entfernen</button>
                        </form>
                      </div>
                      <details style={{ marginTop: "0.4rem" }}>
                        <summary style={{ cursor: "pointer", color: "#0B1B33", fontWeight: 600, fontSize: "0.8rem" }}>bearbeiten</summary>
                        <form action={updateOptionFeature} style={{ marginTop: "0.5rem" }}>
                          <input type="hidden" name="feature_id" value={f.id} />
                          <input type="hidden" name="seminartermin_id" value={id} />
                          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                            <input className="au-input" name="label" defaultValue={f.label || ""} placeholder="Label (optional)" style={{ maxWidth: 240, flex: "0 1 240px" }} />
                            <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                              <input type="checkbox" name="hervorgehoben" defaultChecked={f.hervorgehoben || false} /> hervorheben (+)
                            </label>
                          </div>
                          <FettInput name="text" defaultValue={f.text} required />
                          <button type="submit" className="au-btn au-btn-secondary au-btn-sm" style={{ marginTop: "0.5rem" }}>Speichern</button>
                        </form>
                      </details>
                    </li>
                  ));
                })()}
                {!opt.seminartermin_options_features?.length && (
                  <li style={{ fontSize: "0.9rem", color: "var(--color-text-faint)", listStyle: "none", marginLeft: "-1.2rem" }}>Noch keine Features.</li>
                )}
              </ul>
              <form
                action={createOptionFeature}
                style={{ border: "1px dashed var(--color-border)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.65rem" }}
              >
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                  <input className="au-input" name="label" placeholder="Label (optional)" style={{ maxWidth: 240, flex: "0 1 240px" }} />
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                    <input type="checkbox" name="hervorgehoben" /> hervorheben (+)
                  </label>
                </div>
                <FettInput name="text" placeholder="z. B. Einzelcoaching inklusive" required />
                <button type="submit" className="au-btn au-btn-secondary" style={{ marginTop: "0.5rem" }}>+ Feature</button>
              </form>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <h4 className="au-option-abschnitt">Preise <span className="au-klein">(netto, zzgl. USt.)</span></h4>
              {(() => {
                const luecke = normalpreisLuecke(opt.preisstaffeln || [], termin.datum_start);
                return luecke ? (
                  <div className="au-banner au-banner-warning" style={{ margin: "0.35rem 0", padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
                    Die letzte Stufe „{luecke.name}“ endet schon am {formatDatum(luecke.bis)}. Danach gilt ihr Preis zwar automatisch weiter,
                    aber Onepage zeigt ein abgelaufenes „gilt bis“-Datum. Bei „{luecke.name}“ auf „bearbeiten“ → „dem Tag vor Seminarstart (Normalpreis)“ stellen.
                  </div>
                ) : null;
              })()}
              <table className="au-table" style={{ margin: "0.35rem 0 0.5rem" }}>
                <thead>
                  <tr>
                    <th>Preisstufe</th>
                    <th>gilt ab</th>
                    <th>gilt bis einschl.</th>
                    <th>Preis (netto)</th>
                    <th>Preis (brutto, 19% USt.)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {preisstaffelZeilen(opt.preisstaffeln || [], termin.datum_start).map((z) => (
                    <PreisstaffelZeile
                      key={z.id}
                      staffel={z}
                      terminStart={termin.datum_start}
                      seminarterminId={id}
                      updateAction={updatePreisstaffel}
                      deleteAction={deletePreisstaffel}
                    />
                  ))}
                  {!opt.preisstaffeln?.length && (
                    <tr><td colSpan={6} style={{ color: "var(--color-text-faint)" }}>Noch keine Preisstaffeln.</td></tr>
                  )}
                </tbody>
              </table>
              <details style={{ margin: "0.25rem 0 0.5rem" }}>
                <summary style={{ cursor: "pointer", color: "#0B1B33", fontSize: "0.85rem", fontWeight: 600 }}>+ Preisstufe hinzufügen</summary>
                <form action={createPreisstaffel} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", alignItems: "start", marginTop: "0.5rem" }}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <div>
                    <label className="au-label">Name der Preisstufe (z. B. Frühbucher)</label>
                    <input className="au-input" name="name" required />
                  </div>
                  <div>
                    <label className="au-label">Preis (€, netto zzgl. USt.)</label>
                    <input className="au-input" name="preis" type="number" step="0.01" required />
                  </div>
                  <PreisstaffelStichtagFelder terminStart={termin.datum_start} />
                  <div style={{ alignSelf: "end" }}>
                    <button type="submit" className="au-btn au-btn-secondary">Preisstufe anlegen</button>
                  </div>
                </form>
              </details>

              <PreisstaffelVorlagenAktionen
                seminarterminOptionId={opt.id}
                seminarterminId={id}
                terminDatumStart={termin.datum_start}
                vorlagen={(preisstaffelVorlagen || []) as PreisstaffelVorlage[]}
                bestehendeStaffeln={opt.preisstaffeln || []}
                ersetzenAction={ersetzePreisstaffelnDurchVorlage}
                alsVorlageSpeichernAction={speicherePreisstaffelnAlsVorlage}
              />

              <details style={{ marginTop: "0.5rem" }}>
                <summary style={{ cursor: "pointer", color: "#0B1B33", fontWeight: 600, fontSize: "0.85rem" }}>
                  Preisstaffel-Vorlage anwenden (monatlicher Stichtag rückwärts)
                </summary>
                <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "0.5rem 0" }}>
                  Legt 5 Preisstufen mit 4 Stichtagen an (jeweils der erste Donnerstag eines Monats, monatlich rückwärts ab dem Monat vor Terminstart) — rein additiv, bestehende Preisstaffeln bleiben unverändert. Bereits verstrichene Stichtage werden beim Anlegen einfach übersprungen.
                </p>
                <form action={wendePreisstaffelVorlageAn} style={{ marginTop: "0.5rem", maxWidth: 520 }}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <label className="au-label">Stufe 1 – Basispreis (€, netto, gültig bis {formatDatum(vorlagenStichtage[0])})</label>
                  <input className="au-input" name="basispreis" type="number" step="0.01" required />
                  {vorlagenStichtage.map((datum, idx) => (
                    <div key={idx} className="au-row-2" style={{ alignItems: "flex-end" }}>
                      <div>
                        <label className="au-label">
                          Übergang {idx + 1} (ab {formatDatum(datum)}
                          {idx === 3 ? ", ~4 Wochen vor Termin" : ""})
                        </label>
                        <select className="au-select" name={`uebergang_${idx + 1}_modus`} defaultValue="betrag">
                          <option value="betrag">Plus Betrag (€)</option>
                          <option value="prozent">Plus Prozent (%)</option>
                          <option value="manuell">Manueller Preis (€)</option>
                        </select>
                      </div>
                      <div>
                        <label className="au-label">Wert</label>
                        <input className="au-input" name={`uebergang_${idx + 1}_wert`} type="number" step="0.01" required />
                      </div>
                    </div>
                  ))}
                  <button type="submit" className="au-btn au-btn-secondary" style={{ marginTop: "0.5rem" }}>
                    Vorlage anwenden
                  </button>
                </form>
              </details>

              <details style={{ marginTop: "0.5rem" }}>
                <summary style={{ cursor: "pointer", color: "#0B1B33", fontWeight: 600, fontSize: "0.85rem" }}>
                  Preisstaffeln aus anderem Seminar kopieren
                </summary>
                <form
                  action={copyPreisstaffelnFromOption}
                  style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}
                >
                  <input type="hidden" name="ziel_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <label className="au-label">Quell-Option (Seminarkategorie – Termin – Option)</label>
                    <select className="au-select" name="quell_option_id" required defaultValue="">
                      <option value="" disabled>— bitte wählen —</option>
                      {kopierbareGruppen.map(([seminartyp, gruppe]) => {
                        const wählbar = gruppe.filter((k) => k.id !== opt.id);
                        if (!wählbar.length) return null;
                        return (
                          <optgroup key={seminartyp} label={seminartyp}>
                            {wählbar.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.terminLabel} – {k.titel}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                  <KopierePreisstaffelnButton ersetztBestehende={(opt.preisstaffeln?.length || 0) > 0} />
                </form>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-faint)", margin: "0.3rem 0 0" }}>
                  {(opt.preisstaffeln?.length || 0) > 0
                    ? `Ersetzt alle ${opt.preisstaffeln.length} bestehende(n) Preisstaffel(n) dieser Option. `
                    : ""}
                  Feste Datums-Stichtage werden unverändert mitkopiert und im Namen mit „(Datum ggf. anpassen)" markiert – der Kalendertag der Quelloption passt ggf. nicht zum Starttermin dieser Option und sollte danach geprüft werden.
                </p>
              </details>
            </div>
            </AufklappBereich>
          </div>
        ))}
        {!optionen?.length && (
          <p style={{ color: "var(--color-text-faint)" }}>Noch keine Optionen angelegt.</p>
        )}

        <OptionenImportExportTabs
          exportText={exportiereAlleSchnelleinfuegenText(optionen || [])}
          exportHinweise={(optionen || []).map((o: any) => ({ titel: o.titel, texte: pruefeSchnelleinfuegenRoundTrip(o) }))}
          anzahlOptionen={optionen?.length || 0}
          anzahlDeaktiviert={(optionen || []).filter((o: any) => o.deaktiviert_am).length}
        >
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
            Praktisch, wenn dieser Termin die gleichen (oder fast gleichen) Optionen wie ein bestehender Termin braucht – z. B. aus einem anderen Seminartyp. Quell-Termin waehlen, gewuenschte Option(en) ankreuzen, importieren. Importierte Optionen sind eigenstaendige Kopien (inkl. Features und Preisstaffeln) und koennen danach hier ganz normal bearbeitet werden, ohne den Quell-Termin zu beeinflussen.
          </p>
          <form method="GET" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label className="au-label">Quell-Termin</label>
              <select name="importVon" defaultValue={importVon || ""} style={{ padding: "0.45rem", minWidth: 320 }}>
                <option value="">– Termin auswählen –</option>
                {andereTermine?.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.kennung ? `${t.kennung} · ` : ""}{t.titel || t.seminartypen?.name || "Ohne Titel"} ({formatDatum(t.datum_start)})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="au-btn au-btn-secondary">Optionen anzeigen</button>
          </form>

          {importQuellTermin && (
            <div style={{ marginTop: "1rem" }}>
              {importQuellOptionen?.length ? (
                <form action={importSeminarOptions}>
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", margin: "0.5rem 0 0.85rem" }}>
                    {importQuellOptionen.map((opt: any) => (
                      <label key={opt.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.9rem", cursor: "pointer" }}>
                        <input type="checkbox" name="option_ids" value={opt.id} style={{ marginTop: "0.2rem" }} />
                        <span>
                          <strong>{opt.titel}</strong>
                          {opt.badge && (
                            <span className="au-badge au-badge-gold" style={{ marginLeft: "0.4rem" }}>
                              {badgeLabel[opt.badge] || opt.badge}
                            </span>
                          )}
                          <br />
                          <span style={{ color: "var(--color-text-faint)" }}>
                            {(opt.seminartermin_options_features?.length || 0)} Feature(s) · {(opt.preisstaffeln?.length || 0)} Preisstaffel(n)
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="au-btn au-btn-primary">Ausgewählte Optionen importieren</button>
                </form>
              ) : (
                <p style={{ color: "var(--color-text-faint)", fontSize: "0.9rem" }}>Dieser Termin hat noch keine Optionen.</p>
              )}
            </div>
          )}
        </OptionenImportExportTabs>

        <AufklappBereich merkSchluessel={`neue-option-${id}`} className="au-aufklapp-panel" zusammenfassung={<strong>+ Neue Option hinzufügen</strong>}>
          <form action={createSeminarOption} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <input type="hidden" name="features_text" />
            <NeueOptionSchnelleinfuegen />
            <div className="au-row-2">
              <div>
                <label className="au-label">Titel (z. B. "Option A – Basis")</label>
                <input className="au-input" name="titel" required />
              </div>
              <div>
                <label className="au-label">Sortierung (0 = zuerst)</label>
                <input className="au-input" name="sortierung" type="number" defaultValue={(optionen?.length || 0)} />
              </div>
            </div>
            <label className="au-label">Kennzeichnung</label>
            <select className="au-input" name="badge" defaultValue="">
              <option value="">Keine</option>
              <option value="empfohlen">Empfohlen</option>
              <option value="meistgekauft">Meistgekauft</option>
            </select>
            <label className="au-label">Beschreibung</label>
            <FettTextarea name="beschreibung" placeholder="Kurze Beschreibung dieser Option" />
            <label className="au-label">Vorspann-Text (nur wenn diese Option auf einer günstigeren Option aufbaut)</label>
            <input className="au-input" name="vorspann_text" placeholder='z. B. "Alles aus Move, plus:"' />
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
              <input type="checkbox" name="vorspann_anzeigen" /> Vorspann-Text anzeigen
            </label>
            <button type="submit" className="au-btn au-btn-primary">Option anlegen</button>
          </form>
        </AufklappBereich>
      </div>

            ),
          },
          {
            key: "unterlagen",
            label: "Unterlagen",
            anzahl: unterlagen?.length || 0,
            inhalt: (
              <div className="au-bereichsstapel">
                <Bereich titel="Unterlagen für die Teilnehmer">
                  <p className="au-klein" style={{ marginTop: 0 }}>
                    Erscheinen auf der persönlichen Unterlagen-Seite jedes Teilnehmers (Link <code>{"{{unterlagen_link}}"}</code> in den Funnel-Mails). Dateien liegen privat und werden nur über zeitlich begrenzte Links ausgeliefert.
                  </p>
                  <UnterlagenVerwaltung
                    terminId={id}
                    unterlagen={(unterlagen || []) as any[]}
                    uploadVorbereitenAction={erzeugeUnterlagenUpload}
                    speichernAction={speichereSeminarUnterlage}
                    verschiebenAction={verschiebeSeminarUnterlage}
                    loeschenAction={loescheSeminarUnterlage}
                  />
                </Bereich>
                {vorschauLinks && (
                  <Bereich titel="So sehen es die Teilnehmer">
                    <p className="au-klein" style={{ marginTop: 0 }}>Vorschau mit dem persönlichen Link von {vorschauPerson}. Jeder Teilnehmer bekommt in der Mail seinen eigenen Link.</p>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <a className="au-btn au-btn-secondary au-btn-sm" href={vorschauLinks.unterlagen_link} target="_blank" rel="noreferrer">Unterlagen-Seite ↗</a>
                      <a className="au-btn au-btn-secondary au-btn-sm" href={vorschauLinks.teilnehmerliste_link} target="_blank" rel="noreferrer">Teilnehmerliste ↗</a>
                      <a className="au-btn au-btn-secondary au-btn-sm" href={vorschauLinks.freigabe_link} target="_blank" rel="noreferrer">Freigabe-Seite ↗</a>
                    </div>
                  </Bereich>
                )}
              </div>
            ),
          },
          {
            key: "website",
            label: "Website-Anzeige",
            inhalt: (
              <div className="au-bereichsstapel">
      {websiteAnzeige && (
        <Bereich titel="Anzeige auf der Website">
          <WebsiteAnzeigeHinweis anzeige={websiteAnzeige} termin={termin} ausfuehrlich />

          <form action={updateVerfuegbarkeitsAnzeige} style={{ maxWidth: 560, borderTop: "1px solid var(--color-border, #e5e7eb)", paddingTop: "0.9rem" }}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <div>
              <label className="au-label">Was der Hero zeigt</label>
              <select className="au-select" name="verfuegbarkeit_anzeige_modus" defaultValue={termin.verfuegbarkeit_anzeige_modus || "zahlen"}>
                <option value="zahlen">Platzzahl + Füllstandsbalken + Urgency-Text</option>
                <option value="neutral">Neutral: nur „{VERFUEGBARKEIT_NEUTRAL_TEXT}“, keine Zahlen</option>
              </select>
            </div>
            <div>
              <label className="au-label">Angezeigte Restplätze (statt der echten Buchungszahl)</label>
              <input className="au-input" name="angezeigte_restplaetze" type="number" min={0} defaultValue={termin.angezeigte_restplaetze ?? ""} placeholder={`leer = echte Restplätze (aktuell ${websiteAnzeige.freiRechnerisch} von ${termin.kapazitaet})`} />
              <p style={{ fontSize: "0.8rem", color: "var(--color-text-faint)", margin: "-0.35rem 0 0.75rem" }}>
                Gilt für Zahl, Balken und alle Urgency-Stufen. Kapazität ({termin.kapazitaet} Plätze) änderst du oben im Termin-Formular.
              </p>
            </div>
            <UrgencyTextFeld
              name="urgency_label_template"
              label="Standard-Text (gilt, solange keine Stufe unten greift)"
              defaultValue={termin.urgency_label_template || ""}
              freiePlaetze={websiteAnzeige.freiePlaetze}
              kapazitaet={termin.kapazitaet}
              platzhalter="z. B. Noch Plätze frei"
            />
            <button type="submit" className="au-btn au-btn-primary au-btn-sm">Anzeige speichern</button>
          </form>

          <h3 style={{ margin: "1.5rem 0 0.25rem" }}>Urgency-Stufen (ab wann ein anderer Text erscheint)</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginTop: 0 }}>
            Greifen mehrere Stufen, gewinnt die mit der höchsten Belegung. Greift keine, erscheint der Standard-Text von oben.
          </p>
          <table className="au-table">
            <thead>
              <tr>
                <th>Wenn …</th>
                <th>… zeigt die Website</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {urgencyStufenZeilen.map((u) => (
                <UrgencyStufeZeile
                  key={u.id}
                  stufe={u}
                  seminarterminId={id}
                  freiePlaetze={websiteAnzeige.freiePlaetze}
                  kapazitaet={termin.kapazitaet}
                  updateAction={updateUrgencyStufe}
                  deleteAction={deleteUrgencyStufe}
                />
              ))}
              {!urgencyStufenZeilen.length && (
                <tr><td colSpan={4} style={{ color: "var(--color-text-faint)" }}>Noch keine Stufen — es gilt immer der Standard-Text.</td></tr>
              )}
            </tbody>
          </table>
          <details style={{ margin: "0.5rem 0 0" }}>
            <summary style={{ cursor: "pointer", color: "#0B1B33", fontSize: "0.85rem", fontWeight: 600 }}>+ Urgency-Stufe hinzufügen</summary>
            <form action={createUrgencyStufe} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem", alignItems: "start", marginTop: "0.5rem" }}>
              <input type="hidden" name="seminartermin_id" value={id} />
              <UrgencySchwellenwertFelder />
              <UrgencyTextFeld
                name="text_vorlage"
                label="Text"
                freiePlaetze={websiteAnzeige.freiePlaetze}
                kapazitaet={termin.kapazitaet}
                platzhalter="z. B. Nur noch wenige Plätze frei"
                required
              />
              <div style={{ alignSelf: "start" }}>
                <button type="submit" className="au-btn au-btn-primary au-btn-sm">Stufe hinzufügen</button>
              </div>
            </form>
          </details>
        </Bereich>
      )}

              </div>
            ),
          },
          {
            key: "einstellungen",
            label: "Einstellungen",
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel="Termin bearbeiten">
        <form action={previewSeminarterminUpdate} style={{ maxWidth: 560 }}>
          <input type="hidden" name="seminartermin_id" value={id} />

          <label className="au-label">Seminarkategorie</label>
          <select className="au-input" name="seminartyp_id" defaultValue={termin.seminartyp_id || ""} required>
            {seminartypen?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <div className="au-row-2">
            <div>
              <label className="au-label">Titel des Seminars</label>
              <input className="au-input" name="titel" defaultValue={termin.titel || ""} placeholder="z. B. Preisfindung Intensiv – Herbst 2026" required />
            </div>
            <div>
              <label className="au-label">Kennung (optional, z. B. SPS126)</label>
              <input className="au-input" name="kennung" defaultValue={termin.kennung || ""} placeholder="z. B. SPS126" />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Startdatum</label>
              <input className="au-input" name="datum_start" type="date" defaultValue={termin.datum_start} required />
            </div>
            <div>
              <label className="au-label">Startuhrzeit</label>
              <input className="au-input" name="zeit_start" type="time" defaultValue={termin.zeit_start?.slice(0, 5) || ""} />
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Enddatum</label>
              <input className="au-input" name="datum_ende" type="date" defaultValue={termin.datum_ende || termin.datum_start} />
            </div>
            <div>
              <label className="au-label">Enduhrzeit</label>
              <input className="au-input" name="zeit_ende" type="time" defaultValue={termin.zeit_ende?.slice(0, 5) || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Vorabendanreise – Tag</label>
              <input className="au-input" name="vorabend_anreise_datum" type="date" defaultValue={termin.vorabend_anreise_datum || ""} />
            </div>
            <div>
              <label className="au-label">Vorabendanreise – Uhrzeit</label>
              <input className="au-input" name="vorabend_anreise_uhrzeit" type="time" defaultValue={termin.vorabend_anreise_uhrzeit?.slice(0, 5) || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Format</label>
              <select className="au-input" name="format" defaultValue={termin.format}>
                <option value="praesenz">Präsenz</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="au-label">Ort</label>
              <select className="au-input" name="veranstaltungsort_id" defaultValue={termin.veranstaltungsort_id || ""}>
                <option value="">—</option>
                {orte?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.ort ? ` – ${o.ort}` : ""}{o.nahe_grossstadt ? ` (bei ${o.nahe_grossstadt})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="au-label">Trainer</label>
          <select className="au-input" name="trainer_id" defaultValue={termin.trainer_id || ""}>
            <option value="">—</option>
            {trainerListe?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className="au-row-2">
            <div>
              <label className="au-label">Kapazität</label>
              <input className="au-input" name="kapazitaet" type="number" defaultValue={termin.kapazitaet} />
            </div>
            <div>
              <label className="au-label">Mindestteilnehmerzahl</label>
              <input className="au-input" name="mindestteilnehmerzahl" type="number" defaultValue={termin.mindestteilnehmerzahl} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Überbuchungspuffer (intern)</label>
              <input className="au-input" name="ueberbuchungspuffer" type="number" defaultValue={termin.ueberbuchungspuffer} />
            </div>
            <div>
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-faint)", margin: "1.6rem 0 0" }}>
                Restplatz-Anzeige, Anzeige-Modus und Urgency-Texte stehen unten in der Karte „Anzeige auf der Website“.
              </p>
            </div>
          </div>

          <div>
            <label className="au-label">Untertitel (Onepage-Hero, unter dem Titel)</label>
            <textarea className="au-textarea" name="untertitel" defaultValue={termin.untertitel || ""} placeholder="z. B. Kalkulieren Sie Preise, die Wert sichtbar machen ..." rows={2} />
          </div>

          <div>
            <label className="au-label">Eyebrow-Text (Onepage-Hero)</label>
            <input className="au-input" name="eyebrow_text" defaultValue={termin.eyebrow_text || ""} placeholder="Standard: Seminar" />
          </div>

          <div>
            <label className="au-label">Onepage-Zielseite (für "Jetzt anmelden" in Termin-Übersichten)</label>
            <input className="au-input" name="onepage_slug" defaultValue={termin.onepage_slug || ""} placeholder="z. B. /seminar-preisfindung-oktober — leer = kein Button" />
          </div>
          <div className="au-card">
            <strong>Zimmer-Upgrade (optional)</strong>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>
              Nur wenn hier ein Aufpreis hinterlegt ist, erscheint im Onepage-Buchungsformular pro Teilnehmer:in eine Zimmerkategorie-Auswahl (Standard/Upgrade) — separat von den Adressfeldern. Ohne Aufpreis bleibt die Auswahl im Formular verborgen.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
              <input type="checkbox" name="vorabendanreise_inklusive" defaultChecked={termin.vorabendanreise_inklusive ?? true} /> Inkl. Vorabendanreise
            </label>
            <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "-0.5rem 0 0.75rem" }}>
              Aus: zieht eine Nacht von den unten berechneten Zimmer-Upgrade-Nächten ab (z. B. bei einem reinen Vorabend-Termin ohne eigentliche Übernachtung).
            </p>
            <div className="au-row-2">
              <div>
                <label className="au-label">Beschreibung (z. B. "Komfortzimmer statt Standardzimmer")</label>
        <input className="au-input" name="zimmerupgrade_beschreibung" defaultValue={termin.zimmerupgrade_beschreibung || ""} placeholder="z. B. Komfortzimmer statt Standardzimmer" />
              </div>
              <div>
                <label className="au-label">Aufpreis pro Nacht (€, netto)</label>
                <input className="au-input" name="zimmerupgrade_preis_pro_nacht_netto" type="number" step="0.01" defaultValue={termin.zimmerupgrade_preis_pro_nacht_netto ?? ""} placeholder="z. B. 89" />
                <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "-0.5rem 0 0.75rem" }}>
                  Dieser Termin hat {terminNaechte} effektive {terminNaechte === 1 ? "Nacht" : "Nächte"} für das Zimmer-Upgrade ({formatDatum(termin.datum_start)}
                  {termin.datum_ende && termin.datum_ende !== termin.datum_start ? ` – ${formatDatum(termin.datum_ende)}` : ""}
                  {!termin.vorabendanreise_inklusive ? ", −1 Nacht ohne Vorabendanreise" : ""}) — der Gesamtaufpreis ergibt sich automatisch aus Aufpreis × Nächte (zzgl. eventueller Zusatznächte pro Option).
                </p>
              </div>
            </div>
          </div>
                    <div className="au-card">
                                  <strong>Selbstauskunft-Checkbox (optional)</strong>
                                  <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>Nur wenn hier aktiviert, erscheint im Onepage-Buchungsformular eine Pflicht-Checkbox mit dem unten stehenden Text.</p>
                                  <label className="au-label">Checkbox-Text (frei wählbar, auch für die gegenteilige Aussage möglich)</label>
                                  <textarea className="au-textarea" name="selbstauskunft_label" defaultValue={termin.selbstauskunft_label || ""} placeholder="z. B. Ich bestätige, dass ich Agenturunternehmer:in bin." rows={2} />
                                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.6rem", fontSize: "0.9rem" }}><input type="checkbox" name="selbstauskunft_aktiv" defaultChecked={termin.selbstauskunft_aktiv || false} /> Checkbox im Buchungsformular aktiv</label>
                    </div>
          <div className="au-card">
                          
            <strong>Zusätzlicher Teilnehmer (Gruppenpreis)</strong>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>
              Preis für die 2. (und weitere) Person derselben Firma. Entweder Festpreis ODER Rabatt in % angeben, nicht beides.
            </p>
            <div className="au-row-2">
              <div>
                <label className="au-label">Festpreis pro weiterer Person (€)</label>
                <input className="au-input" name="zusatzteilnehmer_preis" type="number" step="0.01" defaultValue={termin.zusatzteilnehmer_preis ?? ""} placeholder="z. B. 990" />
              </div>
              <div>
                <label className="au-label">oder Rabatt (%)</label>
                <input className="au-input" name="zusatzteilnehmer_rabatt_prozent" type="number" step="0.1" defaultValue={termin.zusatzteilnehmer_rabatt_prozent ?? ""} placeholder="z. B. 15" />
              </div>
            </div>
          </div>

          <button type="submit" className="au-btn au-btn-primary">
            Änderungen speichern
          </button>
        </form>
      </Bereich>

                {gefahrenzone}
              </div>
            ),
          },
          {
            key: "verlauf",
            label: "Verlauf",
            anzahl: protokoll?.length || 0,
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel="Änderungsprotokoll">
        <table className="au-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ereignis</th>
              <th>Beschreibung</th>
              <th>Bearbeiter</th>
            </tr>
          </thead>
          <tbody>
            {protokoll?.map((e) => (
              <tr key={e.id}>
                <td>{formatDatum(e.erstellt_am)}</td>
                <td>{e.ereignis}</td>
                <td>{e.beschreibung}</td>
                <td>{e.bearbeiter || "—"}</td>
              </tr>
            ))}
            {!protokoll?.length && (
              <tr><td colSpan={4} style={{ color: "var(--color-text-faint)" }}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </Bereich>
              </div>
            ),
          },
        ]}
      />
    </main>
  );
}

// Einheitlicher Container fuer die Bereiche der Detailseite (Kopf mit Titel
// und optionaler Aktion rechts) -- gleiche Optik wie die Dashboard-Panels.
function Bereich({ titel, aktion, children }: { titel: React.ReactNode; aktion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="au-panel">
      <div className="au-panel-kopf">
        <h2>{titel}</h2>
        {aktion}
      </div>
      <div className="au-panel-inhalt">{children}</div>
    </section>
  );
}
