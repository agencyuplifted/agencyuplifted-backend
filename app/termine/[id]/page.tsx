export const dynamic = "force-dynamic";

import {
  createPreisstaffel,
  createUrgencyStufe,
  previewSeminarterminUpdate,
  createSeminarOption,
  createOptionFeature,
  duplicateSeminartermin,
  duplicateSeminarOption,
  updateOptionBadge,
  updateSeminarOption,
  deleteSeminarOption,
  deleteOptionFeature,
  deletePreisstaffel,
  addMitarbeiterZuTermin,
  removeMitarbeiterVonTermin,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import { renderFett } from "@/lib/richtext";
import { FettTextarea, FettInput } from "../BoldEditor";
import Link from "next/link";

const badgeLabel: Record<string, string> = {
  empfohlen: "Empfohlen",
  meistgekauft: "Meistgekauft",
};

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

  const { data: mitarbeiterListe } = await supabase
    .from("mitarbeiter")
    .select("*")
    .eq("aktiv", true)
    .order("name");

  const { data: terminMitarbeiter } = await supabase
    .from("seminartermin_mitarbeiter")
    .select("*, mitarbeiter(name)")
    .eq("seminartermin_id", id)
    .order("erstellt_am", { ascending: true });

  const { data: protokoll } = await supabase
    .from("aenderungsprotokoll")
    .select("*")
    .eq("bezug_typ", "seminartermin")
    .eq("bezug_id", id)
    .order("erstellt_am", { ascending: false });

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
          <p style={{ color: "var(--color-text-muted)" }}>
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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/termine/${id}/teilnehmerliste`} className="au-btn au-btn-secondary">
            Teilnehmerliste (Hotel)
          </Link>
          <form action={duplicateSeminartermin}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-secondary" title="Legt eine Kopie dieses Termins inkl. Optionen, Featurelisten, Preisstaffeln und Urgency-Stufen an">
              Termin duplizieren
            </button>
          </form>
        </div>
      </div>

      <div className="au-card">
        <h2>Termin bearbeiten</h2>
        <form action={previewSeminarterminUpdate} style={{ maxWidth: 560 }}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <label className="au-label">Titel des Seminars</label>
          <input className="au-input" name="titel" defaultValue={termin.titel || ""} placeholder="z. B. Preisfindung Intensiv – Herbst 2026" required />

          <div className="au-row-2">
            <div>
              <label className="au-label">Startdatum</label>
              <input className="au-input" name="datum_start" type="date" defaultValue={termin.datum_start} required />
            </div>
            <div>
              <label className="au-label">Startuhrzeit</label>
              <input className="au-input" name="zeit_start" type="time" defaultValue={termin.zeit_start?.slice(0, 5) || ""} />
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Enddatum</label>
              <input className="au-input" name="datum_ende" type="date" defaultValue={termin.datum_ende || termin.datum_start} />
            </div>
            <div>
              <label className="au-label">Enduhrzeit</label>
              <input className="au-input" name="zeit_ende" type="time" defaultValue={termin.zeit_ende?.slice(0, 5) || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Vorabendanreise – Tag</label>
              <input className="au-input" name="vorabend_anreise_datum" type="date" defaultValue={termin.vorabend_anreise_datum || ""} />
            </div>
            <div>
              <label className="au-label">Vorabendanreise – Uhrzeit</label>
              <input className="au-input" name="vorabend_anreise_uhrzeit" type="time" defaultValue={termin.vorabend_anreise_uhrzeit?.slice(0, 5) || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Format</label>
              <select className="au-input" name="format" defaultValue={termin.format}>
                <option value="praesenz">Präsenz</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="au-label">Ort</label>
              <select className="au-input" name="veranstaltungsort_id" defaultValue={termin.veranstaltungsort_id || ""}>
                <option value="">—</option>
                {orte?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.ort ? ` – ${o.ort}` : ""}{o.nahe_grossstadt ? ` (bei ${o.nahe_grossstadt})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="au-label">Trainer</label>
          <select className="au-input" name="trainer_id" defaultValue={termin.trainer_id || ""}>
            <option value="">—</option>
            {trainerListe?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className="au-row-2">
            <div>
              <label className="au-label">Kapazität</label>
              <input className="au-input" name="kapazitaet" type="number" defaultValue={termin.kapazitaet} />
            </div>
            <div>
              <label className="au-label">Mindestteilnehmerzahl</label>
              <input className="au-input" name="mindestteilnehmerzahl" type="number" defaultValue={termin.mindestteilnehmerzahl} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Überbuchungspuffer (intern)</label>
              <input className="au-input" name="ueberbuchungspuffer" type="number" defaultValue={termin.ueberbuchungspuffer} />
            </div>
            <div>
              <label className="au-label">Angezeigte Restplätze (manuell, Urgency)</label>
              <input className="au-input" name="angezeigte_restplaetze" type="number" defaultValue={termin.angezeigte_restplaetze ?? ""} placeholder="leer = kein Hinweis" />
            </div>
          </div>

          <div className="au-card">
            <strong>Zusätzlicher Teilnehmer (Gruppenpreis)</strong>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>
              Preis für die 2. (und weitere) Person derselben Firma. Entweder Festpreis ODER Rabatt in % angeben, nicht beides.
            </p>
            <div className="au-row-2">
              <div>
                <label className="au-label">Festpreis pro weiterer Person (€)</label>
                <input className="au-input" name="zusatzteilnehmer_preis" type="number" step="0.01" defaultValue={termin.zusatzteilnehmer_preis ?? ""} placeholder="z. B. 990" />
              </div>
              <div>
                <label className="au-label">oder Rabatt (%)</label>
                <input className="au-input" name="zusatzteilnehmer_rabatt_prozent" type="number" step="0.1" defaultValue={termin.zusatzteilnehmer_rabatt_prozent ?? ""} placeholder="z. B. 15" />
              </div>
            </div>
          </div>

          <button type="submit" className="au-btn au-btn-primary">
            Änderungen speichern
          </button>
        </form>
      </div>

      <div className="au-card">
        <h2>Mitarbeiter beim Termin</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Referenten/Assistenz, die bei diesem Termin dabei sind — nicht als Teilnehmer, sondern als Personal erfasst.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terminMitarbeiter?.map((tm: any) => (
              <tr key={tm.id}>
                <td>{tm.mitarbeiter?.name}</td>
                <td>{tm.rolle}</td>
                <td>
                  <form action={removeMitarbeiterVonTermin} style={{ display: "inline" }}>
                    <input type="hidden" name="zuordnung_id" value={tm.id} />
                    <input type="hidden" name="seminartermin_id" value={id} />
                    <button type="submit" className="au-link-danger">entfernen</button>
                  </form>
                </td>
              </tr>
            ))}
            {!terminMitarbeiter?.length && (
              <tr><td colSpan={3} style={{ color: "var(--color-text-faint)" }}>Noch keine Mitarbeiter zugeordnet.</td></tr>
            )}
          </tbody>
        </table>
        <form action={addMitarbeiterZuTermin} className="au-row-2">
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label className="au-label">Mitarbeiter</label>
            <select className="au-input" name="mitarbeiter_id" required>
              <option value="">— wählen —</option>
              {mitarbeiterListe?.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="au-label">Rolle</label>
            <select className="au-input" name="rolle" defaultValue="Referent">
              <option value="Referent">Referent</option>
              <option value="Assistenz">Assistenz</option>
              <option value="Co-Trainer">Co-Trainer</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="au-btn au-btn-primary">Mitarbeiter zuordnen</button>
          </div>
        </form>
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Fehlt jemand in der Liste? Unter <a href="/mitarbeiter" >Mitarbeiter</a> neu anlegen.
        </p>
      </div>

      <div className="au-card">
        <h2>Optionen (z. B. A / B / C)</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Jede Option ist ein eigenes buchbares Paket mit eigenem Titel, Beschreibung, Featureliste und eigenen Preisstufen (Frühbucher/Normalpreis). Ein Seminar mit nur einer Buchungsvariante braucht nur eine Option.
        </p>

        {optionen?.map((opt: any) => (
          <div key={opt.id} className="au-subcard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{opt.titel}</strong>
                {opt.badge && <span className="au-badge au-badge-gold">{badgeLabel[opt.badge] || opt.badge}</span>}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <form action={duplicateSeminarOption}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <button type="submit" className="au-btn au-btn-secondary" title="Legt eine Kopie dieser Option (inkl. Features und Preisstaffeln) an, z. B. als Basis für Option B">
                    Option duplizieren
                  </button>
                </form>
              </div>
            </div>
            {opt.beschreibung && <p style={{ color: "#444", fontSize: "0.9rem", margin: "0.35rem 0" }}>{renderFett(opt.beschreibung)}</p>}

            <details style={{ margin: "0.5rem 0" }}>
              <summary style={{ cursor: "pointer", color: "#102A4C", fontSize: "0.85rem", fontWeight: 600 }}>Option bearbeiten</summary>
              <form action={updateSeminarOption} style={{ marginTop: "0.6rem", maxWidth: 480 }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <label className="au-label">Titel</label>
                <input className="au-input" name="titel" defaultValue={opt.titel} required />
                <label className="au-label">Beschreibung</label>
                <FettTextarea name="beschreibung" defaultValue={opt.beschreibung || ""} placeholder="Kurze Beschreibung dieser Option" />
                <label className="au-label">Sortierung (0 = zuerst)</label>
                <input className="au-input" name="sortierung" type="number" defaultValue={opt.sortierung ?? 0} />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="au-btn au-btn-secondary">Speichern</button>
                </div>
              </form>
              <form action={deleteSeminarOption} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <button type="submit" className="au-btn au-btn-danger">Option löschen</button>
              </form>
            </details>

            <form action={updateOptionBadge} style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" }}>
              <input type="hidden" name="seminartermin_option_id" value={opt.id} />
              <input type="hidden" name="seminartermin_id" value={id} />
              <label className="au-label" style={{ marginBottom: 0 }}>Kennzeichnung</label>
              <select name="badge" defaultValue={opt.badge || ""} style={{ padding: "0.35rem" }}>
                <option value="">Keine</option>
                <option value="empfohlen">Empfohlen</option>
                <option value="meistgekauft">Meistgekauft</option>
              </select>
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
            </form>

            <div style={{ marginTop: "0.75rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Features</span>
              <ul style={{ margin: "0.35rem 0 0.5rem", paddingLeft: "1.2rem" }}>
                {opt.seminartermin_options_features
                  ?.sort((a: any, b: any) => a.sortierung - b.sortierung)
                  .map((f: any) => (
                    <li key={f.id} style={{ fontSize: "0.9rem" }}>
                      {renderFett(f.text)}
                      <form action={deleteOptionFeature} style={{ display: "inline" }}>
                        <input type="hidden" name="feature_id" value={f.id} />
                        <input type="hidden" name="seminartermin_id" value={id} />
                        <button type="submit" className="au-link-danger">entfernen</button>
                      </form>
                    </li>
                  ))}
                {!opt.seminartermin_options_features?.length && (
                  <li style={{ fontSize: "0.9rem", color: "var(--color-text-faint)", listStyle: "none", marginLeft: "-1.2rem" }}>Noch keine Features.</li>
                )}
              </ul>
              <form action={createOptionFeature} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <FettInput name="text" placeholder="z. B. Einzelcoaching inklusive" required />
                <button type="submit" className="au-btn au-btn-secondary">+ Feature</button>
              </form>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Preisstaffeln (Nettopreise, zzgl. gesetzlicher USt.)</span>
              <table className="au-table" style={{ margin: "0.35rem 0 0.5rem" }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Stichtag (Tage vorher)</th>
                    <th>Preis (netto)</th>
                    <th>Preis (brutto, 19% USt.)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {opt.preisstaffeln
                    ?.sort((a: any, b: any) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start)
                    .map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.stichtag_tage_vor_start}</td>
                        <td>{formatEUR(Number(p.preis))}</td>
                        <td style={{ color: "var(--color-text-muted)" }}>{formatEURBrutto(Number(p.preis))}</td>
                        <td>
                          <form action={deletePreisstaffel}>
                            <input type="hidden" name="preisstaffel_id" value={p.id} />
                            <input type="hidden" name="seminartermin_id" value={id} />
                            <button type="submit" className="au-link-danger">entfernen</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  {!opt.preisstaffeln?.length && (
                    <tr><td colSpan={5} style={{ color: "var(--color-text-faint)" }}>Noch keine Preisstaffeln.</td></tr>
                  )}
                </tbody>
              </table>
              <form action={createPreisstaffel} className="au-row-2">
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <div>
                  <label className="au-label">Name (z. B. Super-Frühbucher)</label>
                  <input className="au-input" name="name" required />
                </div>
                <div>
                  <label className="au-label">Stichtag (Tage vor Start)</label>
                  <input className="au-input" name="stichtag_tage_vor_start" type="number" required />
                </div>
                <div>
                  <label className="au-label">Preis (€, netto zzgl. USt.)</label>
                  <input className="au-input" name="preis" type="number" step="0.01" required />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button type="submit" className="au-btn au-btn-secondary">+ Staffel</button>
                </div>
              </form>
            </div>
          </div>
        ))}
        {!optionen?.length && (
          <p style={{ color: "var(--color-text-faint)" }}>Noch keine Optionen angelegt.</p>
        )}

        <div className="au-card">
          <strong>Neue Option hinzufügen</strong>
          <form action={createSeminarOption} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <div className="au-row-2">
              <div>
                <label className="au-label">Titel (z. B. "Option A – Basis")</label>
                <input className="au-input" name="titel" required />
              </div>
              <div>
                <label className="au-label">Sortierung (0 = zuerst)</label>
                <input className="au-input" name="sortierung" type="number" defaultValue={(optionen?.length || 0)} />
              </div>
            </div>
            <label className="au-label">Kennzeichnung</label>
            <select className="au-input" name="badge" defaultValue="">
              <option value="">Keine</option>
              <option value="empfohlen">Empfohlen</option>
              <option value="meistgekauft">Meistgekauft</option>
            </select>
            <label className="au-label">Beschreibung</label>
            <FettTextarea name="beschreibung" placeholder="Kurze Beschreibung dieser Option" />
            <button type="submit" className="au-btn au-btn-primary">Option anlegen</button>
          </form>
        </div>
      </div>

      <div className="au-card">
        <h2>Urgency-Stufen</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Text, der ab dem jeweiligen Belegungs-Prozentsatz angezeigt wird (basierend auf "Angezeigte Restplätze"). Platzhalter <code>{"{remaining}"}</code> / <code>{"{total}"}</code> möglich.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Ab % belegt</th>
              <th>Text</th>
            </tr>
          </thead>
          <tbody>
            {urgencyStufen?.map((u) => (
              <tr key={u.id}>
                <td>{u.schwellenwert_prozent}%</td>
                <td>{u.text_vorlage}</td>
              </tr>
            ))}
            {!urgencyStufen?.length && (
              <tr><td colSpan={2} style={{ color: "var(--color-text-faint)" }}>Noch keine Urgency-Stufen.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createUrgencyStufe} className="au-row-2">
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label className="au-label">Schwellenwert (% belegt)</label>
            <input className="au-input" name="schwellenwert_prozent" type="number" min={0} max={100} required />
          </div>
          <div>
            <label className="au-label">Text</label>
            <input className="au-input" name="text_vorlage" placeholder="Nur noch wenige Plätze" required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="au-btn au-btn-primary">
              Stufe hinzufügen
            </button>
          </div>
        </form>
      </div>

      <div className="au-card">
        <h2>Änderungsprotokoll</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ereignis</th>
              <th>Beschreibung</th>
              <th>Bearbeiter</th>
            </tr>
          </thead>
          <tbody>
            {protokoll?.map((e) => (
              <tr key={e.id}>
                <td>{formatDatum(e.erstellt_am)}</td>
                <td>{e.ereignis}</td>
                <td>{e.beschreibung}</td>
                <td>{e.bearbeiter || "—"}</td>
              </tr>
            ))}
            {!protokoll?.length && (
              <tr><td colSpan={4} style={{ color: "var(--color-text-faint)" }}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
