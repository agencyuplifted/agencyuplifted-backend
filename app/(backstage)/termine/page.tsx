export const dynamic = "force-dynamic";

import TermineNav from "./TermineNav";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatDatumsspanne, monatsName } from "@/lib/format";
import { duplicateSeminartermin } from "@/lib/actions";
import { ladeWebsiteVerfuegbarkeit, type WebsiteVerfuegbarkeit } from "@/lib/verfuegbarkeit";
import WebsiteAnzeigeHinweis from "./WebsiteAnzeigeHinweis";

function gruppeProMonat(liste: any[]) {
  const proMonat = new Map<string, any[]>();
  liste.forEach((t: any) => {
    const d = new Date(t.datum_start);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!proMonat.has(key)) proMonat.set(key, []);
    proMonat.get(key)!.push(t);
  });
  return proMonat;
}

const MONATSKURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function isoDatum(jahr: number, monatIndex: number, tag: number) {
  return `${jahr}-${String(monatIndex + 1).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

// Rollierender Jahresplaner: eine Zeile pro Monat (Vormonat bis +10), Tage
// 1-31 als Spalten, Seminare als Balken ueber ihre ganze Dauer. Ersetzt die
// frueheren Monatskaertchen zum Seitwaertsscrollen -- gerade am Jahreswechsel
// (2026/2027 parallel in Arbeit) sieht man so alles auf einen Blick.
function Jahresplaner({
  monate,
  termine,
  gebuchtProTermin,
  heuteISO,
  mitKopf = true,
}: {
  monate: { jahr: number; monatIndex: number }[];
  termine: any[];
  gebuchtProTermin: Map<string, number>;
  heuteISO: string;
  mitKopf?: boolean;
}) {
  return (
    <div className="au-planer" role="table" aria-label="Seminarkalender">
      {mitKopf && (
        <div className="au-planer-zeile au-planer-kopfzeile" role="row">
          <span className="au-planer-monat" />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="au-planer-tagnr" style={{ gridColumn: i + 2 }}>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</span>
          ))}
        </div>
      )}
      {monate.map(({ jahr, monatIndex }) => {
        const anzahlTage = new Date(jahr, monatIndex + 1, 0).getDate();
        const monatStart = isoDatum(jahr, monatIndex, 1);
        const monatEnde = isoDatum(jahr, monatIndex, anzahlTage);
        const imMonat = termine
          .filter((t: any) => t.datum_start <= monatEnde && (t.datum_ende || t.datum_start) >= monatStart)
          .sort((a: any, b: any) => a.datum_start.localeCompare(b.datum_start));
        // Ueberlappende Termine auf eigene Spuren verteilen
        const spurEnde: number[] = [];
        const balken = imMonat.map((t: any) => {
          const von = t.datum_start < monatStart ? 1 : Number(t.datum_start.slice(8, 10));
          const bis = (t.datum_ende || t.datum_start) > monatEnde ? anzahlTage : Number((t.datum_ende || t.datum_start).slice(8, 10));
          let spur = spurEnde.findIndex((e) => e < von);
          if (spur === -1) { spur = spurEnde.length; spurEnde.push(bis); } else spurEnde[spur] = bis;
          return { t, von, bis, spur };
        });
        const spuren = Math.max(1, spurEnde.length);
        const istAktuell = heuteISO.slice(0, 7) === monatStart.slice(0, 7);
        return (
          <div key={monatStart} className={`au-planer-zeile${istAktuell ? " aktuell" : ""}`} role="row" style={{ gridTemplateRows: `repeat(${spuren}, 22px)` }}>
            <span className="au-planer-monat" role="rowheader" style={{ gridRow: `1 / span ${spuren}` }}>
              {MONATSKURZ[monatIndex]} <span>{String(jahr).slice(2)}</span>
            </span>
            {Array.from({ length: 31 }, (_, i) => {
              const tag = i + 1;
              if (tag > anzahlTage) return <span key={i} className="au-planer-tag leer" style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }} />;
              const wt = new Date(jahr, monatIndex, tag).getDay();
              const iso = isoDatum(jahr, monatIndex, tag);
              return (
                <span
                  key={i}
                  className={`au-planer-tag${wt === 0 || wt === 6 ? " wochenende" : ""}${iso === heuteISO ? " heute" : ""}`}
                  style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }}
                />
              );
            })}
            {balken.map(({ t, von, bis, spur }) => {
              const gebucht = gebuchtProTermin.get(t.id) || 0;
              return (
                <a
                  key={t.id}
                  href={`/termine/${t.id}`}
                  className="au-planer-balken"
                  style={{ gridColumn: `${von + 1} / ${bis + 2}`, gridRow: spur + 1, background: t.seminartypen?.farbe || "var(--color-accent)" }}
                  title={`${t.titel || t.seminartypen?.name || ""} · ${formatDatumsspanne(t.datum_start, t.datum_ende)} · ${gebucht} von ${t.kapazitaet} TN`}
                >
                  {t.kennung || (t.seminartypen?.name || "").slice(0, 4)}
                </a>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_STIL: Record<string, { label: string; klasse: string }> = {
  geplant: { label: "geplant", klasse: "au-badge-neutral" },
  bestaetigt: { label: "bestätigt", klasse: "au-badge-success" },
  unterbesetzt: { label: "unterbesetzt", klasse: "au-badge-warning" },
  abgesagt: { label: "abgesagt", klasse: "au-badge-danger" },
};

// Eine durchgehende Liste mit Monats-Trennzeilen statt einer Tabelle pro
// Monat -- ruhiger zu scannen und mobil stapelbar (CSS-Grid statt <table>).
function TerminListe({
  termine,
  gebuchtProTermin,
  gesamtProTermin,
  websiteAnzeigeProTermin,
  heuteISO,
}: {
  termine: any[];
  gebuchtProTermin: Map<string, number>;
  gesamtProTermin: Map<string, number>;
  websiteAnzeigeProTermin: Map<string, WebsiteVerfuegbarkeit>;
  heuteISO: string;
}) {
  const proMonat = gruppeProMonat(termine);
  return (
    <section className="au-panel">
      <div className="au-tliste-kopf" aria-hidden="true">
        <span>Termin</span>
        <span>Ort</span>
        <span>Belegung</span>
        <span>Status</span>
        <span />
      </div>
      {[...proMonat.entries()].map(([key, liste]) => {
        const [jahrStr, monatStr] = key.split("-");
        return (
          <div key={key}>
            <div className="au-tliste-monat">
              {monatsName(Number(monatStr))} {jahrStr}
              <span>{liste.length} {liste.length === 1 ? "Termin" : "Termine"}</span>
            </div>
            {liste.map((t: any) => {
              const gebucht = gebuchtProTermin.get(t.id) || 0;
              const gesamt = gesamtProTermin.get(t.id) || 0;
              const kapazitaet = Number(t.kapazitaet) || 0;
              const anteil = kapazitaet ? Math.min(1, gebucht / kapazitaet) : 0;
              const vergangen = t.datum_start < heuteISO;
              const d = new Date(t.datum_start);
              const status = STATUS_STIL[t.status] || { label: t.status, klasse: "au-badge-neutral" };
              return (
                <div key={t.id} className={`au-tliste-zeile${vergangen ? " vergangen" : ""}`}>
                  <Link href={`/termine/${t.id}`} className="au-tliste-termin" prefetch={false}>
                    <span className="au-termin-datum" style={t.seminartypen?.farbe ? { borderColor: t.seminartypen.farbe } : undefined}>
                      <strong>{d.getUTCDate()}</strong>
                      <span>{MONATSKURZ[d.getUTCMonth()]}</span>
                    </span>
                    <span className="au-termin-text">
                      <strong>{t.titel || t.seminartypen?.name}</strong>
                      <span className="au-klein">
                        {[t.kennung, formatDatumsspanne(t.datum_start, t.datum_ende), t.titel && t.seminartypen?.name !== t.titel ? t.seminartypen?.name : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                  <div className="au-tliste-ort">
                    <span>{t.veranstaltungsorte?.ort || t.veranstaltungsorte?.name || "—"}</span>
                    {t.format && t.format !== "praesenz" && <span className="au-klein">{t.format}</span>}
                  </div>
                  <div className="au-tliste-belegung" title={`Gesamt vor Ort (TN + Mitarbeiter + Gastreferenten): ${gesamt}`}>
                    <span className="au-klein"><strong>{gebucht}</strong> / {kapazitaet} TN</span>
                    <span className="au-belegung-balken"><span style={{ width: `${anteil * 100}%` }} /></span>
                    {gesamt !== gebucht && <span className="au-klein">{gesamt} Personen vor Ort</span>}
                  </div>
                  <div>
                    <span className={`au-badge ${status.klasse}`}>{status.label}</span>
                  </div>
                  <div className="au-tliste-aktionen">
                    <form action={duplicateSeminartermin}>
                      <input type="hidden" name="seminartermin_id" value={t.id} />
                      <button type="submit" title="Termin inkl. Optionen, Preisstaffeln und Urgency-Stufen duplizieren" className="au-btn au-btn-secondary au-btn-sm">
                        Duplizieren
                      </button>
                    </form>
                  </div>
                  {websiteAnzeigeProTermin.has(t.id) && (
                    <div className="au-tliste-website">
                      <WebsiteAnzeigeHinweis anzeige={websiteAnzeigeProTermin.get(t.id)!} termin={t} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

type Ansicht = "anstehend" | "vergangen" | "abgesagt";

export default async function TerminePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const { ansicht: ansichtRaw } = await searchParams;
  const ansicht: Ansicht = ansichtRaw === "vergangen" || ansichtRaw === "abgesagt" ? ansichtRaw : "anstehend";
  const heute = new Date();
  const heuteISO = heute.toISOString().slice(0, 10);

  const supabase = getSupabaseAdmin();
  const auswahl = "*, seminartypen(name, farbe), veranstaltungsorte(name, ort)";
  // Keine Jahresauswahl mehr: "Anstehend" = alle kuenftigen Termine, egal in
  // welchem Jahr; Vergangen/Abgesagt = alle, neueste zuerst. Vorher war die
  // Liste pro Kalenderjahr gefiltert -- am Jahreswechsel, wenn 2026 und 2027
  // parallel laufen, musste man staendig umschalten.
  const [{ data: anstehendDaten }, { data: vergangeneOderAbgesagt }] = await Promise.all([
    supabase.from("seminartermine").select(auswahl).gte("datum_start", heuteISO).neq("status", "abgesagt").order("datum_start", { ascending: true }),
    supabase.from("seminartermine").select(auswahl).or(`datum_start.lt.${heuteISO},status.eq.abgesagt`).order("datum_start", { ascending: false }),
  ]);

  // Jahresplaner oben: Vormonat bis 10 Monate voraus. Termine, die im Vormonat
  // beginnen und in den Fenster-Start hineinreichen, fehlen hoechstens am Rand.
  // Kalender: ab dem aktuellen Monat bis zum Monat des letzten geplanten
  // Termins (mindestens 6 Monate) -- so ist alles Vorgeplante beim Aufklappen
  // sichtbar, ohne Blaettern. Einen Monat Vorlauf abfragen, damit Seminare
  // ueber den Monatswechsel am Fensteranfang nicht fehlen.
  const letzterGeplant = (anstehendDaten || []).reduce(
    (max: string, t: any) => ((t.datum_ende || t.datum_start) > max ? t.datum_ende || t.datum_start : max),
    heuteISO
  );
  const [lJahr, lMonat] = letzterGeplant.split("-").map(Number);
  const anzahlKalenderMonate = Math.min(36, Math.max(6, (lJahr - heute.getFullYear()) * 12 + (lMonat - 1 - heute.getMonth()) + 1));
  const monatsFensterStart = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);
  const monatsFensterEnde = new Date(heute.getFullYear(), heute.getMonth() + anzahlKalenderMonate, 0);
  const { data: kalenderTermine } = await supabase
    .from("seminartermine")
    .select("id, titel, kennung, datum_start, datum_ende, kapazitaet, seminartypen(name, farbe)")
    .gte("datum_start", isoDatum(monatsFensterStart.getFullYear(), monatsFensterStart.getMonth(), 1))
    .lte("datum_start", isoDatum(monatsFensterEnde.getFullYear(), monatsFensterEnde.getMonth(), monatsFensterEnde.getDate()))
    .neq("status", "abgesagt")
    .order("datum_start", { ascending: true });

  const monatsKarten: { jahr: number; monatIndex: number }[] = [];
  for (let i = 0; i < anzahlKalenderMonate; i++) {
    const d = new Date(heute.getFullYear(), heute.getMonth() + i, 1);
    monatsKarten.push({ jahr: d.getFullYear(), monatIndex: d.getMonth() });
  }

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("seminartermin_id, teilnehmer_id, buchungen!inner(status), teilnehmer(rolle)")
    .neq("buchungen.status", "storniert");

  const { data: legacyPositionen } = await supabase
    .from("legacy_buchungen")
    .select("seminartermin_id, teilnehmer_id, teilnehmer(rolle)")
    .not("seminartermin_id", "is", null);

  // Belegung = Anzahl unterschiedlicher Teilnehmer pro Termin (aktuell + Alt-Daten
  // zusammengeführt, doppelt gezählte Personen vermieden). Mitarbeiter/Gastreferenten
  // zaehlen nicht als belegter Platz.
  const teilnehmerProTermin = new Map<string, Set<string>>();
  const zaehleEin = (seminarterminId: string | null, teilnehmerId: string | null, rolle: string | null | undefined) => {
    if (!seminarterminId || !teilnehmerId) return;
    if (rolle && rolle !== "teilnehmer") return;
    if (!teilnehmerProTermin.has(seminarterminId)) teilnehmerProTermin.set(seminarterminId, new Set());
    teilnehmerProTermin.get(seminarterminId)!.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleEin(p.seminartermin_id, p.teilnehmer_id, p.teilnehmer?.rolle));
  (legacyPositionen || []).forEach((l: any) => zaehleEin(l.seminartermin_id, l.teilnehmer_id, l.teilnehmer?.rolle));

  const gebuchtProTermin = new Map<string, number>();
  teilnehmerProTermin.forEach((set, id) => gebuchtProTermin.set(id, set.size));

  // Gesamtsumme (TN + Mitarbeiter + Gastreferent + Organisator) fuer die Zimmerplanung,
  // unabhaengig von der Rolle - jede Person, die vor Ort ist, braucht ein Bett.
  const alleProTermin = new Map<string, Set<string>>();
  const zaehleAlleEin = (seminarterminId: string | null, teilnehmerId: string | null) => {
    if (!seminarterminId || !teilnehmerId) return;
    if (!alleProTermin.has(seminarterminId)) alleProTermin.set(seminarterminId, new Set());
    alleProTermin.get(seminarterminId)!.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleAlleEin(p.seminartermin_id, p.teilnehmer_id));
  (legacyPositionen || []).forEach((l: any) => zaehleAlleEin(l.seminartermin_id, l.teilnehmer_id));

  const gesamtProTermin = new Map<string, number>();
  alleProTermin.forEach((set, id) => gesamtProTermin.set(id, set.size));

  const anstehend = anstehendDaten || [];
  const vergangen = (vergangeneOderAbgesagt || []).filter((t: any) => t.datum_start < heuteISO && t.status !== "abgesagt");
  const abgesagt = (vergangeneOderAbgesagt || []).filter((t: any) => t.status === "abgesagt");
  const liste = ansicht === "anstehend" ? anstehend : ansicht === "vergangen" ? vergangen : abgesagt;

  // Nur fuer anstehende Termine: vergangene/abgesagte liefert die oeffentliche
  // API nicht mehr aus, dort gibt es also auch keine Website-Anzeige.
  const websiteAnzeigeProTermin = ansicht === "anstehend" ? await ladeWebsiteVerfuegbarkeit(supabase, anstehend) : new Map();

  const naechster = anstehend[0];
  const tab = (a: Ansicht, label: string, anzahl: number) => (
    <Link
      href={a === "anstehend" ? "/termine" : `/termine?ansicht=${a}`}
      className={ansicht === a ? "aktiv" : ""}
      aria-current={ansicht === a ? "page" : undefined}
      prefetch={false}
    >
      {label} <span className="au-tab-zahl">{anzahl}</span>
    </Link>
  );

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            {anstehend.length} anstehende Seminare
            {naechster && <> · nächstes am {formatDatum(naechster.datum_start)}</>}
          </p>
          <h1>Seminartermine</h1>
        </div>
        <div className="au-dash-aktionen">
          <Link href="/termine/neu" className="au-btn au-btn-primary au-btn-sm" prefetch={false}>+ Neuer Termin</Link>
        </div>
      </header>
      <TermineNav aktiv="termine" />

      <Kalender
        monatsKarten={monatsKarten}
        kalenderTermine={kalenderTermine || []}
        gebuchtProTermin={gebuchtProTermin}
        heuteISO={heuteISO}
      />

      <div className="au-tliste-leiste">
        <nav className="au-seitentabs" aria-label="Termin-Ansichten" style={{ marginBottom: 0, flex: 1 }}>
          {tab("anstehend", "Anstehend", anstehend.length)}
          {tab("vergangen", "Vergangen", vergangen.length)}
          {tab("abgesagt", "Abgesagt", abgesagt.length)}
        </nav>
      </div>

      {liste.length ? (
        <TerminListe
          termine={liste}
          gebuchtProTermin={gebuchtProTermin}
          gesamtProTermin={gesamtProTermin}
          websiteAnzeigeProTermin={websiteAnzeigeProTermin}
          heuteISO={heuteISO}
        />
      ) : (
        <div className="au-panel"><div className="au-panel-inhalt au-leer">
          {ansicht === "anstehend" ? "Keine anstehenden Seminare." : ansicht === "vergangen" ? "Keine vergangenen Seminare." : "Keine abgesagten Seminare."}
        </div></div>
      )}
    </main>
  );
}

function Kalender({
  monatsKarten,
  kalenderTermine,
  gebuchtProTermin,
  heuteISO,
}: {
  monatsKarten: { jahr: number; monatIndex: number }[];
  kalenderTermine: any[];
  gebuchtProTermin: Map<string, number>;
  heuteISO: string;
}) {
  const kategorien = new Map<string, string>();
  kalenderTermine.forEach((t: any) => {
    if (t.seminartypen?.name) kategorien.set(t.seminartypen.name, t.seminartypen.farbe || "var(--color-accent)");
  });
  const erste = monatsKarten.slice(0, 6);
  const weitere = monatsKarten.slice(6);
  const bereich = (m: { jahr: number; monatIndex: number }[]) =>
    `${MONATSKURZ[m[0].monatIndex]} ${m[0].jahr} – ${MONATSKURZ[m[m.length - 1].monatIndex]} ${m[m.length - 1].jahr}`;
  const inWeiteren = weitere.length
    ? kalenderTermine.filter((t: any) => t.datum_start >= isoDatum(weitere[0].jahr, weitere[0].monatIndex, 1)).length
    : 0;

  return (
    <section className="au-panel au-panel-breit">
      <div className="au-panel-kopf">
        <h2>Kalender · {bereich(erste)}</h2>
        <span className="au-planer-legende">
          {[...kategorien.entries()].map(([name, farbe]) => (
            <span key={name}><i style={{ background: farbe }} />{name}</span>
          ))}
          <Link href="/seminartypen" className="au-panel-link" prefetch={false}>Farben →</Link>
        </span>
      </div>
      <div className="au-panel-inhalt" style={{ overflowX: "auto" }}>
        <Jahresplaner monate={erste} termine={kalenderTermine} gebuchtProTermin={gebuchtProTermin} heuteISO={heuteISO} />
        {weitere.length > 0 && (
          <details className="au-planer-mehr">
            <summary>
              Weitere Monate bis {MONATSKURZ[weitere[weitere.length - 1].monatIndex]} {weitere[weitere.length - 1].jahr} anzeigen
              {inWeiteren ? ` · ${inWeiteren} ${inWeiteren === 1 ? "Termin" : "Termine"}` : ""}
            </summary>
            <Jahresplaner monate={weitere} termine={kalenderTermine} gebuchtProTermin={gebuchtProTermin} heuteISO={heuteISO} mitKopf={false} />
          </details>
        )}
      </div>
    </section>
  );
}
