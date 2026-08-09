export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createMitarbeiter, deaktiviereMitarbeiter, setMitarbeiterZugang, setMitarbeiterBio } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

export default async function MitarbeiterPage() {
  const supabase = getSupabaseAdmin();
  const { data: mitarbeiter } = await supabase
    .from("mitarbeiter")
    .select("*")
    .order("aktiv", { ascending: false })
    .order("name");

  return (
    <main>
      <h1>Mitarbeiter</h1>
      <p>Referenten/Assistenz, die bei Seminaren dabei sind — getrennt von Teilnehmern erfasst und Terminen zuordenbar.</p>

      <table className="au-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>E-Mail</th>
            <th>Telefon</th>
            <th>Erfasst</th>
            <th>Status</th>
            <th>Login-Zugang</th>
            <th>Wissen-Autor</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {mitarbeiter?.map((m) => (
            <tr key={m.id} style={{ opacity: m.aktiv ? 1 : 0.5 }}>
              <td>{m.name}</td>
              <td>{m.email || "—"}</td>
              <td>{m.telefon || "—"}</td>
              <td>{formatDatum(m.erstellt_am)}</td>
              <td>{m.aktiv ? "aktiv" : "deaktiviert"}</td>
              <td>
                {m.passwort_hash ? (
                  <span className="au-badge au-badge-success">eingerichtet</span>
                ) : (
                  <span className="au-badge au-badge-warning">noch nicht eingerichtet</span>
                )}
                <details style={{ marginTop: "0.5rem" }}>
                  <summary style={{ color: "#0B1B33", fontSize: "0.8rem", fontWeight: 600 }}>
                    {m.passwort_hash ? "Passwort ändern" : "Zugang einrichten"}
                  </summary>
                  <form action={setMitarbeiterZugang} style={{ marginTop: "0.6rem", minWidth: 220 }}>
                    <input type="hidden" name="id" value={m.id} />
                    <label className="au-label">E-Mail (Login)</label>
                    <input className="au-input" name="email" type="email" defaultValue={m.email || ""} placeholder="fuer Login erforderlich" />
                    <label className="au-label">Neues Passwort</label>
                    <input className="au-input" name="neues_passwort" type="password" minLength={8} placeholder="mind. 8 Zeichen" />
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
                  </form>
                </details>
              </td>
              <td>
                {m.ist_wissen_autor && <span className="au-badge au-badge-success">aktiv</span>}
                <details style={{ marginTop: "0.5rem" }}>
                  <summary style={{ color: "#0B1B33", fontSize: "0.8rem", fontWeight: 600 }}>
                    Bio bearbeiten
                  </summary>
                  <form action={setMitarbeiterBio} style={{ marginTop: "0.6rem", minWidth: 260 }}>
                    <input type="hidden" name="id" value={m.id} />
                    <label className="au-label">
                      <input type="checkbox" name="ist_wissen_autor" defaultChecked={m.ist_wissen_autor} style={{ marginRight: "0.4rem" }} />
                      Autor auf /wissen (nur einer aktiv)
                    </label>
                    <label className="au-label">Rolle</label>
                    <input className="au-input" name="bio_rolle" defaultValue={m.bio_rolle || ""} placeholder="z. B. Gründer, AgencyUplifted" />
                    <label className="au-label">Bio-Text</label>
                    <textarea className="au-input" name="bio_text" defaultValue={m.bio_text || ""} rows={3} />
                    <label className="au-label">Foto-URL</label>
                    <input className="au-input" name="bio_foto_url" defaultValue={m.bio_foto_url || ""} placeholder="https://…" />
                    <label className="au-label">LinkedIn-URL</label>
                    <input className="au-input" name="bio_linkedin_url" defaultValue={m.bio_linkedin_url || ""} placeholder="https://www.linkedin.com/in/…" />
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm" style={{ marginTop: "0.4rem" }}>Speichern</button>
                  </form>
                </details>
              </td>
              <td>
                {m.aktiv && (
                  <form action={deaktiviereMitarbeiter}>
                    <input type="hidden" name="mitarbeiter_id" value={m.id} />
                    <button type="submit" className="au-btn au-btn-danger au-btn-sm">Deaktivieren</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {!mitarbeiter?.length && (
            <tr className="au-table-empty"><td colSpan={8}>Noch keine Mitarbeiter erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div className="au-card" style={{ maxWidth: 600 }}>
        <h2>Neuer Mitarbeiter</h2>
        <form action={createMitarbeiter} className="au-row-2">
          <div>
            <label className="au-label">Name</label>
            <input className="au-input" name="name" required />
          </div>
          <div>
            <label className="au-label">E-Mail</label>
            <input className="au-input" name="email" type="email" />
          </div>
          <div>
            <label className="au-label">Telefon</label>
            <input className="au-input" name="telefon" />
          </div>
          <div className="au-span-all">
            <button type="submit" className="au-btn au-btn-primary">Mitarbeiter anlegen</button>
          </div>
        </form>
      </div>
    </main>
  );
}
