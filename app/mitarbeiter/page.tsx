export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createMitarbeiter, deaktiviereMitarbeiter, setMitarbeiterZugang } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

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
      <p style={{ color: "#666" }}>
        Referenten/Assistenz, die bei Seminaren dabei sind — getrennt von Teilnehmern erfasst und Terminen zuordenbar.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>E-Mail</th>
            <th style={{ padding: "0.5rem" }}>Telefon</th>
            <th style={{ padding: "0.5rem" }}>Erfasst</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
            <th style={{ padding: "0.5rem" }}>Login-Zugang</th>
            <th style={{ padding: "0.5rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {mitarbeiter?.map((m) => (
            <tr key={m.id} style={{ borderBottom: "1px solid #e2e2e2", opacity: m.aktiv ? 1 : 0.5, verticalAlign: "top" }}>
              <td style={{ padding: "0.5rem" }}>{m.name}</td>
              <td style={{ padding: "0.5rem" }}>{m.email || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{m.telefon || "—"}</td>
              <td style={{ padding: "0.5rem" }}>{formatDatum(m.erstellt_am)}</td>
              <td style={{ padding: "0.5rem" }}>{m.aktiv ? "aktiv" : "deaktiviert"}</td>
              <td style={{ padding: "0.5rem" }}>
                {m.passwort_hash ? (
                  <span style={{ color: "#245c24" }}>eingerichtet</span>
                ) : (
                  <span style={{ color: "#a15c00" }}>noch nicht eingerichtet</span>
                )}
                <details style={{ marginTop: "0.4rem" }}>
                  <summary style={{ cursor: "pointer", color: "#102A4C", fontSize: "0.8rem" }}>
                    {m.passwort_hash ? "Passwort ändern" : "Zugang einrichten"}
                  </summary>
                  <form action={setMitarbeiterZugang} style={{ marginTop: "0.5rem", minWidth: 220 }}>
                    <input type="hidden" name="id" value={m.id} />
                    <label style={labelStyle}>E-Mail (Login)</label>
                    <input style={inputStyle} name="email" type="email" defaultValue={m.email || ""} placeholder="fuer Login erforderlich" />
                    <label style={labelStyle}>Neues Passwort</label>
                    <input style={inputStyle} name="neues_passwort" type="password" minLength={8} placeholder="mind. 8 Zeichen" />
                    <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.4rem 0.8rem", border: "none", cursor: "pointer", fontSize: "0.8rem" }}>
                      Speichern
                    </button>
                  </form>
                </details>
              </td>
              <td style={{ padding: "0.5rem" }}>
                {m.aktiv && (
                  <form action={deaktiviereMitarbeiter}>
                    <input type="hidden" name="mitarbeiter_id" value={m.id} />
                    <button type="submit" style={{ background: "transparent", color: "#8a1f1f", border: "1px solid #8a1f1f", padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.8rem" }}>
                      Deaktivieren
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {!mitarbeiter?.length && (
            <tr><td colSpan={7} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Mitarbeiter erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div style={{ border: "1px solid #e2e2e2", padding: "1.25rem", maxWidth: 560 }}>
        <h2>Neuer Mitarbeiter</h2>
        <form action={createMitarbeiter} style={row}>
          <div>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div>
            <label style={labelStyle}>E-Mail</label>
            <input style={inputStyle} name="email" type="email" />
          </div>
          <div>
            <label style={labelStyle}>Telefon</label>
            <input style={inputStyle} name="telefon" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Mitarbeiter anlegen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
