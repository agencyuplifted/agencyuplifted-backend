export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createWartelisteEintrag, benachrichtigeWarteliste } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

export default async function WartelistePage() {
  const supabase = getSupabaseAdmin();
  const { data: eintraege } = await supabase
    .from("warteliste")
    .select("*, seminartermine(datum_start, seminartypen(name))")
    .order("angemeldet_am", { ascending: true });

  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .order("datum_start");

  return (
    <main>
      <h1>Warteliste</h1>
      <p style={{ color: "#666" }}>Interessenten für ausgebuchte oder fast ausgebuchte Termine.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Termin</th>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>E-Mail</th>
            <th style={{ padding: "0.5rem" }}>Angemeldet</th>
            <th style={{ padding: "0.5rem" }}>Benachrichtigt</th>
            <th style={{ padding: "0.5rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {eintraege?.map((e: any) => (
            <tr key={e.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}>
                {e.seminartermine ? `${e.seminartermine.seminartypen?.name} – ${formatDatum(e.seminartermine.datum_start)}` : "—"}
              </td>
              <td style={{ padding: "0.5rem" }}>{e.name || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{e.email}</td>
              <td style={{ padding: "0.5rem" }}>{formatDatum(e.angemeldet_am)}</td>
              <td style={{ padding: "0.5rem" }}>{e.benachrichtigt_am ? formatDatum(e.benachrichtigt_am) : "—"}</td>
              <td style={{ padding: "0.5rem" }}>
                {!e.benachrichtigt_am && (
                  <form action={benachrichtigeWarteliste}>
                    <input type="hidden" name="eintrag_id" value={e.id} />
                    <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.35rem 0.7rem", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>
                      Als benachrichtigt markieren
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {!eintraege?.length && (
            <tr><td colSpan={6} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Warteliste-Einträge.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ border: "1px solid #e2e2e2", padding: "1.25rem", maxWidth: 560 }}>
        <h2>Manuell hinzufügen</h2>
        <form action={createWartelisteEintrag} style={row}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Seminartermin</label>
            <select style={inputStyle} name="seminartermin_id" required>
              {termine?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.seminartypen?.name} – {formatDatum(t.datum_start)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} name="name" />
          </div>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input style={inputStyle} name="email" type="email" required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Zur Warteliste hinzufügen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
