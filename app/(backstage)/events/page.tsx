export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { speichereEventReihe } from "@/lib/actions";
import { TEILNAHME_LABEL, TURNUS, TURNUS_LABEL, berlinHeute, formatTag, type Teilnahme } from "@/lib/events";
import AktionsFormular from "../AktionsFormular";

function Punkte({ wert, max = 5 }: { wert: number | null; max?: number }) {
  if (wert == null) return <span style={{ color: "var(--color-text-faint)" }}>offen</span>;
  return <span title={`${wert} von ${max}`}>{"●".repeat(wert)}<span style={{ color: "var(--color-border-strong)" }}>{"●".repeat(max - wert)}</span></span>;
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ archiv?: string }> }) {
  const { archiv } = await searchParams;
  const supabase = getSupabaseAdmin();
  const heute = berlinHeute();

  let query = supabase
    .from("event_reihen")
    .select("*, event_ausgaben(id, jahr, datum_start, cfp_ende, teilnahme, archiviert_am, aufgaben(id, erledigt_am, archiviert_am))")
    .order("name");
  query = archiv === "1" ? query.not("archiviert_am", "is", null) : query.is("archiviert_am", null);
  const { data: reihen, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <main>
      <h1>Events</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Konferenzen und Branchen-Events: Ausgaben pro Jahr, CfP-Fristen, Kontakte nach Rolle und Aufgaben.
      </p>

      <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {(reihen || []).map((r: any) => {
          const ausgaben = (r.event_ausgaben || []).filter((a: any) => !a.archiviert_am).sort((a: any, b: any) => a.jahr - b.jahr);
          const naechste = ausgaben.find((a: any) => !a.datum_start || a.datum_start >= heute) || ausgaben[ausgaben.length - 1];
          const offeneAufgaben = ausgaben.reduce(
            (n: number, a: any) => n + (a.aufgaben || []).filter((x: any) => !x.erledigt_am && !x.archiviert_am).length,
            0
          );
          return (
            <Link key={r.id} href={`/events/${r.id}`} className="au-card au-event-kachel" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "1.05rem" }}>{r.name}</strong>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{TURNUS_LABEL[r.turnus as keyof typeof TURNUS_LABEL] || r.turnus}</span>
              </div>
              <div className="au-event-meta">
                <span>Zielgruppen-Fit <Punkte wert={r.zielgruppen_fit} /></span>
                <span>Speaker-Chance <Punkte wert={r.speaker_chance} /></span>
                {naechste && (
                  <span>
                    {naechste.jahr}: {naechste.datum_start ? formatTag(naechste.datum_start) : "Datum offen"} ·{" "}
                    {TEILNAHME_LABEL[naechste.teilnahme as Teilnahme] || naechste.teilnahme}
                  </span>
                )}
                {offeneAufgaben > 0 && <span className="au-badge au-badge-warning">{offeneAufgaben} offene Aufgaben</span>}
              </div>
            </Link>
          );
        })}
        {!reihen?.length && <div className="au-card" style={{ color: "var(--color-text-faint)" }}>Keine Events{archiv === "1" ? " im Archiv" : ""}.</div>}
      </div>

      <p style={{ fontSize: "0.85rem" }}>
        {archiv === "1" ? <Link href="/events">← aktive Events</Link> : <Link href="/events?archiv=1">Archivierte Events anzeigen</Link>}
      </p>

      <details className="au-card">
        <summary style={{ fontWeight: 600 }}>+ Neue Event-Reihe anlegen</summary>
        <AktionsFormular action={speichereEventReihe} zuruecksetzen className="au-formgrid" style={{ marginTop: "0.75rem" }}>
          <div>
            <label className="au-label">Name</label>
            <input className="au-input" name="name" required placeholder="z. B. OMR Festival" />
          </div>
          <div>
            <label className="au-label">Website</label>
            <input className="au-input" name="website_url" type="url" placeholder="https://" />
          </div>
          <div>
            <label className="au-label">Turnus</label>
            <select className="au-select" name="turnus" defaultValue="jaehrlich">
              {TURNUS.map((t) => <option key={t} value={t}>{TURNUS_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="au-label">Zielgruppen-Fit (1–5)</label>
            <select className="au-select" name="zielgruppen_fit" defaultValue="">
              <option value="">offen</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="au-label">Speaker-Chance (1–5)</label>
            <select className="au-select" name="speaker_chance" defaultValue="">
              <option value="">offen</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="au-label">Kosten (Notiz)</label>
            <input className="au-input" name="kosten_notiz" placeholder="z. B. Ticket ca. 500 €" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="au-label">Beschreibung</label>
            <textarea className="au-textarea" name="beschreibung" rows={2} />
          </div>
          <div>
            <button type="submit" className="au-btn au-btn-primary">Anlegen</button>
          </div>
        </AktionsFormular>
      </details>
    </main>
  );
}
