export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createSeminartermin } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };
const row3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1rem 1.25rem", marginBottom: "1.25rem" };

export default async function NeuerTerminPage() {
  const supabase = getSupabaseAdmin();
  const { data: seminartypen } = await supabase.from("seminartypen").select("*").order("name");
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");
  const { data: trainerListe } = await supabase.from("trainer").select("*").order("name");

  return (
    <main>
      <h1>Neuer Seminartermin</h1>
      <form action={createSeminartermin} style={{ maxWidth: 560 }}>
        <label style={labelStyle}>Titel des Seminars</label>
        <input style={inputStyle} name="titel" placeholder="z. B. Preisfindung Intensiv – Herbst 2026" required />

        <label style={labelStyle}>Seminartyp (Kategorie)</label>
        <select style={inputStyle} name="seminartyp_id" required>
          {seminartypen?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div style={card}>
          <strong>Termin</strong>
          <div style={{ ...row, marginTop: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Startdatum</label>
              <input style={inputStyle} name="datum_start" type="date" required />
            </div>
            <div>
              <label style={labelStyle}>Startuhrzeit</label>
              <input style={inputStyle} name="zeit_start" type="time" defaultValue="09:00" />
            </div>
          </div>
          <div style={row}>
            <div>
              <label style={labelStyle}>Enddatum (leer = eintägig)</label>
              <input style={inputStyle} name="datum_ende" type="date" />
            </div>
            <div>
              <label style={labelStyle}>Enduhrzeit</label>
              <input style={inputStyle} name="zeit_ende" type="time" defaultValue="17:00" />
            </div>
          </div>
        </div>

        <div style={card}>
          <strong>Vorabendanreise (optional)</strong>
          <div style={{ ...row, marginTop: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Anreisetag</label>
              <input style={inputStyle} name="vorabend_anreise_datum" type="date" />
            </div>
            <div>
              <label style={labelStyle}>Uhrzeit</label>
              <input style={inputStyle} name="vorabend_anreise_uhrzeit" type="time" />
            </div>
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

        <label style={labelStyle}>Trainer</label>
        <select style={inputStyle} name="trainer_id">
          <option value="">—</option>
          {trainerListe?.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

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
