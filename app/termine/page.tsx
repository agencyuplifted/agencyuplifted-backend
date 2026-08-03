export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { duplicateSeminartermin } from "@/lib/actions";

export default async function TerminePage() {
  const supabase = getSupabaseAdmin();
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name)")
    .order("datum_start", { ascending: true });

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Seminartermine</h1>
        <Link href="/termine/neu" className="au-btn au-btn-primary">+ Neuer Termin</Link>
      </div>

      <table className="au-table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Kategorie</th>
            <th>Datum</th>
            <th>Ort</th>
            <th>Format</th>
            <th>Kapazität</th>
            <th>Angezeigte Restplätze</th>
            <th>Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {termine?.map((t: any) => (
            <tr key={t.id}>
              <td><Link href={`/termine/${t.id}`}>{t.titel || t.seminartypen?.name}</Link></td>
              <td>{t.seminartypen?.name}</td>
              <td>{formatDatum(t.datum_start)}{t.zeit_start ? `, ${t.zeit_start.slice(0, 5)} Uhr` : ""}</td>
              <td>{t.veranstaltungsorte?.name || "—"}</td>
              <td>{t.format}</td>
              <td>{t.kapazitaet} (+{t.ueberbuchungspuffer} intern)</td>
              <td>{t.angezeigte_restplaetze ?? "—"}</td>
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
          ))}
          {!termine?.length && (
            <tr className="au-table-empty"><td colSpan={9}>Noch keine Termine angelegt.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
