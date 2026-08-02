export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createPreisstaffel, createUrgencyStufe, updateSeminartermin } from "@/lib/actions";
import { formatDatum, formatEUR } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };

function formatZeit(t: string | null) {
  return t ? t.slice(0, 5) + " Uhr" : "";
}

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name), trainer(name)")
    .eq("id", id)
    .single();

  const { data: seminartypen } = await supabase.from("seminartypen").select("*").order("name");
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");
  const { data: trainerListe } = await supabase.from("trainer").select("*").order("name");

  const { data: preisstaffeln } = await supabase
    .from("preisstaffeln")
    .select("*")
    .eq("seminartermin_id", id)
    .order("stichtag_tage_vor_start", { ascending: false });

  const { data: urgencyStufen } = await supabase
    .from("urgency_stufen")
    .select("*")
    .eq("seminartermin_id", id)
    .order("schwellenwert_prozent", { ascending: true });

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const titelAnzeige = termin.titel || termin.seminartypen?.name;
  const zeitraum = termin.datum_ende && termin.datum_ende !== termin.datum_start
    ? `${formatDatum(termin.datum_start)}${termin.zeit_start ? ", " + formatZeit(termin.zeit_start) : ""} bis ${formatDatum(termin.datum_ende)}${termin.zeit_ende ? ", " + formatZeit(termin.zeit_ende) : ""}`
    : `${formatDatum(termin.datum_start)}${termin.zeit_start ? ", " + formatZeit(termin.zeit_start) : ""}${termin.zeit_ende ? " – " + formatZeit(termin.zeit_ende) : ""}`;

  return (
    <main>
      <h1>{titelAnzeige}</h1>
      <p style={{ color: "#666" }}>
        {termin.seminartypen?.name} · {zeitraum}
        {termin.vorabend_anreise_datum && (
          <> · Vorabendanreise: {formatDatum(termin.vorabend_anreise_datum)}{termin.vorabend_anreise_uhrzeit ? ", " + formatZeit(termin.vorabend_anreise_uhrzeit) : ""}</>
        )}
        <br />
        {termin.veranstaltungsorte?.name || "—"} · {termin.format} · Trainer: {termin.trainer?.name || "—"} · Kapazität {termin.kapazitaet} (+{termin.ueberbuchungspuffer} intern) · Status {termin.status}
      </p>

      <div style={card}>
        <h2>Termin bearbeiten</h2>
        <form action={updateSeminartermin} style={{ maxWidth: 560 }}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <label style={labelStyle}>Titel des Seminars</label>
          <input style={inputStyle} name="titel" defaultValue={termin.titel || ""} placeholder="z. B. Preisfindung Intensiv – Herbst 2026" required />

          <div style={row}>
            <div>
              <label style={labelStyle}>Startdatum</label>
              <input style={inputStyle} name="datum_start" type="date" defaultValue={termin.datum_start} required />
            </div>
            <div>
              <label style={labelStyle}>Startuhrzeit</label>
              <input style={inputStyle} name="zeit_start" type="time" defaultValue={termin.zeit_start?.slice(0, 5) || ""} />
            </div>
          </div>
          <div style={row}>
            <div>
              <label style={labelStyle}>Enddatum</label>
              <input style={inputStyle} name="datum_ende" type="date" defaultValue={termin.datum_ende || termin.datum_start} />
            </div>
            <div>
              <label style={labelStyle}>Enduhrzeit</label>
              <input style={inputStyle} name="zeit_ende" type="time" defaultValue={termin.zeit_ende?.slice(0, 5) || ""} />
            </div>
          </div>

          <div style={row}>
            <div>
              <label style={labelStyle}>Vorabendanreise – Tag</label>
              <input style={inputStyle} name="vorabend_anreise_datum" type="date" defaultValue={termin.vorabend_anreise_datum || ""} />
            </div>
            <div>
              <label style={labelStyle}>Vorabendanreise – Uhrzeit</label>
              <input style={inputStyle} name="vorabend_anreise_uhrzeit" type="time" defaultValue={termin.vorabend_anreise_uhrzeit?.slice(0, 5) || ""} />
            </div>
          </div>

          <div style={row}>
            <div>
              <label style={labelStyle}>Format</label>
              <select style={inputStyle} name="format" defaultValue={termin.format}>
                <option value="praesenz">Präsenz</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ort</label>
              <select style={inputStyle} name="veranstaltungsort_id" defaultValue={termin.veranstaltungsort_id || ""}>
                <option value="">—</option>
                {orte?.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={labelStyle}>Trainer</label>
          <select style={inputStyle} name="trainer_id" defaultValue={termin.trainer_id || ""}>
            <option value="">—</option>
            {trainerListe?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div style={row}>
            <div>
              <label style={labelStyle}>Kapazität</label>
              <input style={inputStyle} name="kapazitaet" type="number" defaultValue={termin.kapazitaet} />
            </div>
            <div>
              <label style={labelStyle}>Mindestteilnehmerzahl</label>
              <input style={inputStyle} name="mindestteilnehmerzahl" type="number" defaultValue={termin.mindestteilnehmerzahl} />
            </div>
          </div>

          <div style={row}>
            <div>
              <label style={labelStyle}>Überbuchungspuffer (intern)</label>
              <input style={inputStyle} name="ueberbuchungspuffer" type="number" defaultValue={termin.ueberbuchungspuffer} />
            </div>
            <div>
              <label style={labelStyle}>Angezeigte Restplätze (manuell, Urgency)</label>
              <input style={inputStyle} name="angezeigte_restplaetze" type="number" defaultValue={termin.angezeigte_restplaetze ?? ""} placeholder="leer = kein Hinweis" />
            </div>
          </div>

          <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
            Änderungen speichern
          </button>
        </form>
      </div>

      <div style={card}>
        <h2>Preisstaffeln</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Name</th>
              <th style={{ padding: "0.4rem" }}>Stichtag (Tage vorher)</th>
              <th style={{ padding: "0.4rem" }}>Preis</th>
            </tr>
          </thead>
          <tbody>
            {preisstaffeln?.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{p.name}</td>
                <td style={{ padding: "0.4rem" }}>{p.stichtag_tage_vor_start}</td>
                <td style={{ padding: "0.4rem" }}>{formatEUR(Number(p.preis))}</td>
              </tr>
            ))}
            {!preisstaffeln?.length && (
              <tr><td colSpan={3} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Preisstaffeln.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createPreisstaffel} style={row}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label style={labelStyle}>Name (z. B. Super-Frühbucher)</label>
            <input style={inputStyle} name="name" required />
          </div>
          <div>
            <label style={labelStyle}>Stichtag (Tage vor Start)</label>
            <input style={inputStyle} name="stichtag_tage_vor_start" type="number" required />
          </div>
          <div>
            <label style={labelStyle}>Preis (€)</label>
            <input style={inputStyle} name="preis" type="number" step="0.01" required />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Staffel hinzufügen
            </button>
          </div>
        </form>
      </div>

      <div style={card}>
        <h2>Urgency-Stufen</h2>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Text, der ab dem jeweiligen Belegungs-Prozentsatz angezeigt wird (basierend auf "Angezeigte Restplätze"). Platzhalter <code>{"{remaining}"}</code> / <code>{"{total}"}</code> möglich.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Ab % belegt</th>
              <th style={{ padding: "0.4rem" }}>Text</th>
            </tr>
          </thead>
          <tbody>
            {urgencyStufen?.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{u.schwellenwert_prozent}%</td>
                <td style={{ padding: "0.4rem" }}>{u.text_vorlage}</td>
              </tr>
            ))}
            {!urgencyStufen?.length && (
              <tr><td colSpan={2} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Urgency-Stufen.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createUrgencyStufe} style={row}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label style={labelStyle}>Schwellenwert (% belegt)</label>
            <input style={inputStyle} name="schwellenwert_prozent" type="number" min={0} max={100} required />
          </div>
          <div>
            <label style={labelStyle}>Text</label>
            <input style={inputStyle} name="text_vorlage" placeholder="Nur noch wenige Plätze" required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" }}>
              Stufe hinzufügen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
