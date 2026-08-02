export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createBuchung } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

export default async function NeueBuchungPage() {
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase.from("teilnehmer").select("*").order("nachname");
  const { data: organisationen } = await supabase.from("organisationen").select("*").order("name");
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .order("datum_start");

  return (
    <main>
      <h1>Neue Buchung</h1>
      <p style={{ color: "#666" }}>Erfasst eine Buchung, wie sie z. B. per E-Mail reinkommt — ersetzt die Doppelerfassung in Pipedrive/FastBill.</p>
      <form action={createBuchung} style={{ maxWidth: 560 }}>
        <label style={labelStyle}>Rechnungsempfänger — Organisation (leer lassen, wenn Selbständige/r ohne Firma)</label>
        <select style={inputStyle} name="organisation_id">
          <option value="">— keine Organisation, direkt an Teilnehmer —</option>
          {organisationen?.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        <label style={labelStyle}>Teilnehmer</label>
        <select style={inputStyle} name="teilnehmer_id" required>
          {teilnehmer?.map((t) => (
            <option key={t.id} value={t.id}>{t.vorname} {t.nachname} ({t.email})</option>
          ))}
        </select>

        <label style={labelStyle}>Seminartermin</label>
        <select style={inputStyle} name="seminartermin_id" required>
          {termine?.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.seminartypen?.name} – {formatDatum(t.datum_start)}
            </option>
          ))}
        </select>

        <div style={row}>
          <div>
            <label style={labelStyle}>Listenpreis (€)</label>
            <input style={inputStyle} name="listenpreis" type="number" step="0.01" required />
          </div>
          <div>
            <label style={labelStyle}>Rabatt (€, optional)</label>
            <input style={inputStyle} name="rabatt_betrag" type="number" step="0.01" defaultValue={0} />
          </div>
        </div>

        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Buchung anlegen
        </button>
      </form>
    </main>
  );
}
