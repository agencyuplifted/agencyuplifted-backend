export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createSeminartermin } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

export default async function NeuerTerminPage() {
  const supabase = getSupabaseAdmin();
  const { data: seminartypen } = await supabase.from("seminartypen").select("*").order("name");
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");

  return (
    <main>
      <h1>Neuer Seminartermin</h1>
      <form action={createSeminartermin} style={{ maxWidth: 560 }}>
        <label style={labelStyle}>Seminartyp</label>
        <select style={inputStyle} name="seminartyp_id" required>
          {seminartypen?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div style={row}>
          <div>
            <label style={labelStyle}>Datum</label>
            <input style={inputStyle} name="datum_start" type="date" required />
          </div>
          <div>
            <label style={labelStyle}>Dauer (Tage)</label>
            <input style={inputStyle} name="dauer_tage" type="number" defaultValue={1} min={1} />
          </div>
        </div>

        <div style={row}>
          <div>
            <label style={labelStyle}>Format</label>
            <select style={inputStyle} name="format" defaultValue="praesenz">
              <option value="praesenz">Präsenz</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Ort</label>
            <select style={inputStyle} name="veranstaltungsort_id">
              <option value="">—</option>
              {orte?.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={row}>
          <div>
            <label style={labelStyle}>Kapazität</label>
            <input style={inputStyle} name="kapazitaet" type="number" defaultValue={12} />
          </div>
          <div>
            <label style={labelStyle}>Mindestteilnehmerzahl</label>
            <input style={inputStyle} name="mindestteilnehmerzahl" type="number" defaultValue={5} />
          </div>
        </div>

        <div style={row}>
          <div>
            <label style={labelStyle}>Überbuchungspuffer (intern)</label>
            <input style={inputStyle} name="ueberbuchungspuffer" type="number" defaultValue={3} />
          </div>
          <div>
            <label style={labelStyle}>Angezeigte Restplätze (manuell, Urgency)</label>
            <input style={inputStyle} name="angezeigte_restplaetze" type="number" placeholder="leer = kein Hinweis" />
          </div>
        </div>

        <label style={labelStyle}>Preis (Normalpreis, €)</label>
        <input style={inputStyle} name="preis" type="number" step="0.01" placeholder="z. B. 1490" />

        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Termin anlegen
        </button>
      </form>
    </main>
  );
}
