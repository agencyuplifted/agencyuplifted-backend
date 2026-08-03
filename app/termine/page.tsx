export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, monatsName } from "@/lib/format";
import { duplicateSeminartermin } from "@/lib/actions";

export default async function TerminePage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrRaw } = await searchParams;
  const heute = new Date();
  const jahr = Number(jahrRaw) || heute.getFullYear();

  const supabase = getSupabaseAdmin();
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name, ort)")
    .gte("datum_start", `${jahr}-01-01`)
    .lte("datum_start", `${jahr}-12-31`)
    .order("datum_start", { ascending: true });

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("seminartermin_id, buchungen!inner(status)")
    .neq("buchungen.status", "storniert");

  const gebuchtProTermin = new Map<string, number>();
  (positionen || []).forEach((p: any) => {
    if (!p.seminartermin_id) return;
    gebuchtProTermin.set(p.seminartermin_id, (gebuchtProTermin.get(p.seminartermin_id) || 0) + 1);
  });

  const proMonat = new Map<number, any[]>();
  (termine || []).forEach((t: any) => {
    const monat = new Date(t.datum_start).getMonth();
    if (!proMonat.has(monat)) proMonat.set(monat, []);
    proMonat.get(monat)!.push(t);
  });

  const monateSortiert = [...proMonat.keys()].sort((a, b) => a - b);
  const heuteISO = heute.toISOString().slice(0, 10);

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Seminartermine</h1>
        <Link href="/termine/neu" className="au-btn au-btn-primary">+ Neuer Termin</Link>
      </div>

      <div className="au-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href={`/termine?jahr=${jahr - 1}`} className="au-btn au-btn-secondary au-btn-sm">← {jahr - 1}</Link>
        <strong style={{ fontSize: "1.15rem" }}>{jahr} · {termine?.length || 0} Termin(e)</strong>
        <Link href={`/termine?jahr=${jahr + 1}`} className="au-btn au-btn-secondary au-btn-sm">{jahr + 1} →</Link>
      </div>

      {!termine?.length && (
        <div className="au-card">
          <p style={{ margin: 0 }}>Keine Seminartermine in {jahr}.</p>
        </div>
      )}

      {monateSortiert.map((monat) => (
        <div className="au-card" key={monat}>
          <h2>{monatsName(monat)} {jahr}</h2>
          <table className="au-table">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Datum</th>
                <th>Ort</th>
                <th>Format</th>
                <th>Belegung</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {proMonat.get(monat)!.map((t: any) => {
                const gebucht = gebuchtProTermin.get(t.id) || 0;
                const vergangen = t.datum_start < heuteISO;
                return (
                  <tr key={t.id} style={vergangen ? { opacity: 0.6 } : undefined}>
                    <td><Link href={`/termine/${t.id}`}>{t.titel || t.seminartypen?.name}</Link></td>
                    <td>{formatDatum(t.datum_start)}{t.zeit_start ? `, ${t.zeit_start.slice(0, 5)} Uhr` : ""}</td>
                    <td>{t.veranstaltungsorte?.name || "—"}</td>
                    <td>{t.format}</td>
                    <td>{gebucht} / {t.kapazitaet} (+{t.ueberbuchungspuffer} intern)</td>
                    <td>{t.status}</td>
                    <td>
                      <form action={duplicateSeminartermin}>
                        <input type="hidden" name="seminartermin_id" value={t.id} />
                        <button
                          type="submit"
                          title="Termin inkl. Optionen, Preisstaffeln und Urgency-Stufen duplizieren"
                          className="au-btn au-btn-secondary au-btn-sm"
                        >
                          Duplizieren
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </main>
  );
}
