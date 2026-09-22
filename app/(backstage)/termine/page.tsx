export const dynamic = "force-dynamic";

import TermineNav from "./TermineNav";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatDatumsspanne, monatsName } from "@/lib/format";
import { duplicateSeminartermin } from "@/lib/actions";
import { ladeWebsiteVerfuegbarkeit, type WebsiteVerfuegbarkeit } from "@/lib/verfuegbarkeit";
import WebsiteAnzeigeHinweis from "./WebsiteAnzeigeHinweis";
import Jahresplaner, { isoDatum, MONATSKURZ } from "./Jahresplaner";
import { naechsterPreiswechsel, tageZwischen, type Preiswechsel } from "@/lib/preisstaffeln";
import { formatEUR } from "@/lib/format";

const WT_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// "Fr 02.10." fuer einen Kalendertag (YYYY-MM-DD)
const kurzTag = (iso: string) => `${WT_KURZ[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

// Naechster Preiswechsel eines Termins ueber alle aktiven Optionen: der
// frueheste Wechsel zaehlt; Optionen mit anderem Stichtag werden gezaehlt und
// im Tooltip einzeln aufgefuehrt (meist haben alle Optionen dieselben Stichtage).
type TerminPreiswechsel = { frueh: Preiswechsel; abweichend: number; details: string[] };

function preiswechselFuer(t: any): TerminPreiswechsel | null {
  const proOption = (t.seminartermin_optionen || [])
    .filter((o: any) => !o.deaktiviert_am && o.preisstaffeln?.length)
    .map((o: any) => ({ titel: o.titel as string, w: naechsterPreiswechsel(o.preisstaffeln, t.datum_start) }));
  const mitWechsel = proOption.filter((o: any) => o.w) as { titel: string; w: Preiswechsel }[];
  if (!mitWechsel.length) return null;
  const erster = [...mitWechsel].sort((a, b) => a.w.letzterTag.localeCompare(b.w.letzterTag))[0].w;
  // Stufen heissen je Option teils anders ("Stufe 1" vs. "Frühbucherpreis") --
  // dann neutral benennen, die Namen stehen im Tooltip
  const gleichzeitig = mitWechsel.filter((o) => o.w.letzterTag === erster.letzterTag);
  const einName = gleichzeitig.every((o) => o.w.stufe === erster.stufe);
  const frueh = einName ? erster : { ...erster, stufe: "Aktuelle Preisstufe", naechsteStufe: "nächste Stufe" };
  return {
    frueh,
    abweichend: proOption.filter((o: any) => !o.w || o.w.letzterTag !== frueh.letzterTag).length,
    details: proOption.map((o: any) =>
      o.w
        ? `${o.titel}: ${o.w.stufe} ${formatEUR(o.w.preis)} bis ${kurzTag(o.w.letzterTag)}, danach ${o.w.naechsteStufe} ${formatEUR(o.w.naechsterPreis)}`
        : `${o.titel}: letzte Stufe (kein Wechsel mehr)`
    ),
  };
}

function restText(tage: number): string {
  return tage <= 0 ? "nur noch heute" : tage === 1 ? "bis morgen" : `noch ${tage} Tage`;
}

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
  heuteBerlin,
}: {
  termine: any[];
  gebuchtProTermin: Map<string, number>;
  gesamtProTermin: Map<string, number>;
  websiteAnzeigeProTermin: Map<string, WebsiteVerfuegbarkeit>;
  heuteISO: string;
  heuteBerlin: string;
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
                      {!vergangen && t.status !== "abgesagt" && (() => {
                        const pw = preiswechselFuer(t);
                        if (!pw) return null;
                        const rest = tageZwischen(heuteBerlin, pw.frueh.letzterTag);
                        return (
                          <span
                            className={`au-preiswechsel${rest <= 3 ? " dringend" : ""}`}
                            title={`Danach ${pw.frueh.naechsteStufe}\n${pw.details.join("\n")}`}
                          >
                            {pw.frueh.stufe} bis {kurzTag(pw.frueh.letzterTag)} · {restText(rest)}
                            {pw.abweichend > 0 && <span className="au-preiswechsel-hinweis"> · {pw.abweichend} Option{pw.abweichend === 1 ? "" : "en"} abweichend</span>}
                          </span>
                        );
                      })()}
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
    // Anstehende zusaetzlich mit Optionen/Preisstaffeln fuer "Preisstufe X bis …"
    supabase
      .from("seminartermine")
      .select(`${auswahl}, seminartermin_optionen(titel, deaktiviert_am, preisstaffeln(name, preis, stichtag_tage_vor_start, stichtag_datum))`)
      .gte("datum_start", heuteISO)
      .neq("status", "abgesagt")
      .order("datum_start", { ascending: true }),
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

  // Vorgeplante Kandidaten (Terminplaner) zusaetzlich im Kalender -- mit "?"
  const { data: vorgeplant } = await supabase
    .from("terminvorschlaege")
    .select("id, datum_start, datum_ende, anreise_datum, status, seminartypen(name, farbe)")
    .in("status", ["vorgeschlagen", "in_pruefung"])
    .gte("datum_start", isoDatum(monatsFensterStart.getFullYear(), monatsFensterStart.getMonth(), 1))
    .lte("datum_start", isoDatum(monatsFensterEnde.getFullYear(), monatsFensterEnde.getMonth(), monatsFensterEnde.getDate()));
  const kalenderEintraege = [
    ...(kalenderTermine || []),
    ...(vorgeplant || []).map((v: any) => ({ ...v, id: `v-${v.id}`, vorgeplant: true })),
  ];

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
  const heuteBerlin = heute.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  // Preiserhoehungen der naechsten 30 Tage (fuer Mailing-Aktionen), frueheste zuerst
  const baldTeurer = anstehend
    .map((t: any) => ({ t, pw: preiswechselFuer(t) }))
    .filter((x): x is { t: any; pw: TerminPreiswechsel } => !!x.pw && tageZwischen(heuteBerlin, x.pw.frueh.letzterTag) <= 30)
    .sort((a, b) => a.pw.frueh.letzterTag.localeCompare(b.pw.frueh.letzterTag));
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
        kalenderTermine={kalenderEintraege}
        gebuchtProTermin={gebuchtProTermin}
        heuteISO={heuteISO}
      />

      {ansicht === "anstehend" && baldTeurer.length > 0 && (
        <section className="au-panel">
          <div className="au-panel-kopf">
            <h2>Preiserhöhungen in den nächsten 30 Tagen</h2>
            <span className="au-klein">Stufe gilt bis einschließlich des genannten Tages</span>
          </div>
          <ul className="au-preiswechsel-liste">
            {baldTeurer.map(({ t, pw }) => {
              const rest = tageZwischen(heuteBerlin, pw.frueh.letzterTag);
              return (
                <li key={t.id} className={rest <= 3 ? "dringend" : undefined}>
                  <span className="au-preiswechsel-datum">
                    <strong>{kurzTag(pw.frueh.letzterTag)}</strong>
                    <span>{restText(rest)}</span>
                  </span>
                  <Link href={`/termine/${t.id}`} prefetch={false}>
                    {t.kennung ? `${t.kennung} · ` : ""}{t.titel || t.seminartypen?.name}
                  </Link>
                  <span className="au-klein" title={pw.details.join("\n")}>
                    {pw.frueh.stufe} → {pw.frueh.naechsteStufe}
                    {pw.abweichend > 0 && ` · ${pw.abweichend} Option${pw.abweichend === 1 ? "" : "en"} abweichend`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
          heuteBerlin={heuteBerlin}
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
    ? kalenderTermine.filter((t: any) => !t.vorgeplant && t.datum_start >= isoDatum(weitere[0].jahr, weitere[0].monatIndex, 1)).length
    : 0;

  return (
    <section className="au-panel au-panel-breit">
      <div className="au-panel-kopf">
        <h2>Kalender · {bereich(erste)}</h2>
        <span className="au-planer-legende">
          {[...kategorien.entries()].map(([name, farbe]) => (
            <span key={name}><i style={{ background: farbe }} />{name}</span>
          ))}
          {kalenderTermine.some((t: any) => t.vorgeplant) && (
            <span><i className="au-planer-vorgeplant-leg" />? = vorgeplant (Terminplaner)</span>
          )}
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
