export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createLead, updateLeadStatus } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

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
      <p>Personen mit Interesse, die noch angerufen/erinnert werden sollen — getrennt von echten Buchungen.</p>

      <table className="au-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Firma</th>
            <th>Interesse</th>
            <th>Grund</th>
            <th>Wiedervorlage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {leads?.map((l: any) => {
            const faellig = l.wiedervorlage_am && l.wiedervorlage_am <= heute && l.status !== "gebucht" && l.status !== "kein_interesse";
            return (
              <tr key={l.id} style={faellig ? { background: "#fdf3e2" } : undefined}>
                <td>{l.name}{faellig ? " ⚠️" : ""}</td>
                <td>{l.firma || "—"}</td>
                <td>{l.seminartypen?.name || "—"}</td>
                <td>{l.grund || "—"}</td>
                <td>{l.wiedervorlage_am ? formatDatum(l.wiedervorlage_am) : "—"}</td>
                <td>
                  <form action={updateLeadStatus} style={{ display: "flex", gap: "0.4rem" }}>
                    <input type="hidden" name="lead_id" value={l.id} />
                    <select name="status" defaultValue={l.status} className="au-select" style={{ marginBottom: 0, width: "auto" }}>
                      {Object.entries(statusLabel).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">OK</button>
                  </form>
                </td>
              </tr>
            );
          })}
          {!leads?.length && (
            <tr className="au-table-empty"><td colSpan={6}>Noch keine Leads erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div className="au-card" style={{ maxWidth: 600 }}>
        <h2>Neuer Lead</h2>
        <form action={createLead}>
          <div className="au-row-2">
            <div>
              <label className="au-label">Name</label>
              <input className="au-input" name="name" required />
            </div>
            <div>
              <label className="au-label">Firma</label>
              <input className="au-input" name="firma" />
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">E-Mail</label>
              <input className="au-input" name="email" type="email" />
            </div>
            <div>
              <label className="au-label">Telefon</label>
              <input className="au-input" name="telefon" />
            </div>
          </div>
          <label className="au-label">Interesse (Seminartyp)</label>
          <select className="au-select" name="interesse_seminartyp_id">
            <option value="">—</option>
            {seminartypen?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="au-row-2">
            <div>
              <label className="au-label">Quelle</label>
              <input className="au-input" name="quelle" placeholder="Empfehlung, Warteliste, ..." />
            </div>
            <div>
              <label className="au-label">Wiedervorlage am</label>
              <input className="au-input" name="wiedervorlage_am" type="date" />
            </div>
          </div>
          <label className="au-label">Grund / Ziel</label>
          <input className="au-input" name="grund" placeholder="z. B. Cross-Modul-Empfehlung: Organisation" />
          <label className="au-label">Notizen</label>
          <input className="au-input" name="notizen" />
          <button type="submit" className="au-btn au-btn-primary">Lead anlegen</button>
        </form>
      </div>
    </main>
  );
}
