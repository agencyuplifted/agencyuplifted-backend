export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEUR, formatEURBrutto, formatDatum } from "@/lib/format";
import { ladeAnstehendeGeburtstage } from "@/lib/geburtstage";
import FaelligWidget from "../wiedervorlage/FaelligWidget";
import { getAktuellerBenutzer } from "@/lib/auth";

type Ansicht = "uebersicht" | "nachfrage" | "auslastung" | "kunden" | "vertrieb";

const TABS: { key: Ansicht; label: string }[] = [
  { key: "uebersicht", label: "Übersicht" },
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
  searchParams: Promise<{ ansicht?: string; jahr?: string; seminartyp?: string }>;
}) {
  const { ansicht: ansichtRaw, jahr: jahrRaw, seminartyp } = await searchParams;
  const ansicht: Ansicht = (TABS.some((t) => t.key === ansichtRaw) ? ansichtRaw : "uebersicht") as Ansicht;
  const jahr = Number(jahrRaw) || new Date().getFullYear();

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

      {ansicht === "uebersicht" && <Uebersicht supabase={supabase} heute={heute} jahr={jahr} seminartypFilter={seminartyp} />}
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

async function Uebersicht({
  supabase,
  heute,
  jahr,
  seminartypFilter,
}: {
  supabase: any;
  heute: string;
  jahr: number;
  seminartypFilter?: string;
}) {
  const in30Tagen = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [
    { count: teilnehmerCount },
    { count: orgaCount },
    { count: terminCount },
    { count: termine30 },
    { count: legacyCount },
    { count: leadsOffen },
    { count: wartelisteCount },
    { data: positionen },
    { data: naechsteTermine },
  ] = await Promise.all([
    supabase.from("teilnehmer").select("*", { count: "exact", head: true }).is("deaktiviert_am", null),
    supabase.from("organisationen").select("*", { count: "exact", head: true }).is("deaktiviert_am", null),
    supabase.from("seminartermine").select("*", { count: "exact", head: true }).gte("datum_start", heute).in("status", ["geplant", "bestaetigt", "unterbesetzt"]),
    supabase.from("seminartermine").select("*", { count: "exact", head: true }).gte("datum_start", heute).lte("datum_start", in30Tagen).in("status", ["geplant", "bestaetigt", "unterbesetzt"]),
    supabase.from("legacy_buchungen").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).not("status", "in", "(gebucht,kein_interesse)"),
    supabase.from("warteliste").select("*", { count: "exact", head: true }),
    supabase.from("buchungspositionen").select("preis, buchungen!inner(status)").neq("buchungen.status", "storniert"),
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, datum_ende, zeit_start, format, kapazitaet, seminartypen(name, farbe), veranstaltungsorte(name, ort)")
      .gte("datum_start", heute)
      .in("status", ["geplant", "bestaetigt", "unterbesetzt"])
      .order("datum_start", { ascending: true })
      .limit(5),
  ]);

  const umsatzNetto = (positionen || []).reduce((sum: number, p: any) => sum + Number(p.preis || 0), 0);

  // Belegung der naechsten Termine: gebuchte Plaetze (ohne Stornos) plus
  // zugeordnete Altdaten -- gleiche Quelle wie "Umsatz pro Seminar".
  const terminIds = (naechsteTermine || []).map((t: any) => t.id);
  const [{ data: belegtNeu }, { data: belegtAlt }] = await Promise.all([
    terminIds.length
      ? supabase.from("buchungspositionen").select("seminartermin_id, buchungen!inner(status)").in("seminartermin_id", terminIds).neq("buchungen.status", "storniert")
      : Promise.resolve({ data: [] }),
    terminIds.length ? supabase.from("legacy_buchungen").select("seminartermin_id").in("seminartermin_id", terminIds) : Promise.resolve({ data: [] }),
  ]);
  const belegt = new Map<string, number>();
  [...(belegtNeu || []), ...(belegtAlt || [])].forEach((b: any) => belegt.set(b.seminartermin_id, (belegt.get(b.seminartermin_id) || 0) + 1));

  return (
    <>
      <div className="au-kennzahlen">
        <Kennzahl label="Anstehende Seminare" wert={terminCount ?? 0} kontext={`${termine30 ?? 0} in den nächsten 30 Tagen`} href="/termine" />
        <Kennzahl label="Offene Leads" wert={leadsOffen ?? 0} kontext={`${wartelisteCount ?? 0} auf der Warteliste`} href="/leads" />
        <Kennzahl label="Umsatz netto" wert={formatEUR(umsatzNetto)} kontext={`brutto ${formatEURBrutto(umsatzNetto)} · neues System`} href="/buchungen" />
        <Kennzahl label="Teilnehmer" wert={teilnehmerCount ?? 0} kontext={`${orgaCount ?? 0} Organisationen · ${legacyCount ?? 0} Alt-Teilnahmen`} href="/teilnehmer" />
      </div>

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

      <UmsatzProSeminar supabase={supabase} jahr={jahr} seminartypFilter={seminartypFilter} />
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
  jahr,
  seminartypFilter,
}: {
  supabase: any;
  jahr: number;
  seminartypFilter?: string;
}) {
  let terminQuery = supabase
    .from("seminartermine")
    .select("id, titel, kennung, datum_start, seminartypen(id, name)")
    .gte("datum_start", `${jahr}-01-01`)
    .lte("datum_start", `${jahr}-12-31`)
    .neq("status", "abgesagt")
    .order("datum_start", { ascending: true });
  if (seminartypFilter) terminQuery = terminQuery.eq("seminartyp_id", seminartypFilter);
  // Parallel statt nacheinander -- jede Abfrage ist ein eigener Round-Trip zur DB.
  const [{ data: konfig }, { data: seminartypen }, { data: termine }] = await Promise.all([
    supabase.from("finanz_konfiguration").select("fremdkosten_pro_person_netto").eq("id", 1).single(),
    supabase.from("seminartypen").select("id, name").order("name"),
    terminQuery,
  ]);
  const fremdkostenProPerson = Number(konfig?.fremdkosten_pro_person_netto ?? 300);

  const terminIds = (termine || []).map((t: any) => t.id);

  const [{ data: positionen }, { data: legacyPositionen }] = await Promise.all([
    terminIds.length
      ? supabase
          .from("buchungspositionen")
          .select("seminartermin_id, teilnehmer_id, preis, buchungen!inner(status)")
          .in("seminartermin_id", terminIds)
          .neq("buchungen.status", "storniert")
      : Promise.resolve({ data: [] }),
    terminIds.length
      ? supabase.from("legacy_buchungen").select("seminartermin_id, teilnehmer_id").in("seminartermin_id", terminIds)
      : Promise.resolve({ data: [] }),
  ]);

  const umsatzProTermin = new Map<string, number>();
  const personenProTermin = new Map<string, Set<string>>();

  (positionen || []).forEach((p: any) => {
    if (!p.seminartermin_id) return;
    umsatzProTermin.set(p.seminartermin_id, (umsatzProTermin.get(p.seminartermin_id) || 0) + Number(p.preis || 0));
    if (p.teilnehmer_id) {
      if (!personenProTermin.has(p.seminartermin_id)) personenProTermin.set(p.seminartermin_id, new Set());
      personenProTermin.get(p.seminartermin_id)!.add(p.teilnehmer_id);
    }
  });
  (legacyPositionen || []).forEach((l: any) => {
    if (!l.seminartermin_id || !l.teilnehmer_id) return;
    if (!personenProTermin.has(l.seminartermin_id)) personenProTermin.set(l.seminartermin_id, new Set());
    personenProTermin.get(l.seminartermin_id)!.add(l.teilnehmer_id);
  });

  const zeilen = (termine || []).map((t: any) => {
    const umsatz = umsatzProTermin.get(t.id) || 0;
    const personen = personenProTermin.get(t.id)?.size || 0;
    const fremdkosten = personen * fremdkostenProPerson;
    const db = umsatz - fremdkosten;
    return { ...t, umsatz, personen, fremdkosten, db };
  });

  const gesamtUmsatz = zeilen.reduce((s: number, z: any) => s + z.umsatz, 0);
  const gesamtFremdkosten = zeilen.reduce((s: number, z: any) => s + z.fremdkosten, 0);
  const gesamtDb = gesamtUmsatz - gesamtFremdkosten;

  const jahre = [jahr - 2, jahr - 1, jahr, jahr + 1];

  return (
    <Panel
      titel={`Umsatz pro Seminar ${jahr}`}
      className="au-panel-breit"
      aktion={
        <form method="get" className="au-panel-filter">
          <input type="hidden" name="ansicht" value="uebersicht" />
          <select name="jahr" defaultValue={jahr} aria-label="Jahr" className="au-select">
            {jahre.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          <select name="seminartyp" defaultValue={seminartypFilter || ""} aria-label="Seminar" className="au-select">
            <option value="">Alle Seminare</option>
            {(seminartypen || []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Anzeigen</button>
        </form>
      }
    >
      <div className="au-summenleiste">
        <div><span>Umsatz netto</span><strong>{formatEUR(gesamtUmsatz)}</strong></div>
        <div><span>Fremdkosten (geschätzt)</span><strong>{formatEUR(gesamtFremdkosten)}</strong></div>
        <div><span>Deckungsbeitrag (geschätzt)</span><strong>{formatEUR(Math.round(gesamtDb))}</strong></div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="au-table">
          <thead>
            <tr>
              <th>Termin</th>
              <th>Datum</th>
              <th style={{ textAlign: "right" }}>Personen</th>
              <th style={{ textAlign: "right" }}>Umsatz</th>
              <th style={{ textAlign: "right" }}>Fremdkosten</th>
              <th style={{ textAlign: "right" }}>DB</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z: any) => (
              <tr key={z.id}>
                <td><Link href={`/termine/${z.id}`} prefetch={false}>{z.titel || z.seminartypen?.name}{z.kennung ? ` (${z.kennung})` : ""}</Link></td>
                <td style={{ whiteSpace: "nowrap" }}>{formatDatum(z.datum_start)}</td>
                <td style={{ textAlign: "right" }}>{z.personen}</td>
                <td style={{ textAlign: "right" }}>{formatEUR(z.umsatz)}</td>
                <td style={{ textAlign: "right", color: "var(--color-text-muted)" }}>{formatEUR(z.fremdkosten)}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{formatEUR(Math.round(z.db))}</td>
              </tr>
            ))}
            {!zeilen.length && (
              <tr className="au-table-empty"><td colSpan={6}>Keine Seminare mit Umsatz in {jahr}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="au-fussnote">
        Fremdkosten = Personen (Teilnehmer, Mitarbeiter, Gastreferenten) × {formatEUR(fremdkostenProPerson)} netto pro Kopf,{" "}
        <Link href="/einstellungen" prefetch={false}>einstellbar</Link>. Umsatz nur aus Buchungen des neuen Systems (Altdaten haben keine Preise);
        Stornos ausgeschlossen. Alle Beträge netto zzgl. 19 % USt.
      </p>
    </Panel>
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
