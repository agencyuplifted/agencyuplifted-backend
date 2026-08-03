export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  createFunnelMail,
  updateFunnelMail,
  deleteFunnelMail,
  toggleFunnelMailAktiv,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { TRIGGER_LABEL, PLATZHALTER_HILFE, type TriggerTyp } from "@/lib/funnel";

const TRIGGER_TYPEN: TriggerTyp[] = [
  "buchung_erstellt",
  "vor_seminarstart",
  "nach_seminarende",
  "lead_erstellt",
  "warteliste_eingetragen",
];

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ lauf?: string; gesendet?: string; fehler?: string; uebersprungen?: string; geprueft?: string }>;
}) {
  const { lauf, gesendet, fehler, uebersprungen, geprueft } = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: funnelMails } = await supabase.from("funnel_mails").select("*").order("erstellt_am", { ascending: false });
  const { data: log } = await supabase
    .from("funnel_versand_log")
    .select("*, funnel_mails(name)")
    .order("gesendet_am", { ascending: false })
    .limit(30);

  return (
    <main>
      <h1>Funnel-Mails</h1>
      <p>
        Automatische E-Mails mit Zeitschalter — z. B. Erinnerung vor dem Seminar oder Follow-up nach der Buchung.
        Läuft automatisch einmal täglich; über den Button unten kann der Versand auch manuell angestoßen werden.
      </p>

      {lauf && (
        <div className="au-banner au-banner-success">
          Lauf abgeschlossen: {geprueft} aktive Funnel-Mails geprüft, {gesendet} verschickt, {uebersprungen} bereits
          zuvor verschickt (übersprungen), {fehler} Fehler.
        </div>
      )}

      <div className="au-card">
        <Link href="/funnel/vorschau" className="au-btn au-btn-primary">
          Vorschau: Fällige Mails prüfen &amp; senden
        </Link>
        <p style={{ fontSize: "0.85rem", marginTop: "0.6rem", marginBottom: 0 }}>
          Zeigt zuerst, wer was bekommen würde. Der tatsächliche Versand erfordert danach eine zweite,
          ausdrückliche Bestätigung.
        </p>
      </div>

      <div className="au-card">
        <h2>Platzhalter</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Platzhalter</th>
              <th>Bedeutung</th>
              <th>Verfügbar bei</th>
            </tr>
          </thead>
          <tbody>
            {PLATZHALTER_HILFE.map((p) => (
              <tr key={p.key}>
                <td style={{ fontFamily: "monospace" }}>{p.key}</td>
                <td>{p.beschreibung}</td>
                <td style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {p.verfuegbarBei.map((t) => TRIGGER_LABEL[t]).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="au-card">
        <h2>Neue Funnel-Mail</h2>
        <form action={createFunnelMail}>
          <label className="au-label">Name (intern)</label>
          <input className="au-input" name="name" required placeholder="z. B. Erinnerung 3 Tage vor Seminarstart" />

          <label className="au-label">Auslöser</label>
          <select className="au-select" name="trigger_typ" required defaultValue="vor_seminarstart">
            {TRIGGER_TYPEN.map((t) => (
              <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
            ))}
          </select>

          <label className="au-label">Anzahl Tage (X)</label>
          <input className="au-input" name="versatz_tage" type="number" min={0} defaultValue={3} required />

          <label className="au-label">Betreff</label>
          <input className="au-input" name="betreff" required placeholder="z. B. Bald geht's los, {{vorname}}!" />

          <label className="au-label">Inhalt (Platzhalter siehe oben, Zeilenumbrüche werden übernommen)</label>
          <textarea
            className="au-textarea"
            name="inhalt"
            required
            placeholder={"Hallo {{vorname}},\n\nnur noch wenige Tage bis {{seminartitel}} am {{seminardatum}}.\n\nViele Grüße"}
          />

          <button type="submit" className="au-btn au-btn-primary">Funnel-Mail anlegen</button>
        </form>
      </div>

      <div className="au-card">
        <h2>Bestehende Funnel-Mails</h2>
        {(funnelMails || []).map((f: any) => (
          <div key={f.id} className="au-subcard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{f.name}</strong>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {TRIGGER_LABEL[f.trigger_typ as TriggerTyp]?.replace("X", String(f.versatz_tage))}
                </div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Betreff: {f.betreff}</div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <form action={toggleFunnelMailAktiv}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="aktiv_neu" value={String(!f.aktiv)} />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">
                    {f.aktiv ? "Aktiv (deaktivieren)" : "Inaktiv (aktivieren)"}
                  </button>
                </form>
                <form action={deleteFunnelMail}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
                </form>
              </div>
            </div>

            <details style={{ marginTop: "0.85rem" }}>
              <summary style={{ color: "#102A4C", fontSize: "0.85rem", fontWeight: 600 }}>Bearbeiten</summary>
              <form action={updateFunnelMail} style={{ marginTop: "0.85rem" }}>
                <input type="hidden" name="id" value={f.id} />
                <label className="au-label">Name (intern)</label>
                <input className="au-input" name="name" required defaultValue={f.name} />

                <label className="au-label">Auslöser</label>
                <select className="au-select" name="trigger_typ" required defaultValue={f.trigger_typ}>
                  {TRIGGER_TYPEN.map((t) => (
                    <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                  ))}
                </select>

                <label className="au-label">Anzahl Tage (X)</label>
                <input className="au-input" name="versatz_tage" type="number" min={0} defaultValue={f.versatz_tage} required />

                <label className="au-label">Betreff</label>
                <input className="au-input" name="betreff" required defaultValue={f.betreff} />

                <label className="au-label">Inhalt</label>
                <textarea className="au-textarea" name="inhalt" required defaultValue={f.inhalt} />

                <button type="submit" className="au-btn au-btn-primary">Speichern</button>
              </form>
            </details>
          </div>
        ))}
        {!funnelMails?.length && <p>Noch keine Funnel-Mails angelegt.</p>}
      </div>

      <div className="au-card">
        <h2>Letzte Versendungen</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Funnel-Mail</th>
              <th>Empfänger</th>
              <th>Status</th>
              <th>Fehler</th>
            </tr>
          </thead>
          <tbody>
            {(log || []).map((l: any) => (
              <tr key={l.id}>
                <td>{formatDatum(l.gesendet_am)}</td>
                <td>{l.funnel_mails?.name || "—"}</td>
                <td>{l.empfaenger_email}</td>
                <td>
                  <span className={`au-badge ${l.status === "fehler" ? "au-badge-danger" : "au-badge-success"}`}>{l.status}</span>
                </td>
                <td style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{l.fehlermeldung || "—"}</td>
              </tr>
            ))}
            {!log?.length && (
              <tr className="au-table-empty"><td colSpan={5}>Noch keine Mails verschickt.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
