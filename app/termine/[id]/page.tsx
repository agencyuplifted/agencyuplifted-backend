export const dynamic = "force-dynamic";

import {
  createPreisstaffel,
  createUrgencyStufe,
  updateSeminartermin,
  createSeminarOption,
  createOptionFeature,
  duplicateSeminartermin,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };
const optionCard: React.CSSProperties = { border: "1px solid #cfd8e3", background: "#f7f9fc", padding: "1rem 1.25rem", marginBottom: "1rem" };
const btn: React.CSSProperties = { background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "transparent", color: "#102A4C", border: "1px solid #102A4C", padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.85rem" };

function formatZeit(t: string | null) {
  return t ? t.slice(0, 5) + " Uhr" : "";
}

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), trainer(name)")
    .eq("id", id)
    .single();

  const { data: seminartypen } = await supabase.from("seminartypen").select("*").order("name");
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");
  const { data: trainerListe } = await supabase.from("trainer").select("*").order("name");

  const { data: optionen } = await supabase
    .from("seminartermin_optionen")
    .select("*, seminartermin_options_features(*), preisstaffeln(*)")
    .eq("seminartermin_id", id)
    .order("sortierung", { ascending: true });

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{titelAnzeige}</h1>
          <p style={{ color: "#666" }}>
            {termin.seminartypen?.name} · {zeitraum}
            {termin.vorabend_anreise_datum && (
              <> · Vorabendanreise: {formatDatum(termin.vorabend_anreise_datum)}{termin.vorabend_anreise_uhrzeit ? ", " + formatZeit(termin.vorabend_anreise_uhrzeit) : ""}</>
            )}
            <br />
            {termin.veranstaltungsorte?.name || "—"}{termin.veranstaltungsorte?.ort ? `, ${termin.veranstaltungsorte.ort}` : ""}{termin.veranstaltungsorte?.nahe_grossstadt ? ` (bei ${termin.veranstaltungsorte.nahe_grossstadt})` : ""} · {termin.format} · Trainer: {termin.trainer?.name || "—"} · Kapazität {termin.kapazitaet} (+{termin.ueberbuchungspuffer} intern) · Status {termin.status}
            {(termin.zusatzteilnehmer_preis || termin.zusatzteilnehmer_rabatt_prozent) && (
              <><br />Zusätzlicher Teilnehmer: {termin.zusatzteilnehmer_preis ? formatEUR(Number(termin.zusatzteilnehmer_preis)) : `${termin.zusatzteilnehmer_rabatt_prozent}% Rabatt`}</>
            )}
          </p>
        </div>
        <form action={duplicateSeminartermin}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <button type="submit" style={btnSecondary} title="Legt eine Kopie dieses Termins inkl. Optionen, Featurelisten, Preisstaffeln und Urgency-Stufen an">
            Termin duplizieren
          </button>
        </form>
      </div>

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
                  <option key={o.id} value={o.id}>
                    {o.name}{o.ort ? ` – ${o.ort}` : ""}{o.nahe_grossstadt ? ` (bei ${o.nahe_grossstadt})` : ""}
                  </option>
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

          <div style={card}>
            <strong>Zusätzlicher Teilnehmer (Gruppenpreis)</strong>
            <p style={{ color: "#666", fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>
              Preis für die 2. (und weitere) Person derselben Firma. Entweder Festpreis ODER Rabatt in % angeben, nicht beides.
            </p>
            <div style={row}>
              <div>
                <label style={labelStyle}>Festpreis pro weiterer Person (€)</label>
                <input style={inputStyle} name="zusatzteilnehmer_preis" type="number" step="0.01" defaultValue={termin.zusatzteilnehmer_preis ?? ""} placeholder="z. B. 990" />
              </div>
              <div>
                <label style={labelStyle}>oder Rabatt (%)</label>
                <input style={inputStyle} name="zusatzteilnehmer_rabatt_prozent" type="number" step="0.1" defaultValue={termin.zusatzteilnehmer_rabatt_prozent ?? ""} placeholder="z. B. 15" />
              </div>
            </div>
          </div>

          <button type="submit" style={btn}>
            Änderungen speichern
          </button>
        </form>
      </div>

      <div style={card}>
        <h2>Optionen (z. B. A / B / C)</h2>
        <p style={{ color: "#666", fontSize: "0.9rem" }}>
          Jede Option ist ein eigenes buchbares Paket mit eigenem Titel, Beschreibung, Featureliste und eigenen Preisstufen (Frühbucher/Normalpreis). Ein Seminar mit nur einer Buchungsvariante braucht nur eine Option.
        </p>

        {optionen?.map((opt: any) => (
          <div key={opt.id} style={optionCard}>
            <strong>{opt.titel}</strong>
            {opt.beschreibung && <p style={{ color: "#444", fontSize: "0.9rem", margin: "0.35rem 0" }}>{opt.beschreibung}</p>}

            <div style={{ marginTop: "0.75rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#666" }}>Features</span>
              <ul style={{ margin: "0.35rem 0 0.5rem", paddingLeft: "1.2rem" }}>
                {opt.seminartermin_options_features
                  ?.sort((a: any, b: any) => a.sortierung - b.sortierung)
                  .map((f: any) => (
                    <li key={f.id} style={{ fontSize: "0.9rem" }}>{f.text}</li>
                  ))}
                {!opt.seminartermin_options_features?.length && (
                  <li style={{ fontSize: "0.9rem", color: "#888", listStyle: "none", marginLeft: "-1.2rem" }}>Noch keine Features.</li>
                )}
              </ul>
              <form action={createOptionFeature} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} name="text" placeholder="z. B. Einzelcoaching inklusive" required />
                <button type="submit" style={btnSecondary}>+ Feature</button>
              </form>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#666" }}>Preisstaffeln</span>
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "0.35rem 0 0.5rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                    <th style={{ padding: "0.3rem" }}>Name</th>
                    <th style={{ padding: "0.3rem" }}>Stichtag (Tage vorher)</th>
                    <th style={{ padding: "0.3rem" }}>Preis</th>
                  </tr>
                </thead>
                <tbody>
                  {opt.preisstaffeln
                    ?.sort((a: any, b: any) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start)
                    .map((p: any) => (
                      <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "0.3rem" }}>{p.name}</td>
                        <td style={{ padding: "0.3rem" }}>{p.stichtag_tage_vor_start}</td>
                        <td style={{ padding: "0.3rem" }}>{formatEUR(Number(p.preis))}</td>
                      </tr>
                    ))}
                  {!opt.preisstaffeln?.length && (
                    <tr><td colSpan={3} style={{ padding: "0.3rem", color: "#888" }}>Noch keine Preisstaffeln.</td></tr>
                  )}
                </tbody>
              </table>
              <form action={createPreisstaffel} style={row}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
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
                  <button type="submit" style={btnSecondary}>+ Staffel</button>
                </div>
              </form>
            </div>
          </div>
        ))}
        {!optionen?.length && (
          <p style={{ color: "#888" }}>Noch keine Optionen angelegt.</p>
        )}

        <div style={{ ...card, background: "#fff" }}>
          <strong>Neue Option hinzufügen</strong>
          <form action={createSeminarOption} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <div style={row}>
              <div>
                <label style={labelStyle}>Titel (z. B. "Option A – Basis")</label>
                <input style={inputStyle} name="titel" required />
              </div>
              <div>
                <label style={labelStyle}>Sortierung (0 = zuerst)</label>
                <input style={inputStyle} name="sortierung" type="number" defaultValue={(optionen?.length || 0)} />
              </div>
            </div>
            <label style={labelStyle}>Beschreibung</label>
            <textarea style={{ ...inputStyle, minHeight: "4rem" }} name="beschreibung" placeholder="Kurze Beschreibung dieser Option" />
            <button type="submit" style={btn}>Option anlegen</button>
          </form>
        </div>
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
            <button type="submit" style={btn}>
              Stufe hinzufügen
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
