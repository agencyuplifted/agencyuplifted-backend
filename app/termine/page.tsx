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
        <Link href="/termine/neu" style={{ background: "#102A4C", color: "white", padding: "0.5rem 1rem", textDecoration: "none" }}>
          + Neuer Termin
        </Link>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Titel</th>
            <th style={{ padding: "0.5rem" }}>Kategorie</th>
            <th style={{ padding: "0.5rem" }}>Datum</th>
            <th style={{ padding: "0.5rem" }}>Ort</th>
            <th style={{ padding: "0.5rem" }}>Format</th>
            <th style={{ padding: "0.5rem" }}>Kapazität</th>
            <th style={{ padding: "0.5rem" }}>Angezeigte Restplätze</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
            <th style={{ padding: "0.5rem" }}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {termine?.map((t: any) => (
            <tr key={t.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}>
                <Link href={`/termine/${t.id}`} style={{ color: "#102A4C" }}>{t.titel || t.seminartypen?.name}</Link>
              </td>
              <td style={{ padding: "0.5rem" }}>{t.seminartypen?.name}</td>
              <td style={{ padding: "0.5rem" }}>
                {formatDatum(t.datum_start)}{t.zeit_start ? `, ${t.zeit_start.slice(0, 5)} Uhr` : ""}
              </td>
              <td style={{ padding: "0.5rem" }}>{t.veranstaltungsorte?.name || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{t.format}</td>
              <td style={{ padding: "0.5rem" }}>{t.kapazitaet} (+{t.ueberbuchungspuffer} intern)</td>
              <td style={{ padding: "0.5rem" }}>{t.angezeigte_restplaetze ?? "—"}</td>
              <td style={{ padding: "0.5rem" }}>{t.status}</td>
              <td style={{ padding: "0.5rem" }}>
                <form action={duplicateSeminartermin}>
                  <input type="hidden" name="seminartermin_id" value={t.id} />
                  <button
                    type="submit"
                    title="Termin inkl. Optionen, Preisstaffeln und Urgency-Stufen duplizieren"
                    style={{ background: "transparent", color: "#102A4C", border: "1px solid #102A4C", padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.8rem" }}
                  >
                    Duplizieren
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {!termine?.length && (
            <tr><td colSpan={9} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Termine angelegt.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
