export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEUR, formatEURBrutto, formatDatum } from "@/lib/format";

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
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const { ansicht: ansichtRaw } = await searchParams;
  const ansicht: Ansicht = (TABS.some((t) => t.key === ansichtRaw) ? ansichtRaw : "uebersicht") as Ansicht;

  const supabase = getSupabaseAdmin();
  const heute = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Auswertungen über Teilnehmer, Buchungen, Nachfrage und Vertrieb — kombiniert aus Altdaten (Pipedrive-Import) und dem neuen System.</p>

      <div className="au-tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={`/dashboard?ansicht=${t.key}`} className={`au-tab ${t.key === ansicht ? "au-tab-active" : ""}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {ansicht === "uebersicht" && <Uebersicht supabase={supabase} heute={heute} />}
      {ansicht === "nachfrage" && <Nachfrage supabase={supabase} />}
      {ansicht === "auslastung" && <Auslastung supabase={supabase} heute={heute} />}
      {ansicht === "kunden" && <Kunden supabase={supabase} />}
      {ansicht === "vertrieb" && <Vertrieb supabase={supabase} />}
    </main>
  );
}

async function Uebersicht({ supabase, heute }: { supabase: any; heute: string }) {
  const [
    { count: teilnehmerCount },
    { count: orgaCount },
    { count: terminCount },
    { count: legacyCount },
    { count: leadsOffen },
    { count: wartelisteCount },
    { data: positionen },
  ] = await Promise.all([
    supabase.from("teilnehmer").select("*", { count: "exact", head: true }).is("deaktiviert_am", null),
    supabase.from("organisationen").select("*", { count: "exact", head: true }).is("deaktiviert_am", null),
    supabase.from("seminartermine").select("*", { count: "exact", head: true }).gte("datum_start", heute).in("status", ["geplant", "bestaetigt", "unterbesetzt"]),
    supabase.from("legacy_buchungen").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).not("status", "in", "(gebucht,kein_interesse)"),
    supabase.from("warteliste").select("*", { count: "exact", head: true }),
    supabase.from("buchungspositionen").select("preis, buchungen!inner(status)").neq("buchungen.status", "storniert"),
  ]);

  const umsatzNetto = (positionen || []).reduce((sum: number, p: any) => sum + Number(p.preis || 0), 0);

  return (
    <>
      <div className="au-kpi-grid">
        <div className="au-kpi-card">
          <div className="au-kpi-value">{teilnehmerCount ?? 0}</div>
          <div className="au-kpi-label">Teilnehmer (aktiv)</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-value">{orgaCount ?? 0}</div>
          <div className="au-kpi-label">Organisationen (aktiv)</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-value">{terminCount ?? 0}</div>
          <div className="au-kpi-label">Anstehende Seminartermine</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-value">{formatEUR(umsatzNetto)}</div>
          <div className="au-kpi-label">Umsatz netto (neues System, nicht storniert)</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-value">{leadsOffen ?? 0}</div>
          <div className="au-kpi-label">Offene Leads</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-value">{wartelisteCount ?? 0}</div>
          <div className="au-kpi-label">Wartelisten-Einträge</div>
        </div>
        <div className="au-kpi-card">
          <div className="au-kpi-value">{legacyCount ?? 0}</div>
          <div className="au-kpi-label">Historische Teilnahmen (Altdaten)</div>
        </div>
      </div>
      <div className="au-card">
        <p style={{ fontSize: "0.85rem", margin: 0 }}>
          Hinweis: Der Umsatz-Wert bezieht sich nur auf Buchungen, die im neuen System erfasst wurden — bei den
          historischen Pipedrive-Altdaten wurden keine Preise übernommen. Alle Preise netto, zzgl. 19% USt. (brutto:{" "}
          {formatEURBrutto(umsatzNetto)}).
        </p>
      </div>
    </>
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
        Anzahl Teilnahmen (Altdaten aus Pipedrive-Import + neue Buchungen, ohne stornierte). Zeigt, welche Formate am
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
