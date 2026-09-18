export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  speichereEventReihe,
  archiviereEventReihe,
  speichereEventAusgabe,
  legeNaechsteEventAusgabeAn,
  archiviereEventAusgabe,
  speichereKontakt,
  verknuepfeKontaktMitAusgabe,
  entferneKontaktVonAusgabe,
  setzeKontaktStatus,
  speichereAufgabe,
  verknuepfeThemaMitAusgabe,
  entferneThemaVonAusgabe,
} from "@/lib/actions";
import {
  TEILNAHME,
  TEILNAHME_LABEL,
  TURNUS,
  TURNUS_LABEL,
  EVENT_ROLLEN,
  EVENT_ROLLE_LABEL,
  KONTAKT_STATUS,
  KONTAKT_STATUS_LABEL,
  berlinHeute,
  formatTag,
  type EventRolle,
  type Teilnahme,
} from "@/lib/events";
import { INBOX_STATUS_GESCHLOSSEN, INBOX_TYP_LABEL, type InboxTyp } from "@/lib/inbox";
import AktionsFormular from "../../AktionsFormular";
import AufgabeZeile from "../../wiedervorlage/AufgabeZeile";
import KontaktStatusAuswahl from "../../kontakte/KontaktStatusAuswahl";

export default async function EventReihePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const heute = berlinHeute();

  const [{ data: reihe }, { data: ausgabenDaten, error }, { data: kontakte }, { data: themen }] = await Promise.all([
    supabase.from("event_reihen").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("event_ausgaben")
      .select(
        "*, event_ausgabe_kontakte(rolle, notiz, kontakte(id, name, firma, position, status, linkedin_url, archiviert_am)), aufgaben(*), inbox_eintrag_event_ausgaben(notiz, inbox_eintraege(id, titel, text, typ, status))"
      )
      .eq("event_reihe_id", id)
      .order("jahr", { ascending: false }),
    supabase.from("kontakte").select("id, name, firma").is("archiviert_am", null).order("name"),
    supabase
      .from("inbox_eintraege")
      .select("id, titel, text, typ")
      .in("typ", ["thema", "idee"])
      .not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`)
      .order("ist_fokus", { ascending: false })
      .order("erstellt_am", { ascending: false }),
  ]);
  if (error) throw new Error(error.message);
  if (!reihe) notFound();

  const ausgaben = (ausgabenDaten || []) as any[];
  const aktiv = ausgaben.filter((a) => !a.archiviert_am);
  const archiviert = ausgaben.filter((a) => a.archiviert_am);

  return (
    <main>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}><Link href="/events">← Events</Link></p>
      <h1 style={{ marginBottom: "0.35rem" }}>
        {reihe.name}
        {reihe.archiviert_am && <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.5rem" }}>archiviert</span>}
      </h1>
      <p style={{ marginTop: 0 }}>
        {reihe.website_url && <a href={reihe.website_url} target="_blank" rel="noreferrer">{reihe.website_url.replace(/^https?:\/\//, "")}</a>}
        {reihe.website_url && " · "}
        {TURNUS_LABEL[reihe.turnus as keyof typeof TURNUS_LABEL]} · Zielgruppen-Fit {reihe.zielgruppen_fit ?? "offen"}/5 · Speaker-Chance {reihe.speaker_chance ?? "offen"}/5
        {reihe.kosten_notiz && <> · {reihe.kosten_notiz}</>}
      </p>
      {reihe.beschreibung && <p style={{ marginTop: "-0.25rem" }}>{reihe.beschreibung}</p>}

      <details className="au-card" style={{ padding: "0.9rem 1.25rem" }}>
        <summary style={{ fontWeight: 600 }}>Event-Reihe bearbeiten</summary>
        <AktionsFormular action={speichereEventReihe} className="au-formgrid" style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="id" value={reihe.id} />
          <div><label className="au-label">Name</label><input className="au-input" name="name" defaultValue={reihe.name} required /></div>
          <div><label className="au-label">Website</label><input className="au-input" name="website_url" type="url" defaultValue={reihe.website_url || ""} /></div>
          <div>
            <label className="au-label">Turnus</label>
            <select className="au-select" name="turnus" defaultValue={reihe.turnus}>
              {TURNUS.map((t) => <option key={t} value={t}>{TURNUS_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="au-label">Zielgruppen-Fit (1–5)</label>
            <select className="au-select" name="zielgruppen_fit" defaultValue={reihe.zielgruppen_fit ?? ""}>
              <option value="">offen</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="au-label">Speaker-Chance (1–5)</label>
            <select className="au-select" name="speaker_chance" defaultValue={reihe.speaker_chance ?? ""}>
              <option value="">offen</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div><label className="au-label">Kosten (Notiz)</label><input className="au-input" name="kosten_notiz" defaultValue={reihe.kosten_notiz || ""} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label className="au-label">Beschreibung</label><textarea className="au-textarea" name="beschreibung" rows={2} defaultValue={reihe.beschreibung || ""} /></div>
          <div><button type="submit" className="au-btn au-btn-primary">Speichern</button></div>
        </AktionsFormular>
        <AktionsFormular action={archiviereEventReihe} style={{ marginTop: "0.5rem" }} bestaetigung={reihe.archiviert_am ? "Event-Reihe wiederherstellen?" : "Event-Reihe archivieren? Sie verschwindet aus der Übersicht, bleibt aber erhalten."}>
          <input type="hidden" name="id" value={reihe.id} />
          <input type="hidden" name="archivieren" value={String(!reihe.archiviert_am)} />
          <button type="submit" className="au-link-danger">{reihe.archiviert_am ? "wiederherstellen" : "Event-Reihe archivieren"}</button>
        </AktionsFormular>
      </details>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", margin: "1.5rem 0 0.75rem" }}>
        <h2 style={{ margin: 0 }}>Ausgaben</h2>
        <AktionsFormular action={legeNaechsteEventAusgabeAn}>
          <input type="hidden" name="event_reihe_id" value={reihe.id} />
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm" title="Jahr +1, Datum/CfP leer, legt Aufgabe „CfP-Termin & Datum recherchieren“ an">
            + Nächste Ausgabe anlegen
          </button>
        </AktionsFormular>
      </div>

      {aktiv.map((a) => {
        const kontakteNachRolle = EVENT_ROLLEN.map((rolle) => ({
          rolle,
          eintraege: (a.event_ausgabe_kontakte || []).filter((z: any) => z.rolle === rolle && z.kontakte && !z.kontakte.archiviert_am),
        }));
        const aufgaben = (a.aufgaben || [])
          .filter((x: any) => !x.archiviert_am)
          .sort((x: any, y: any) => Number(!!x.erledigt_am) - Number(!!y.erledigt_am) || (x.faellig_am || "9999").localeCompare(y.faellig_am || "9999"));
        const verknuepfteThemen = (a.inbox_eintrag_event_ausgaben || []).filter((v: any) => v.inbox_eintraege);
        const cfpBald = a.cfp_ende && a.cfp_ende >= heute;
        return (
          <section key={a.id} id={`ausgabe-${a.id}`} className="au-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "baseline" }}>
              <h3 style={{ margin: 0 }}>{reihe.name} {a.jahr}</h3>
              <span className={`au-badge ${a.teilnahme === "speaker" ? "au-badge-gold" : a.teilnahme === "nicht_moeglich" ? "au-badge-neutral" : "au-badge-success"}`}>
                {TEILNAHME_LABEL[a.teilnahme as Teilnahme]}
              </span>
            </div>
            <div className="au-event-meta" style={{ marginBottom: "0.5rem" }}>
              <span>📅 {a.datum_start ? formatTag(a.datum_start) : "Datum unbekannt"}{a.datum_ende && a.datum_ende !== a.datum_start ? ` – ${formatTag(a.datum_ende)}` : ""}</span>
              {a.ort && <span>📍 {a.ort}</span>}
              <span className={cfpBald ? "au-badge au-badge-warning" : undefined}>
                CfP: {a.cfp_start || a.cfp_ende ? `${a.cfp_start ? formatTag(a.cfp_start) : "?"} – ${a.cfp_ende ? formatTag(a.cfp_ende) : "?"}` : "unbekannt"}
              </span>
            </div>
            {a.notizen && <p style={{ margin: "0 0 0.5rem", whiteSpace: "pre-wrap" }}>{a.notizen}</p>}

            <details style={{ marginBottom: "0.75rem" }}>
              <summary className="au-link">Ausgabe bearbeiten</summary>
              <AktionsFormular action={speichereEventAusgabe} className="au-formgrid" style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="event_reihe_id" value={reihe.id} />
                <div><label className="au-label">Jahr</label><input className="au-input" name="jahr" type="number" defaultValue={a.jahr} required /></div>
                <div>
                  <label className="au-label">Teilnahme</label>
                  <select className="au-select" name="teilnahme" defaultValue={a.teilnahme}>
                    {TEILNAHME.map((t) => <option key={t} value={t}>{TEILNAHME_LABEL[t]}</option>)}
                  </select>
                </div>
                <div><label className="au-label">Ort</label><input className="au-input" name="ort" defaultValue={a.ort || ""} /></div>
                <div><label className="au-label">Datum von</label><input className="au-input" name="datum_start" type="date" defaultValue={a.datum_start || ""} /></div>
                <div><label className="au-label">Datum bis</label><input className="au-input" name="datum_ende" type="date" defaultValue={a.datum_ende || ""} /></div>
                <div><label className="au-label">CfP öffnet</label><input className="au-input" name="cfp_start" type="date" defaultValue={a.cfp_start || ""} /></div>
                <div><label className="au-label">CfP-Deadline</label><input className="au-input" name="cfp_ende" type="date" defaultValue={a.cfp_ende || ""} /></div>
                <div style={{ gridColumn: "1 / -1" }}><label className="au-label">Notizen</label><textarea className="au-textarea" name="notizen" rows={2} defaultValue={a.notizen || ""} /></div>
                <div><button type="submit" className="au-btn au-btn-primary au-btn-sm">Speichern</button></div>
              </AktionsFormular>
              <AktionsFormular action={archiviereEventAusgabe} bestaetigung={`Ausgabe ${a.jahr} archivieren?`}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="archivieren" value="true" />
                <button type="submit" className="au-link-danger">Ausgabe archivieren</button>
              </AktionsFormular>
            </details>

            <div className="au-event-spalten">
              <div>
                <h4 className="au-event-h4">Aufgaben</h4>
                {aufgaben.map((x: any) => <AufgabeZeile key={x.id} aufgabe={x} heute={heute} reiheId={reihe.id} />)}
                {!aufgaben.length && <p className="au-leer">Keine Aufgaben.</p>}
                <AktionsFormular action={speichereAufgabe} zuruecksetzen className="au-inline-form">
                  <input type="hidden" name="event_ausgabe_id" value={a.id} />
                  <input type="hidden" name="event_reihe_id" value={reihe.id} />
                  <input className="au-input" name="titel" placeholder="Neue Aufgabe" required />
                  <input className="au-input" name="faellig_am" type="date" aria-label="fällig am" />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">+</button>
                </AktionsFormular>

                <h4 className="au-event-h4" style={{ marginTop: "1.25rem" }}>Passende Themen / Talks</h4>
                {verknuepfteThemen.map((v: any) => (
                  <div key={v.inbox_eintraege.id} className="au-event-zeile">
                    <span>
                      <span className="au-badge au-badge-neutral">{INBOX_TYP_LABEL[v.inbox_eintraege.typ as InboxTyp] || "Idee"}</span>{" "}
                      {v.inbox_eintraege.titel || v.inbox_eintraege.text}
                      {v.notiz && <span className="au-klein"> – {v.notiz}</span>}
                    </span>
                    <AktionsFormular action={entferneThemaVonAusgabe}>
                      <input type="hidden" name="inbox_eintrag_id" value={v.inbox_eintraege.id} />
                      <input type="hidden" name="event_ausgabe_id" value={a.id} />
                      <input type="hidden" name="event_reihe_id" value={reihe.id} />
                      <button type="submit" className="au-link-danger" title="Verknüpfung lösen">×</button>
                    </AktionsFormular>
                  </div>
                ))}
                {!verknuepfteThemen.length && <p className="au-leer">Noch kein Thema verknüpft.</p>}
                <AktionsFormular action={verknuepfeThemaMitAusgabe} zuruecksetzen className="au-inline-form">
                  <input type="hidden" name="event_ausgabe_id" value={a.id} />
                  <input type="hidden" name="event_reihe_id" value={reihe.id} />
                  <select className="au-select" name="inbox_eintrag_id" defaultValue="" required>
                    <option value="" disabled>Thema aus der Inbox wählen …</option>
                    {(themen || []).map((t: any) => (
                      <option key={t.id} value={t.id}>{(t.titel || t.text).slice(0, 80)}</option>
                    ))}
                  </select>
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">+</button>
                </AktionsFormular>
              </div>

              <div>
                <h4 className="au-event-h4">Kontakte nach Rolle</h4>
                {kontakteNachRolle.filter((g) => g.eintraege.length).map((g) => (
                  <div key={g.rolle} style={{ marginBottom: "0.6rem" }}>
                    <div className="au-klein" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>{EVENT_ROLLE_LABEL[g.rolle as EventRolle]}</div>
                    {g.eintraege.map((z: any) => (
                      <div key={z.kontakte.id + z.rolle} className="au-event-zeile">
                        <span>
                          <Link href={`/kontakte?q=${encodeURIComponent(z.kontakte.name)}`}>{z.kontakte.name}</Link>
                          {z.kontakte.firma && <span className="au-klein"> · {z.kontakte.firma}</span>}
                          {z.kontakte.linkedin_url && <> · <a href={z.kontakte.linkedin_url} target="_blank" rel="noreferrer" className="au-klein">LinkedIn</a></>}
                        </span>
                        <span style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                          <KontaktStatusAuswahl kontaktId={z.kontakte.id} status={z.kontakte.status} reiheId={reihe.id} action={setzeKontaktStatus} />
                          <AktionsFormular action={entferneKontaktVonAusgabe}>
                            <input type="hidden" name="event_ausgabe_id" value={a.id} />
                            <input type="hidden" name="kontakt_id" value={z.kontakte.id} />
                            <input type="hidden" name="rolle" value={z.rolle} />
                            <input type="hidden" name="event_reihe_id" value={reihe.id} />
                            <button type="submit" className="au-link-danger" title="Rolle bei diesem Event entfernen (Kontakt bleibt erhalten)">×</button>
                          </AktionsFormular>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                {!kontakteNachRolle.some((g) => g.eintraege.length) && <p className="au-leer">Noch keine Kontakte.</p>}

                {(kontakte || []).length > 0 && (
                  <AktionsFormular action={verknuepfeKontaktMitAusgabe} zuruecksetzen className="au-inline-form">
                    <input type="hidden" name="event_ausgabe_id" value={a.id} />
                    <input type="hidden" name="event_reihe_id" value={reihe.id} />
                    <select className="au-select" name="kontakt_id" defaultValue="" required>
                      <option value="" disabled>Bestehender Kontakt …</option>
                      {(kontakte || []).map((k: any) => <option key={k.id} value={k.id}>{k.name}{k.firma ? ` (${k.firma})` : ""}</option>)}
                    </select>
                    <select className="au-select" name="rolle" defaultValue="aussteller">
                      {EVENT_ROLLEN.map((r) => <option key={r} value={r}>{EVENT_ROLLE_LABEL[r]}</option>)}
                    </select>
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">+</button>
                  </AktionsFormular>
                )}

                <details style={{ marginTop: "0.6rem" }}>
                  <summary className="au-link">+ Neuen Kontakt für {a.jahr} anlegen</summary>
                  <AktionsFormular action={speichereKontakt} zuruecksetzen className="au-formgrid" style={{ marginTop: "0.5rem" }}>
                    <input type="hidden" name="event_ausgabe_id" value={a.id} />
                    <div><label className="au-label">Name</label><input className="au-input" name="name" required /></div>
                    <div><label className="au-label">Firma</label><input className="au-input" name="firma" /></div>
                    <div>
                      <label className="au-label">Rolle beim Event</label>
                      <select className="au-select" name="rolle" defaultValue="aussteller">
                        {EVENT_ROLLEN.map((r) => <option key={r} value={r}>{EVENT_ROLLE_LABEL[r]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="au-label">Status</label>
                      <select className="au-select" name="status" defaultValue="recherchieren">
                        {KONTAKT_STATUS.map((s) => <option key={s} value={s}>{KONTAKT_STATUS_LABEL[s]}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className="au-label">Quelle (Pflicht – woher stammt der Kontakt?)</label>
                      <input className="au-input" name="quelle" required placeholder={`z. B. Ausstellerverzeichnis ${reihe.name} ${a.jahr}, öffentlich`} />
                    </div>
                    <div><label className="au-label">Position</label><input className="au-input" name="position" /></div>
                    <div><label className="au-label">LinkedIn</label><input className="au-input" name="linkedin_url" type="url" /></div>
                    <div><button type="submit" className="au-btn au-btn-primary au-btn-sm">Kontakt anlegen</button></div>
                  </AktionsFormular>
                </details>
              </div>
            </div>
          </section>
        );
      })}
      {!aktiv.length && <div className="au-card au-leer">Noch keine Ausgabe – oben „Nächste Ausgabe anlegen“.</div>}
      {archiviert.length > 0 && (
        <div className="au-klein" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          Archivierte Ausgaben:
          {archiviert.map((a) => (
            <AktionsFormular key={a.id} action={archiviereEventAusgabe}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="archivieren" value="false" />
              <button type="submit" className="au-link" title="wiederherstellen">{a.jahr} ↺</button>
            </AktionsFormular>
          ))}
        </div>
      )}
    </main>
  );
}
