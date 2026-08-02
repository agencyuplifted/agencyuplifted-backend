export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createPreisstaffel, createUrgencyStufe } from "@/lib/actions";
import { formatDatum, formatEUR } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name)")
    .eq("id", id)
    .single();

  const { data: preisstaffeln } = await supabase
    .from("preisstaffeln")
    .select("*")
    .eq("seminartermin_id", id)
    .order("stichtag_tage_vor_start", { ascending: false });

  const { data: urgencyStufen } = await supabase
    .from("urgency_stufen")
    .select("*")
    .eq("seminartermin_id", id)
    .order("schwellenwert_prozent", { ascending: true });

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  return (
    <main>
      <h1>{termin.seminartypen?.name} – {formatDatum(termin.datum_start)}</h1>
      <p style={{ color: "#666" }}>
        {termin.veranstaltungsorte?.name || "—"} · {termin.format} · Kapazität {termin.kapazitaet} (+{termin.ueberbuchungspuffer} intern) · Status {termin.status}
      </p>

      <div style={card}>
        <h2>Preisstaffeln</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Name</th>
              <th style={{ padding: "0.4rem" }}>Stichtag (Tage vorher)</th>
              <th style={{ padding: "0.4rem" }}>Preis</th>
            </tr>
          </thead>
          <tbody>
            {preisstaffeln?.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{p.name}</td>
                <td style={{ padding: "0.4rem" }}>{p.stichtag_tage_vor_start}</td>
                <td style={{ padding: "0.4rem" }}>{formatEUR(Number(p.preis))}</td>
              </tr>
            ))}
            {!preisstaffeln?.length && (
              <tr><td colSpan={3} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Preisstaffeln.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createPreisstaffel} style={row}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label style={labelStyle}>Name (z. B. Super-Frühbucher)</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div>
            <label style={labelStyle}>Stichtag (Tage vor Start)</label>
            <input style={inputStyle} name="stichtag_tage_vor_start" type="number" required />
          </div>
          <div>
            <label style={labelStyle}>Preis (€)</label>
            <input style={inputStyle} name="preis" type="number" step="0.01" required />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Staffel hinzufügen
            </button>
          </div>
        </form>
      </div>

      <div style={card}>
        <h2>Urgency-Stufen</h2>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Text, der ab dem jeweiligen Belegungs-Prozentsatz angezeigt wird (basierend auf "Angezeigte Restplätze"). Platzhalter <code>{"{remaining}"}</code> / <code>{"{total}"}</code> möglich.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Ab % belegt</th>
              <th style={{ padding: "0.4rem" }}>Text</th>
            </tr>
          </thead>
          <tbody>
            {urgencyStufen?.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{u.schwellenwert_prozent}%</td>
                <td style={{ padding: "0.4rem" }}>{u.text_vorlage}</td>
              </tr>
            ))}
            {!urgencyStufen?.length && (
              <tr><td colSpan={2} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Urgency-Stufen.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createUrgencyStufe} style={row}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label style={labelStyle}>Schwellenwert (% belegt)</label>
            <input style={inputStyle} name="schwellenwert_prozent" type="number" min={0} max={100} required />
          </div>
          <div>
            <label style={labelStyle}>Text</label>
            <input style={inputStyle} name="text_vorlage" placeholder="Nur noch wenige Plätze" required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Stufe hinzufügen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
