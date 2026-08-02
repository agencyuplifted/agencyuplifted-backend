export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createTrainer } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

export default async function TrainerPage() {
  const supabase = getSupabaseAdmin();
  const { data: trainer } = await supabase.from("trainer").select("*").order("name");

  return (
    <main>
      <h1>Trainer</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>E-Mail</th>
          </tr>
        </thead>
        <tbody>
          {trainer?.map((t) => (
            <tr key={t.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}>{t.name}</td>
              <td style={{ padding: "0.5rem" }}>{t.email || "—"}</td>
            </tr>
          ))}
          {!trainer?.length && (
            <tr><td colSpan={2} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Trainer erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ border: "1px solid #e2e2e2", padding: "1.25rem", maxWidth: 560 }}>
        <h2>Neuer Trainer</h2>
        <form action={createTrainer} style={row}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input style={inputStyle} name="email" type="email" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Trainer anlegen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
