export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  createFunnelMail,
  updateFunnelMail,
  deleteFunnelMail,
  toggleFunnelMailAktiv,
  funnelVersandJetzt,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { TRIGGER_LABEL, PLATZHALTER_HILFE, type TriggerTyp } from "@/lib/funnel";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };
const funnelCard: React.CSSProperties = { border: "1px solid #cfd8e3", background: "#f7f9fc", padding: "1rem 1.25rem", marginBottom: "1rem" };
const btn: React.CSSProperties = { background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "transparent", color: "#102A4C", border: "1px solid #102A4C", padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.85rem" };
const btnDanger: React.CSSProperties = { background: "transparent", color: "#8a1f1f", border: "1px solid #8a1f1f", padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.8rem" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { padding: "0.4rem", textAlign: "left", borderBottom: "1px solid #ccc" };
const td: React.CSSProperties = { padding: "0.4rem", borderBottom: "1px solid #f0f0f0" };

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
      <p style={{ color: "#666" }}>
        Automatische E-Mails mit Zeitschalter — z. B. Erinnerung vor dem Seminar oder Follow-up nach der Buchung.
        Läuft automatisch einmal täglich; über den Button unten kann der Versand auch manuell angestoßen werden.
      </p>

      {lauf && (
        <div style={{ ...card, background: "#eef7ee", borderColor: "#3a7d3a", color: "#245c24" }}>
          Lauf abgeschlossen: {geprueft} aktive Funnel-Mails geprüft, {gesendet} verschickt, {uebersprungen} bereits
          zuvor verschickt (übersprungen), {fehler} Fehler.
        </div>
      )}

      <div style={card}>
        <form action={funnelVersandJetzt}>
          <button type="submit" style={btn}>Jetzt prüfen &amp; fällige Mails senden</button>
        </form>
      </div>

      <div style={card}>
        <h2>Platzhalter</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Platzhalter</th>
              <th style={th}>Bedeutung</th>
              <th style={th}>Verfügbar bei</th>
            </tr>
          </thead>
          <tbody>
            {PLATZHALTER_HILFE.map((p) => (
              <tr key={p.key}>
                <td style={{ ...td, fontFamily: "monospace" }}>{p.key}</td>
                <td style={td}>{p.beschreibung}</td>
                <td style={{ ...td, color: "#666", fontSize: "0.85rem" }}>
                  {p.verfuegbarBei.map((t) => TRIGGER_LABEL[t]).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h2>Neue Funnel-Mail</h2>
        <form action={createFunnelMail}>
          <label style={labelStyle}>Name (intern)</label>
          <input style={inputStyle} name="name" required placeholder="z. B. Erinnerung 3 Tage vor Seminarstart" />

          <label style={labelStyle}>Auslöser</label>
          <select style={inputStyle} name="trigger_typ" required defaultValue="vor_seminarstart">
            {TRIGGER_TYPEN.map((t) => (
              <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
            ))}
          </select>

          <label style={labelStyle}>Anzahl Tage (X)</label>
          <input style={inputStyle} name="versatz_tage" type="number" min={0} defaultValue={3} required />

          <label style={labelStyle}>Betreff</label>
          <input style={inputStyle} name="betreff" required placeholder="z. B. Bald geht's los, {{vorname}}!" />

          <label style={labelStyle}>Inhalt (Platzhalter siehe oben, Zeilenumbrüche werden übernommen)</label>
          <textarea style={{ ...inputStyle, minHeight: 160 }} name="inhalt" required
            placeholder={"Hallo {{vorname}},\n\nnur noch wenige Tage bis {{seminartitel}} am {{seminardatum}}.\n\nViele Grüße"} />

          <button type="submit" style={btn}>Funnel-Mail anlegen</button>
        </form>
      </div>

      <div style={card}>
        <h2>Bestehende Funnel-Mails</h2>
        {(funnelMails || []).map((f: any) => (
          <div key={f.id} style={funnelCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{f.name}</strong>
                <div style={{ color: "#666", fontSize: "0.85rem" }}>
                  {TRIGGER_LABEL[f.trigger_typ as TriggerTyp]?.replace("X", String(f.versatz_tage))}
                </div>
                <div style={{ color: "#666", fontSize: "0.85rem" }}>Betreff: {f.betreff}</div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <form action={toggleFunnelMailAktiv}>
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="aktiv_neu" value={String(!f.aktiv)} />
                  <button type="submit" style={btnSecondary}>{f.aktiv ? "Aktiv (deaktivieren)" : "Inaktiv (aktivieren)"}</button>
                </form>
                <form action={deleteFunnelMail}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" style={btnDanger}>Löschen</button>
                </form>
              </div>
            </div>

            <details style={{ marginTop: "0.75rem" }}>
              <summary style={{ cursor: "pointer", color: "#102A4C", fontSize: "0.85rem" }}>Bearbeiten</summary>
              <form action={updateFunnelMail} style={{ marginTop: "0.75rem" }}>
                <input type="hidden" name="id" value={f.id} />
                <label style={labelStyle}>Name (intern)</label>
                <input style={inputStyle} name="name" required defaultValue={f.name} />

                <label style={labelStyle}>Auslöser</label>
                <select style={inputStyle} name="trigger_typ" required defaultValue={f.trigger_typ}>
                  {TRIGGER_TYPEN.map((t) => (
                    <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>
                  ))}
                </select>

                <label style={labelStyle}>Anzahl Tage (X)</label>
                <input style={inputStyle} name="versatz_tage" type="number" min={0} defaultValue={f.versatz_tage} required />

                <label style={labelStyle}>Betreff</label>
                <input style={inputStyle} name="betreff" required defaultValue={f.betreff} />

                <label style={labelStyle}>Inhalt</label>
                <textarea style={{ ...inputStyle, minHeight: 160 }} name="inhalt" required defaultValue={f.inhalt} />

                <button type="submit" style={btn}>Speichern</button>
              </form>
            </details>
          </div>
        ))}
        {!funnelMails?.length && <p style={{ color: "#888" }}>Noch keine Funnel-Mails angelegt.</p>}
      </div>

      <div style={card}>
        <h2>Letzte Versendungen</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Datum</th>
              <th style={th}>Funnel-Mail</th>
              <th style={th}>Empfänger</th>
              <th style={th}>Status</th>
              <th style={th}>Fehler</th>
            </tr>
          </thead>
          <tbody>
            {(log || []).map((l: any) => (
              <tr key={l.id}>
                <td style={td}>{formatDatum(l.gesendet_am)}</td>
                <td style={td}>{l.funnel_mails?.name || "—"}</td>
                <td style={td}>{l.empfaenger_email}</td>
                <td style={{ ...td, color: l.status === "fehler" ? "#8a1f1f" : "#245c24" }}>{l.status}</td>
                <td style={{ ...td, color: "#8a1f1f", fontSize: "0.85rem" }}>{l.fehlermeldung || "—"}</td>
              </tr>
            ))}
            {!log?.length && (
              <tr><td style={td} colSpan={5}>Noch keine Mails verschickt.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
