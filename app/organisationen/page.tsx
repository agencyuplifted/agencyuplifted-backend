export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createOrganisation } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };

export default async function OrganisationenPage() {
  const supabase = getSupabaseAdmin();
  const { data: orgs } = await supabase
    .from("organisationen")
    .select("*")
    .order("erstellt_am", { ascending: false });

  return (
    <main>
      <h1>Organisationen</h1>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Ort</th>
            <th style={{ padding: "0.5rem" }}>USt-ID</th>
          </tr>
        </thead>
        <tbody>
          {orgs?.map((o) => (
            <tr key={o.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}>{o.name}</td>
              <td style={{ padding: "0.5rem" }}>{o.rechnungsadresse_ort || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{o.ust_id || "—"}</td>
            </tr>
          ))}
          {!orgs?.length && (
            <tr><td colSpan={3} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Organisationen erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <h2>Neue Organisation</h2>
      <form action={createOrganisation} style={{ maxWidth: 420 }}>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} name="name" required />
        <label style={labelStyle}>Straße</label>
        <input style={inputStyle} name="strasse" />
        <label style={labelStyle}>PLZ</label>
        <input style={inputStyle} name="plz" />
        <label style={labelStyle}>Ort</label>
        <input style={inputStyle} name="ort" />
        <label style={labelStyle}>USt-ID (falls Ausland)</label>
        <input style={inputStyle} name="ust_id" />
        <label style={labelStyle}>Branche</label>
        <input style={inputStyle} name="branche" />
        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Anlegen
        </button>
      </form>
    </main>
  );
}
