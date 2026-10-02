export const dynamic = "force-dynamic";

import { berechneDeckungsbeitraege } from "@/lib/deckungsbeitrag";
import SeminarCockpit, { ZeitraumLeiste } from "./SeminarCockpit";
import { requireAdmin } from "@/lib/rechte";
import { zeitraumAus } from "@/lib/zeitraeume";
import Geschaeftsfelder from "./Geschaeftsfelder";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEURGanz, formatDatum } from "@/lib/format";
import { ladeAnstehendeGeburtstage } from "@/lib/geburtstage";
import FaelligWidget from "../wiedervorlage/FaelligWidget";
import { getAktuellerBenutzer } from "@/lib/auth";

type Ansicht = "uebersicht" | "seminare" | "nachfrage" | "auslastung" | "kunden" | "vertrieb";

const TABS: { key: Ansicht; label: string }[] = [
  { key: "uebersicht", label: "Übersicht" },
  { key: "seminare", label: "Seminare: Umsatz & DB" },
  { key: "nachfrage", label: "Nachfrage nach Seminarart" },
  { key: "auslastung", label: "Termine & Auslastung" },
  { key: "kunden", label: "Top-Kunden" },
  { key: "vertrieb", label: "Vertrieb (Leads & Warteliste)" },
];

function balken(anteil: number, farbe = "var(--color-accent)"): React.ReactNode {
  const pct = Math.max(0, Math.min(1, anteil)) * 100;
  return (
    <div style={{ background: "var(--color-border)", height: "6px", width: "100%", marginTop: "0.3rem", borderRadius: 3 }}>
      <div style={{ background: farbe, height: "6px", width: `${pct}%`, borderRadius: 3 }} />
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; jahr?: string; seminartyp?: string; zeitraum?: string; von?: string; bis?: string }>;
}) {
  // Dashboard mit Umsatz/DB nur fuer Admins (Rechtemanagement lib/rechte.ts)
  await requireAdmin();
  const { ansicht: ansichtRaw, jahr: jahrRaw, seminartyp, zeitraum, von, bis } = await searchParams;
  const ansicht: Ansicht = (TABS.some((t) => t.key === ansichtRaw) ? ansichtRaw : "uebersicht") as Ansicht;

  const supabase = getSupabaseAdmin();
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <DashboardKopf />

      <nav className="au-seitentabs" aria-label="Dashboard-Ansichten">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dashboard?ansicht=${t.key}`} className={t.key === ansicht ? "aktiv" : ""} aria-current={t.key === ansicht ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {ansicht === "uebersicht" && <Uebersicht supabase={supabase} heute={heute} zeitraum={zeitraum} von={von} bis={bis} />}
      {ansicht === "seminare" && <UmsatzProSeminar supabase={supabase} heute={heute} zeitraumParam={zeitraum || jahrRaw} von={von} bis={bis} seminartypFilter={seminartyp} />}
      {ansicht === "nachfrage" && <Nachfrage supabase={supabase} />}
      {ansicht === "auslastung" && <Auslastung supabase={supabase} heute={heute} />}
      {ansicht === "kunden" && <Kunden supabase={supabase} />}
      {ansicht === "vertrieb" && <Vertrieb supabase={supabase} />}
    </main>
  );
}

// Begruessung + Datum + Schnellaktionen -- nach dem ueblichen Muster fuer
// Admin-Dashboards: oben orientieren ("wo bin ich, was ist heute"), die
// haeufigsten Aktionen direkt erreichbar.
async function DashboardKopf() {
  const benutzer = await getAktuellerBenutzer();
  const jetzt = new Date();
  const stunde = Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }).format(jetzt));
  const gruss = stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Hallo" : "Guten Abend";
  const vorname = benutzer?.name?.split(" ")[0];
  const datum = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }).format(jetzt);
  return (
    <header className="au-dash-kopf">
      <div>
        <p className="au-dash-datum">{datum}</p>
        <h1>{gruss}{vorname ? `, ${vorname}` : ""}</h1>
      </div>
      <div className="au-dash-aktionen">
        <Link href="/buchungen/neu" className="au-btn au-btn-primary au-btn-sm" prefetch={false}>+ Neue Buchung</Link>
        <Link href="/termine/neu" className="au-btn au-btn-secondary au-btn-sm" prefetch={false}>+ Neuer Termin</Link>
      </div>
    </header>
  );
}

function Kennzahl({ label, wert, kontext, href }: { label: string; wert: React.ReactNode; kontext?: React.ReactNode; href?: string }) {
  const inhalt = (
    <>
      <div className="au-kennzahl-label">{label}</div>
      <div className="au-kennzahl-wert">{wert}</div>
      {kontext && <div className="au-kennzahl-kontext">{kontext}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="au-kennzahl" prefetch={false}>{inhalt}</Link>
  ) : (
    <div className="au-kennzahl">{inhalt}</div>
  );
}

function Panel({ titel, aktion, children, className }: { titel: string; aktion?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`au-panel ${className || ""}`}>
      <div className="au-panel-kopf">
        <h2>{titel}</h2>
        {aktion}
      </div>
      <div className="au-panel-inhalt">{children}</div>
    </section>
  );
}

async function Uebersicht({ supabase, heute, zeitraum, von, bis }: { supabase: any; heute: string; zeitraum?: string; von?: string; bis?: string }) {
  const { data: naechsteTermine } = await supabase
    .from("seminartermine")
    .select("id, titel, kennung, datum_start, datum_ende, zeit_start, format, kapazitaet, seminartypen(name, farbe), veranstaltungsorte(name, ort)")
    .gte("datum_start", heute)
    .in("status", ["geplant", "bestaetigt", "unterbesetzt"])
    .order("datum_start", { ascending: true })
    .limit(5);

  const jahrKpi = await ladeJahresKennzahlen(supabase, heute);

  // Belegung der naechsten Termine: Teilnehmer pro Person, nicht pro
  // Buchungsposition -- sonst zaehlte ein Zimmer-Upgrade als zweiter Platz.
  const dbNaechste = await berechneDeckungsbeitraege(supabase, (naechsteTermine || []).map((t: any) => t.id));
  const belegt = new Map<string, number>();
  dbNaechste.forEach((d, id) => belegt.set(id, d.teilnehmer));

  return (
    <>
      {/* Jahreskennzahlen -- jede Kachel beantwortet eine Frage (Markus 10/2026):
          Seminarumsatz, Gesamtumsatz, uebrige Geschaeftsfelder, Teilnehmer/
          freie Plaetze, offene Zahlungen. Ersetzt Anzahl-Kacheln ohne Zeitbezug. */}
      <div className="au-kennzahlen au-kennzahlen-5">
        <Kennzahl
          label={`Umsatz Seminare ${jahrKpi.jahr}`}
          wert={formatEURGanz(jahrKpi.seminare.gesamt)}
          kontext={`${formatEURGanz(jahrKpi.seminare.durchgefuehrt)} durchgeführt · ${formatEURGanz(jahrKpi.seminare.gebucht)} gebucht, Termin steht noch aus · inkl. Konferenz`}
          href="/dashboard?ansicht=seminare"
        />
        <Kennzahl
          label={`Umsatz gesamt ${jahrKpi.jahr}`}
          wert={formatEURGanz(jahrKpi.seminare.gesamt + jahrKpi.weitere.summe)}
          kontext={`Seminare + übrige Geschäftsfelder${jahrKpi.weitere.unklar > 0 ? ` · ohne ${formatEURGanz(jahrKpi.weitere.unklar)} noch nicht zugeordnet` : ""}`}
        />
        <Kennzahl
          label={`Umsatz übrige Geschäftsfelder ${jahrKpi.jahr}`}
          wert={formatEURGanz(jahrKpi.weitere.summe)}
          kontext={`zugeordnete FastBill-Rechnungen (Beratung, Buch …) · Daten bis ${jahrKpi.fastbillStand ? formatDatum(jahrKpi.fastbillStand) : "—"}`}
          href="/buchungen/fastbill/kategorisieren"
        />
        <Kennzahl
          label={`Teilnehmer ${jahrKpi.jahr} bislang`}
          wert={jahrKpi.teilnehmerBislang}
          kontext={`ohne Konferenz · ${jahrKpi.freiePlaetze} von ${jahrKpi.plaetzeKommend} Plätzen frei bis Jahresende (${jahrKpi.termineKommend} Termine)`}
          href="/termine"
        />
        <Kennzahl
          label="Offene Zahlungen"
          wert={formatEURGanz(jahrKpi.offen.summe)}
          kontext={jahrKpi.offen.anzahl ? `${jahrKpi.offen.anzahl} Buchung${jahrKpi.offen.anzahl === 1 ? "" : "en"} angefragt, noch nicht bezahlt` : "alles bezahlt"}
          href="/buchungen"
        />
      </div>

      <Geschaeftsfelder supabase={supabase} heute={heute} zeitraum={zeitraum} vonParam={von} bisParam={bis} />

      <div className="au-dash-raster">
        <div className="au-dash-haupt">
          <FaelligWidget />

          <Panel titel="Nächste Seminare" aktion={<Link href="/termine" className="au-panel-link" prefetch={false}>Alle Termine →</Link>}>
            {!naechsteTermine?.length && <p className="au-leer">Keine anstehenden Termine.</p>}
            <ul className="au-terminliste">
              {(naechsteTermine || []).map((t: any) => {
                const anzahl = belegt.get(t.id) || 0;
                const kapazitaet = Number(t.kapazitaet) || 0;
                const anteil = kapazitaet ? Math.min(1, anzahl / kapazitaet) : 0;
                const d = new Date(t.datum_start);
                return (
                  <li key={t.id}>
                    <Link href={`/termine/${t.id}`} className="au-terminzeile" prefetch={false}>
                      <span className="au-termin-datum" style={t.seminartypen?.farbe ? { borderColor: t.seminartypen.farbe } : undefined}>
                        <strong>{d.getUTCDate()}</strong>
                        <span>{d.toLocaleDateString("de-DE", { month: "short", timeZone: "UTC" })}</span>
                      </span>
                      <span className="au-termin-text">
                        <strong>{t.titel || t.seminartypen?.name}</strong>
                        <span className="au-klein">
                          {[t.kennung, t.veranstaltungsorte?.ort || t.veranstaltungsorte?.name, t.format === "online" ? "online" : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {kapazitaet > 0 && (
                        <span className="au-termin-belegung" title={`${anzahl} von ${kapazitaet} Plätzen belegt`}>
                          <span className="au-klein">{anzahl}/{kapazitaet}</span>
                          <span className="au-belegung-balken"><span style={{ width: `${anteil * 100}%` }} /></span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <div className="au-dash-seite">
          <Panel titel="Geburtstage" aktion={<Link href="/geburtstage" className="au-panel-link" prefetch={false}>Alle →</Link>}>
            <NaechsteGeburtstage />
          </Panel>
        </div>
      </div>

      <p style={{ marginTop: "1rem" }}>
        <Link href="/dashboard?ansicht=seminare" prefetch={false}>Umsatz &amp; Deckungsbeitrag pro Seminar →</Link>
      </p>
    </>
  );
}

async function NaechsteGeburtstage() {
  const eintraege = await ladeAnstehendeGeburtstage(14);
  if (!eintraege.length) {
    return <p className="au-leer">Keine Geburtstage in den nächsten 14 Tagen.</p>;
  }
  return (
    <ul className="au-kompaktliste">
      {eintraege.slice(0, 8).map((e) => (
        <li key={`${e.quelle}-${e.id}`}>
          <Link href={e.detailHref} prefetch={false}>{e.name}</Link>
          <span className={e.tageBis <= 1 ? "au-text-warning" : "au-klein"}>
            {e.tageBis === 0 ? "heute" : e.tageBis === 1 ? "morgen" : `in ${e.tageBis} Tagen`}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function UmsatzProSeminar({
  supabase,
  heute,
  zeitraumParam,
  von,
  bis,
  seminartypFilter,
}: {
  supabase: any;
  heute: string;
  zeitraumParam?: string;
  von?: string;
  bis?: string;
  seminartypFilter?: string;
}) {
  // Zeitraum nach Termin-Beginn, Standard: laufendes Jahr (Vergangenes +
  // bereits Gebuchtes). Nicht bis heute gekappt -- kuenftige gebuchte Termine
  // gehoeren ausdruecklich dazu (Markus 10/2026).
  const zr = zeitraumAus(zeitraumParam, heute, { vonParam: von, bisParam: bis, standard: heute.slice(0, 4) });
  const { data: seminartypen } = await supabase.from("seminartypen").select("id, name").order("name");
  return (
    <div className="au-sz-seite">
      <ZeitraumLeiste zeitraum={zr} heute={heute} seminartypen={seminartypen || []} seminartypFilter={seminartypFilter} />
      <SeminarCockpit supabase={supabase} heute={heute} zeitraum={zr} seminartypFilter={seminartypFilter} />
    </div>
  );
}

async function Nachfrage({ supabase }: { supabase: any }) {
  const [{ data: legacy }, { data: neu }] = await Promise.all([
    supabase.from("legacy_buchungen").select("jahr, kategorie_rohtext, seminartypen(name)"),
    supabase
      .from("buchungspositionen")
      .select("buchungen!inner(status), seminartermine(datum_start, seminartypen(name))")
      .neq("buchungen.status", "storniert")
      .not("seminartermin_id", "is", null),
  ]);

  // Matrix: Seminarart -> Jahr -> Anzahl
  const matrix = new Map<string, Map<number, number>>();
  const jahre = new Set<number>();

  function zaehle(seminarart: string | null | undefined, jahr: number | null | undefined) {
    if (!jahr) return;
    const art = seminarart || "Unbekannt / sonstige";
    jahre.add(jahr);
    if (!matrix.has(art)) matrix.set(art, new Map());
    const jahrMap = matrix.get(art)!;
    jahrMap.set(jahr, (jahrMap.get(jahr) || 0) + 1);
  }

  (legacy || []).forEach((l: any) => {
    zaehle(l.seminartypen?.name || l.kategorie_rohtext, l.jahr);
  });
  (neu || []).forEach((p: any) => {
    if (!p.seminartermine?.datum_start) return;
    const jahr = new Date(p.seminartermine.datum_start).getFullYear();
    zaehle(p.seminartermine.seminartypen?.name, jahr);
  });

  const jahreSortiert = [...jahre].sort((a, b) => b - a);
  const artenSortiert = [...matrix.keys()].sort((a, b) => {
    const summeA = [...matrix.get(a)!.values()].reduce((s, v) => s + v, 0);
    const summeB = [...matrix.get(b)!.values()].reduce((s, v) => s + v, 0);
    return summeB - summeA;
  });

  return (
    <div className="au-card">
      <h2>Nachfrage pro Seminarart & Jahr</h2>
      <p style={{ fontSize: "0.85rem" }}>
        Anzahl Teilnahmen (Altdaten aus dem Alt-System + neue Buchungen, ohne stornierte). Zeigt, welche Formate am
        meisten nachgefragt werden und wie sich die Nachfrage über die Jahre entwickelt.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="au-table">
          <thead>
            <tr>
              <th>Seminarart</th>
              {jahreSortiert.map((j) => (
                <th key={j} style={{ textAlign: "right" }}>{j}</th>
              ))}
              <th style={{ textAlign: "right" }}>Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {artenSortiert.map((art) => {
              const jahrMap = matrix.get(art)!;
              const gesamt = [...jahrMap.values()].reduce((s, v) => s + v, 0);
              return (
                <tr key={art}>
                  <td>{art}</td>
                  {jahreSortiert.map((j) => (
                    <td key={j} style={{ textAlign: "right" }}>{jahrMap.get(j) || "—"}</td>
                  ))}
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{gesamt}</td>
                </tr>
              );
            })}
            {!artenSortiert.length && (
              <tr className="au-table-empty"><td colSpan={jahreSortiert.length + 2}>Noch keine Daten.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function Auslastung({ supabase, heute }: { supabase: any; heute: string }) {
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(ort)")
    .is("deaktiviert_am", null)
    .order("datum_start", { ascending: true });

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("seminartermin_id, buchungen!inner(status)")
    .neq("buchungen.status", "storniert")
    .not("seminartermin_id", "is", null);

  const gebuchtProTermin = new Map<string, number>();
  (positionen || []).forEach((p: any) => {
    gebuchtProTermin.set(p.seminartermin_id, (gebuchtProTermin.get(p.seminartermin_id) || 0) + 1);
  });

  const anstehend = (termine || []).filter((t: any) => t.datum_start >= heute);
  const vergangen = (termine || []).filter((t: any) => t.datum_start < heute);

  function terminZeile(t: any) {
    const gebucht = gebuchtProTermin.get(t.id) || 0;
    const kapazitaet = t.kapazitaet || 0;
    const anteil = kapazitaet ? gebucht / kapazitaet : 0;
    const farbe = anteil >= 1 ? "var(--color-danger)" : anteil >= 0.7 ? "var(--color-warning)" : "var(--color-accent)";
    return (
      <tr key={t.id}>
        <td>
          <Link href={`/termine/${t.id}`}>{t.titel || t.seminartypen?.name} – {formatDatum(t.datum_start)}</Link>
        </td>
        <td>{t.veranstaltungsorte?.ort || "—"}</td>
        <td>{t.status}</td>
        <td style={{ minWidth: 140 }}>
          {gebucht} / {kapazitaet}
          {balken(anteil, farbe)}
        </td>
      </tr>
    );
  }

  return (
    <>
      <div className="au-card">
        <h2>Anstehende Termine</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Termin</th>
              <th>Ort</th>
              <th>Status</th>
              <th>Auslastung</th>
            </tr>
          </thead>
          <tbody>
            {anstehend.map(terminZeile)}
            {!anstehend.length && (
              <tr className="au-table-empty"><td colSpan={4}>Keine anstehenden Termine.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!!vergangen.length && (
        <div className="au-card">
          <h2>Vergangene Termine</h2>
          <table className="au-table">
            <thead>
              <tr>
                <th>Termin</th>
                <th>Ort</th>
                <th>Status</th>
                <th>Auslastung</th>
              </tr>
            </thead>
            <tbody>{vergangen.map(terminZeile)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function Kunden({ supabase }: { supabase: any }) {
  const [{ data: legacy }, { data: neu }, { data: organisationen }] = await Promise.all([
    supabase.from("legacy_buchungen").select("organisation_id").not("organisation_id", "is", null),
    supabase
      .from("buchungen")
      .select("organisation_id, status")
      .not("organisation_id", "is", null)
      .neq("status", "storniert"),
    supabase.from("organisationen").select("id, name").is("deaktiviert_am", null),
  ]);

  const namen = new Map<string, string>((organisationen || []).map((o: any) => [o.id, o.name]));
  const zaehler = new Map<string, number>();

  (legacy || []).forEach((l: any) => {
    zaehler.set(l.organisation_id, (zaehler.get(l.organisation_id) || 0) + 1);
  });
  (neu || []).forEach((b: any) => {
    zaehler.set(b.organisation_id, (zaehler.get(b.organisation_id) || 0) + 1);
  });

  const rangliste = [...zaehler.entries()]
    .map(([id, anzahl]) => ({ id, name: namen.get(id) || "Unbekannt", anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, 25);

  const maxAnzahl = rangliste[0]?.anzahl || 1;

  return (
    <div className="au-card">
      <h2>Top-Kunden nach Teilnahmen</h2>
      <p style={{ fontSize: "0.85rem" }}>
        Organisationen mit den meisten Teilnahmen — kombiniert aus Altdaten und neuen Buchungen.
      </p>
      <table className="au-table">
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Teilnahmen</th>
          </tr>
        </thead>
        <tbody>
          {rangliste.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/organisationen/${r.id}`}>{r.name}</Link></td>
              <td style={{ minWidth: 180 }}>
                {r.anzahl}
                {balken(r.anzahl / maxAnzahl)}
              </td>
            </tr>
          ))}
          {!rangliste.length && (
            <tr className="au-table-empty"><td colSpan={2}>Noch keine Daten.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function Vertrieb({ supabase }: { supabase: any }) {
  const [{ data: leads }, { data: warteliste }] = await Promise.all([
    supabase.from("leads").select("*, seminartypen(name)").order("erstellt_am", { ascending: false }),
    supabase.from("warteliste").select("*, seminartermine(titel, datum_start, seminartypen(name))").order("angemeldet_am", { ascending: false }),
  ]);

  const statusLabel: Record<string, string> = {
    neu: "Neu",
    kontaktiert: "Kontaktiert",
    wiedervorlage: "Wiedervorlage",
    gebucht: "Gebucht",
    kein_interesse: "Kein Interesse",
  };
  const statusZaehler = new Map<string, number>();
  (leads || []).forEach((l: any) => statusZaehler.set(l.status, (statusZaehler.get(l.status) || 0) + 1));

  return (
    <>
      <div className="au-card">
        <h2>Leads-Pipeline nach Status</h2>
        <div className="au-kpi-grid">
          {Object.keys(statusLabel).map((s) => (
            <div key={s} className="au-kpi-card">
              <div className="au-kpi-value">{statusZaehler.get(s) || 0}</div>
              <div className="au-kpi-label">{statusLabel[s]}</div>
            </div>
          ))}
        </div>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Firma</th>
              <th>Interesse</th>
              <th>Status</th>
              <th>Wiedervorlage</th>
            </tr>
          </thead>
          <tbody>
            {(leads || []).slice(0, 30).map((l: any) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.firma || "—"}</td>
                <td>{l.seminartypen?.name || "—"}</td>
                <td>{statusLabel[l.status] || l.status}</td>
                <td>{l.wiedervorlage_am ? formatDatum(l.wiedervorlage_am) : "—"}</td>
              </tr>
            ))}
            {!leads?.length && (
              <tr className="au-table-empty"><td colSpan={5}>Noch keine Leads erfasst.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="au-card">
        <h2>Warteliste</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name / E-Mail</th>
              <th>Termin</th>
              <th>Angemeldet am</th>
              <th>Benachrichtigt</th>
            </tr>
          </thead>
          <tbody>
            {(warteliste || []).map((w: any) => (
              <tr key={w.id}>
                <td>{w.name || w.email}</td>
                <td>{w.seminartermine ? `${w.seminartermine.titel || w.seminartermine.seminartypen?.name} – ${formatDatum(w.seminartermine.datum_start)}` : "—"}</td>
                <td>{formatDatum(w.angemeldet_am)}</td>
                <td>{w.benachrichtigt_am ? formatDatum(w.benachrichtigt_am) : "—"}</td>
              </tr>
            ))}
            {!warteliste?.length && (
              <tr className="au-table-empty"><td colSpan={4}>Niemand auf der Warteliste.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Jahreskennzahlen fuer die Kacheln der Uebersicht (laufendes Kalenderjahr).
// Seminare aus dem Buchungssystem (inkl. Konferenz), uebrige Geschaeftsfelder
// aus FastBill ohne die Kategorie mit schluessel 'seminar' (sonst doppelt).
async function ladeJahresKennzahlen(supabase: any, heute: string) {
  const jahr = Number(heute.slice(0, 4));
  const [{ data: termine }, { data: kategorien }, { data: rechnungen }, { data: stand }, { data: offen }] = await Promise.all([
    supabase.from("seminartermine").select("id, datum_start, datum_ende, kapazitaet, seminartypen(name)").gte("datum_start", `${jahr}-01-01`).lte("datum_start", `${jahr}-12-31`).neq("status", "abgesagt"),
    supabase.from("fastbill_kategorien").select("name, schluessel"),
    supabase.from("fastbill_rechnungen").select("kategorie, betrag_netto").gte("rechnungsdatum", `${jahr}-01-01`).lte("rechnungsdatum", heute),
    supabase.from("fastbill_rechnungen").select("rechnungsdatum").order("rechnungsdatum", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("buchungspositionen").select("buchung_id, preis, buchungen!inner(status)").eq("buchungen.status", "angefragt"),
  ]);
  const db = await berechneDeckungsbeitraege(supabase, (termine || []).map((t: any) => t.id));
  let durchgefuehrt = 0, gebucht = 0, teilnehmerBislang = 0, plaetzeKommend = 0, belegtKommend = 0, termineKommend = 0;
  (termine || []).forEach((t: any) => {
    const d = db.get(t.id);
    if (!d) return;
    const vergangen = (t.datum_ende || t.datum_start) < heute;
    if (vergangen) durchgefuehrt += d.umsatz;
    else gebucht += d.umsatz;
    const konferenz = (t.seminartypen?.name || "").toLowerCase().includes("konferenz");
    if (konferenz) return;
    if (vergangen) teilnehmerBislang += d.teilnehmer;
    else {
      termineKommend++;
      plaetzeKommend += Number(t.kapazitaet) || 0;
      belegtKommend += Math.min(d.teilnehmer, Number(t.kapazitaet) || d.teilnehmer);
    }
  });
  const seminarName = (kategorien || []).find((k: any) => k.schluessel === "seminar")?.name;
  const weitere = { summe: 0, unklar: 0 };
  (rechnungen || []).forEach((r: any) => {
    const b = Number(r.betrag_netto || 0);
    if (!r.kategorie || r.kategorie === "unklar") weitere.unklar += b;
    else if (r.kategorie !== seminarName) weitere.summe += b;
  });
  const offenSumme = (offen || []).reduce((s: number, p: any) => s + Number(p.preis || 0), 0);
  return {
    jahr,
    seminare: { durchgefuehrt, gebucht, gesamt: durchgefuehrt + gebucht },
    weitere,
    fastbillStand: (stand as any)?.rechnungsdatum || null,
    teilnehmerBislang,
    termineKommend,
    plaetzeKommend,
    freiePlaetze: Math.max(0, plaetzeKommend - belegtKommend),
    offen: { summe: offenSumme, anzahl: new Set((offen || []).map((p: any) => p.buchung_id)).size },
  };
}
