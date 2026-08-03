export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createCommunityGruppe, addTeilnehmerZuCommunity } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

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
      <p>Stammtische, Peer-Gruppen und andere Community-Formate außerhalb der Seminare.</p>

      <div className="au-card">
        <h2>Gruppen</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Zugangsweg</th>
            </tr>
          </thead>
          <tbody>
            {gruppen?.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>{g.typ}</td>
                <td>{g.zugangsweg || "—"}</td>
              </tr>
            ))}
            {!gruppen?.length && (
              <tr className="au-table-empty"><td colSpan={3}>Noch keine Gruppen.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createCommunityGruppe} className="au-row-2">
          <div>
            <label className="au-label">Name</label>
            <input className="au-input" name="name" required />
          </div>
          <div>
            <label className="au-label">Typ</label>
            <select className="au-select" name="typ" defaultValue="stammtisch">
              <option value="stammtisch">Stammtisch</option>
              <option value="peer_gruppe">Peer-Gruppe</option>
              <option value="sonstiges">Sonstiges</option>
            </select>
          </div>
          <div className="au-span-all">
            <label className="au-label">Zugangsweg (z. B. WhatsApp-Link, Slack)</label>
            <input className="au-input" name="zugangsweg" />
          </div>
          <div className="au-span-all">
            <label className="au-label">Beschreibung</label>
            <input className="au-input" name="beschreibung" />
          </div>
          <div className="au-span-all">
            <button type="submit" className="au-btn au-btn-primary">Gruppe anlegen</button>
          </div>
        </form>
      </div>

      <div className="au-card">
        <h2>Mitglieder</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Gruppe</th>
              <th>Teilnehmer</th>
              <th>Status</th>
              <th>Seit</th>
            </tr>
          </thead>
          <tbody>
            {mitglieder?.map((m: any) => (
              <tr key={m.id}>
                <td>{m.community_gruppen?.name}</td>
                <td>{m.teilnehmer?.vorname} {m.teilnehmer?.nachname}</td>
                <td>{m.status}</td>
                <td>{formatDatum(m.erstellt_am)}</td>
              </tr>
            ))}
            {!mitglieder?.length && (
              <tr className="au-table-empty"><td colSpan={4}>Noch keine Mitglieder zugeordnet.</td></tr>
            )}
          </tbody>
        </table>
        <form action={addTeilnehmerZuCommunity} className="au-row-2">
          <div>
            <label className="au-label">Gruppe</label>
            <select className="au-select" name="community_gruppe_id" required>
              {gruppen?.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="au-label">Teilnehmer</label>
            <select className="au-select" name="teilnehmer_id" required>
              {teilnehmer?.map((t) => (
                <option key={t.id} value={t.id}>{t.vorname} {t.nachname}</option>
              ))}
            </select>
          </div>
          <div className="au-span-all">
            <button type="submit" className="au-btn au-btn-primary">Teilnehmer zuordnen</button>
          </div>
        </form>
      </div>
    </main>
  );
}
