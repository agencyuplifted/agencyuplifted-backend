export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createCommunityGruppe, addTeilnehmerZuCommunity } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };

export default async function CommunityPage() {
  const supabase = getSupabaseAdmin();
  const { data: gruppen } = await supabase.from("community_gruppen").select("*").order("erstellt_am", { ascending: false });
  const { data: mitglieder } = await supabase
    .from("teilnehmer_community_status")
    .select("*, teilnehmer(vorname, nachname, email), community_gruppen(name)")
    .order("erstellt_am", { ascending: false });
  const { data: teilnehmer } = await supabase.from("teilnehmer").select("*").order("nachname");

  return (
    <main>
      <h1>Community-Gruppen</h1>
      <p style={{ color: "#666" }}>Stammtische, Peer-Gruppen und andere Community-Formate außerhalb der Seminare.</p>

      <div style={card}>
        <h2>Gruppen</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Name</th>
              <th style={{ padding: "0.4rem" }}>Typ</th>
              <th style={{ padding: "0.4rem" }}>Zugangsweg</th>
            </tr>
          </thead>
          <tbody>
            {gruppen?.map((g) => (
              <tr key={g.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{g.name}</td>
                <td style={{ padding: "0.4rem" }}>{g.typ}</td>
                <td style={{ padding: "0.4rem" }}>{g.zugangsweg || "—"}</td>
              </tr>
            ))}
            {!gruppen?.length && (
              <tr><td colSpan={3} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Gruppen.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createCommunityGruppe} style={row}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div>
            <label style={labelStyle}>Typ</label>
            <select style={inputStyle} name="typ" defaultValue="stammtisch">
              <option value="stammtisch">Stammtisch</option>
              <option value="peer_gruppe">Peer-Gruppe</option>
              <option value="sonstiges">Sonstiges</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Zugangsweg (z. B. WhatsApp-Link, Slack)</label>
            <input style={inputStyle} name="zugangsweg" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Beschreibung</label>
            <input style={inputStyle} name="beschreibung" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Gruppe anlegen
            </button>
          </div>
        </form>
      </div>

      <div style={card}>
        <h2>Mitglieder</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Gruppe</th>
              <th style={{ padding: "0.4rem" }}>Teilnehmer</th>
              <th style={{ padding: "0.4rem" }}>Status</th>
              <th style={{ padding: "0.4rem" }}>Seit</th>
            </tr>
          </thead>
          <tbody>
            {mitglieder?.map((m: any) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{m.community_gruppen?.name}</td>
                <td style={{ padding: "0.4rem" }}>{m.teilnehmer?.vorname} {m.teilnehmer?.nachname}</td>
                <td style={{ padding: "0.4rem" }}>{m.status}</td>
                <td style={{ padding: "0.4rem" }}>{formatDatum(m.erstellt_am)}</td>
              </tr>
            ))}
            {!mitglieder?.length && (
              <tr><td colSpan={4} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Mitglieder zugeordnet.</td></tr>
            )}
          </tbody>
        </table>
        <form action={addTeilnehmerZuCommunity} style={row}>
          <div>
            <label style={labelStyle}>Gruppe</label>
            <select style={inputStyle} name="community_gruppe_id" required>
              {gruppen?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Teilnehmer</label>
            <select style={inputStyle} name="teilnehmer_id" required>
              {teilnehmer?.map((t) => (
                <option key={t.id} value={t.id}>{t.vorname} {t.nachname}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Teilnehmer zuordnen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
