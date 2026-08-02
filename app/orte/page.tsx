export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createVeranstaltungsort } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

export default async function OrtePage() {
  const supabase = getSupabaseAdmin();
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");

  return (
    <main>
      <h1>Veranstaltungsorte</h1>
      <p style={{ color: "#666" }}>Hotels/Locations, in denen Präsenz-Seminare stattfinden.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Adresse</th>
            <th style={{ padding: "0.5rem" }}>Ort</th>
            <th style={{ padding: "0.5rem" }}>Nahe Großstadt</th>
          </tr>
        </thead>
        <tbody>
          {orte?.map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}>{o.name}</td>
              <td style={{ padding: "0.5rem" }}>{o.adresse || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{o.ort || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{o.nahe_grossstadt ? `bei ${o.nahe_grossstadt}` : "—"}</td>
            </tr>
          ))}
          {!orte?.length && (
            <tr><td colSpan={4} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Orte erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ border: "1px solid #e2e2e2", padding: "1.25rem", maxWidth: 560 }}>
        <h2>Neuer Ort</h2>
        <form action={createVeranstaltungsort} style={row}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Name (z. B. Weißes Ross)</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Adresse</label>
            <input style={inputStyle} name="adresse" placeholder="Straße, PLZ, Land" />
          </div>
          <div>
            <label style={labelStyle}>Ort (z. B. Illschwang)</label>
            <input style={inputStyle} name="ort" />
          </div>
          <div>
            <label style={labelStyle}>Nahe Großstadt (für Marketing, z. B. Nürnberg)</label>
            <input style={inputStyle} name="nahe_grossstadt" placeholder="wird angezeigt als „bei Nürnberg“" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Ort anlegen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
