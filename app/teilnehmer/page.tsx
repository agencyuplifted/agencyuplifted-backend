export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createTeilnehmer } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };

export default async function TeilnehmerPage() {
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase
    .from("teilnehmer")
    .select("*")
    .order("erstellt_am", { ascending: false });

  return (
    <main>
      <h1>Teilnehmer</h1>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>E-Mail</th>
            <th style={{ padding: "0.5rem" }}>Telefon</th>
          </tr>
        </thead>
        <tbody>
          {teilnehmer?.map((t) => (
            <tr key={t.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}>{t.vorname} {t.nachname}</td>
              <td style={{ padding: "0.5rem" }}>{t.email}</td>
              <td style={{ padding: "0.5rem" }}>{t.telefon || "—"}</td>
            </tr>
          ))}
          {!teilnehmer?.length && (
            <tr><td colSpan={3} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Teilnehmer erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <h2>Neuer Teilnehmer</h2>
      <form action={createTeilnehmer} style={{ maxWidth: 420 }}>
        <label style={labelStyle}>Vorname</label>
        <input style={inputStyle} name="vorname" required />
        <label style={labelStyle}>Nachname</label>
        <input style={inputStyle} name="nachname" required />
        <label style={labelStyle}>E-Mail</label>
        <input style={inputStyle} name="email" type="email" required />
        <label style={labelStyle}>Telefon</label>
        <input style={inputStyle} name="telefon" />
        <label style={labelStyle}>LinkedIn-URL</label>
        <input style={inputStyle} name="linkedin_url" />
        <label style={labelStyle}>Ernährung / Sonderwünsche</label>
        <input style={inputStyle} name="ernaehrung" />
        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Anlegen
        </button>
      </form>
    </main>
  );
}
