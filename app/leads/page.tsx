export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createLead, updateLeadStatus } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

const statusLabel: Record<string, string> = {
  neu: "Neu",
  kontaktiert: "Kontaktiert",
  wiedervorlage: "Wiedervorlage",
  gebucht: "Gebucht",
  kein_interesse: "Kein Interesse",
};

export default async function LeadsPage() {
  const supabase = getSupabaseAdmin();
  const { data: leads } = await supabase
    .from("leads")
    .select("*, seminartypen(name)")
    .order("wiedervorlage_am", { ascending: true, nullsFirst: false });
  const { data: seminartypen } = await supabase.from("seminartypen").select("*").order("name");

  const heute = new Date().toISOString().slice(0, 10);

  return (
    <main>
      <h1>Leads / Interessenten</h1>
      <p style={{ color: "#666" }}>Personen mit Interesse, die noch angerufen/erinnert werden sollen — getrennt von echten Buchungen.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Firma</th>
            <th style={{ padding: "0.5rem" }}>Interesse</th>
            <th style={{ padding: "0.5rem" }}>Grund</th>
            <th style={{ padding: "0.5rem" }}>Wiedervorlage</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {leads?.map((l: any) => {
            const faellig = l.wiedervorlage_am && l.wiedervorlage_am <= heute && l.status !== "gebucht" && l.status !== "kein_interesse";
            return (
              <tr key={l.id} style={{ borderBottom: "1px solid #e2e2e2", background: faellig ? "#fff4e5" : "transparent" }}>
                <td style={{ padding: "0.5rem" }}>{l.name}{faellig ? " ⚠️" : ""}</td>
                <td style={{ padding: "0.5rem" }}>{l.firma || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{l.seminartypen?.name || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{l.grund || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{l.wiedervorlage_am ? formatDatum(l.wiedervorlage_am) : "—"}</td>
                <td style={{ padding: "0.5rem" }}>
                  <form action={updateLeadStatus} style={{ display: "flex", gap: "0.4rem" }}>
                    <input type="hidden" name="lead_id" value={l.id} />
                    <select name="status" defaultValue={l.status} style={{ padding: "0.3rem" }}>
                      {Object.entries(statusLabel).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <button type="submit" style={{ padding: "0.3rem 0.6rem", cursor: "pointer" }}>OK</button>
                  </form>
                </td>
              </tr>
            );
          })}
          {!leads?.length && (
            <tr><td colSpan={6} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Leads erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <h2>Neuer Lead</h2>
      <form action={createLead} style={{ maxWidth: 560 }}>
        <div style={row}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div>
            <label style={labelStyle}>Firma</label>
            <input style={inputStyle} name="firma" />
          </div>
        </div>
        <div style={row}>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input style={inputStyle} name="email" type="email" />
          </div>
          <div>
            <label style={labelStyle}>Telefon</label>
            <input style={inputStyle} name="telefon" />
          </div>
        </div>
        <label style={labelStyle}>Interesse (Seminartyp)</label>
        <select style={inputStyle} name="interesse_seminartyp_id">
          <option value="">—</option>
          {seminartypen?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div style={row}>
          <div>
            <label style={labelStyle}>Quelle</label>
            <input style={inputStyle} name="quelle" placeholder="Empfehlung, Warteliste, ..." />
          </div>
          <div>
            <label style={labelStyle}>Wiedervorlage am</label>
            <input style={inputStyle} name="wiedervorlage_am" type="date" />
          </div>
        </div>
        <label style={labelStyle}>Grund / Ziel</label>
        <input style={inputStyle} name="grund" placeholder="z. B. Cross-Modul-Empfehlung: Organisation" />
        <label style={labelStyle}>Notizen</label>
        <input style={inputStyle} name="notizen" />
        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Lead anlegen
        </button>
      </form>
    </main>
  );
}
