export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  createFunnelMail,
  updateFunnelMail,
  deleteFunnelMail,
  toggleFunnelMailAktiv,
  importiereFunnelMail,
  stelleFunnelMailWiederHer,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { TRIGGER_LABEL, PLATZHALTER_HILFE, SYSTEM_FUNNEL_IDS, type TriggerTyp } from "@/lib/funnel";
import FunnelImport from "./FunnelImport";
import FunnelEditor from "./FunnelEditor";
import FunnelZeitstrahl, { type ZeitstrahlMail } from "./FunnelZeitstrahl";
import TerminWahl from "./TerminWahl";

const TRIGGER_TYPEN: TriggerTyp[] = [
  "buchung_erstellt",
  "vor_seminarstart",
  "nach_seminarende",
  "lead_erstellt",
  "warteliste_eingetragen",
];

const TAG_MS = 86_400_000;
const tageZwischen = (von: string, bis: string) => Math.round((Date.parse(bis) - Date.parse(von)) / TAG_MS);

// Reihenfolge wie im Zeitstrahl: erst die personenbezogenen, dann vor → nach
function zeitstrahlRang(m: { trigger_typ: string; versatz_tage: number }) {
  if (m.trigger_typ === "vor_seminarstart") return 1000 - m.versatz_tage;
  if (m.trigger_typ === "nach_seminarende") return 2000 + m.versatz_tage;
  return m.versatz_tage;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ lauf?: string; gesendet?: string; fehler?: string; uebersprungen?: string; geprueft?: string; mail?: string; termin?: string; gespeichert?: string }>;
}) {
  const { lauf, gesendet, fehler, uebersprungen, geprueft, mail: mailParam, termin: terminParam, gespeichert } = await searchParams;
  const supabase = getSupabaseAdmin();
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const vorVierMonaten = new Date(Date.now() - 120 * TAG_MS).toISOString().slice(0, 10);

  const [{ data: alleFunnelMails }, { data: log }, { data: termine }] = await Promise.all([
    supabase.from("funnel_mails").select("*").order("erstellt_am", { ascending: false }),
    supabase.from("funnel_versand_log").select("*, funnel_mails(name)").order("gesendet_am", { ascending: false }).limit(30),
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, datum_ende")
      .neq("status", "abgesagt")
      .gte("datum_start", vorVierMonaten)
      .order("datum_start")
      .limit(40),
  ]);
  const funnelMails = (alleFunnelMails || [])
    .filter((f: any) => !f.geloescht_am)
    .sort((a: any, b: any) => zeitstrahlRang(a) - zeitstrahlRang(b));
  const geloeschte = (alleFunnelMails || []).filter((f: any) => f.geloescht_am);

  const modus = mailParam === "neu" ? "neu" : mailParam === "import" ? "import" : "mail";
  const ausgewaehlt: any = modus === "mail" ? funnelMails.find((f: any) => f.id === mailParam) || funnelMails[0] || null : null;
  const istSystem = !!(ausgewaehlt && SYSTEM_FUNNEL_IDS[ausgewaehlt.id]);

  // Beispieltermin: gewaehlt, sonst der naechste anstehende
  const terminListe = (termine || []) as any[];
  const beispiel =
    terminListe.find((t) => t.id === terminParam) || terminListe.find((t) => t.datum_start >= heute) || terminListe[terminListe.length - 1] || null;
  const dauerTage = beispiel?.datum_ende ? Math.max(0, tageZwischen(beispiel.datum_start, beispiel.datum_ende)) : 0;
  const heuteOffset = beispiel ? tageZwischen(beispiel.datum_start, heute) : null;

  const hrefFuer = (id: string) => {
    const p = new URLSearchParams({ mail: id });
    if (terminParam) p.set("termin", terminParam);
    return `/funnel?${p}`;
  };

  const { data: versandDerMail, count: versandAnzahl } = ausgewaehlt
    ? await supabase
        .from("funnel_versand_log")
        .select("gesendet_am", { count: "exact" })
        .eq("funnel_mail_id", ausgewaehlt.id)
        .order("gesendet_am", { ascending: false })
        .limit(1)
    : { data: null, count: 0 };

  const zeitstrahlMails: ZeitstrahlMail[] = funnelMails.map((f: any) => ({
    id: f.id,
    name: f.name,
    trigger_typ: f.trigger_typ,
    versatz_tage: f.versatz_tage,
    aktiv: f.aktiv,
    system: !!SYSTEM_FUNNEL_IDS[f.id],
  }));
  const triggerOptionen = TRIGGER_TYPEN.map((t) => ({ key: t, label: TRIGGER_LABEL[t] }));

  return (
    <main>
      <div className="au-dash-kopf">
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Funnel-Mails</h1>
          <p style={{ margin: 0 }}>Automatische Mails mit Zeitschalter. Der Versand läuft einmal täglich morgens.</p>
        </div>
        <Link href="/funnel/vorschau" className="au-btn au-btn-secondary">Fällige Mails prüfen &amp; senden</Link>
      </div>

      {lauf && (
        <div className="au-banner au-banner-success">
          Lauf abgeschlossen: {geprueft} aktive Funnel-Mails geprüft, {gesendet} verschickt, {uebersprungen} bereits
          zuvor verschickt (übersprungen), {fehler} Fehler.
        </div>
      )}
      {gespeichert && <div className="au-banner au-banner-success">Gespeichert.</div>}

      <div className="au-funnel-raster">
        <aside className="au-panel au-funnel-links">
          <div className="au-funnel-links-aktionen">
            <Link href="/funnel?mail=neu" data-funnel-link className={`au-btn au-btn-primary au-btn-sm${modus === "neu" ? " aktiv" : ""}`}>+ Neue Mail</Link>
            <Link href="/funnel?mail=import" data-funnel-link className="au-btn au-btn-secondary au-btn-sm">Import</Link>
          </div>
          <TerminWahl
            termine={terminListe.map((t) => ({ id: t.id, label: `${formatDatum(t.datum_start)} · ${t.kennung || t.titel}` }))}
            gewaehlt={beispiel?.id || null}
            mailParam={mailParam || null}
          />
          <FunnelZeitstrahl mails={zeitstrahlMails} auswahlId={ausgewaehlt?.id || null} hrefFuer={hrefFuer} dauerTage={dauerTage} heuteOffset={heuteOffset} />
          {geloeschte.length > 0 && (
            <details className="au-funnel-papierkorb">
              <summary className="au-klein">Papierkorb ({geloeschte.length})</summary>
              {geloeschte.map((f: any) => (
                <div key={f.id} className="au-funnel-papierkorb-zeile">
                  <span>{f.name} <span className="au-klein">· {formatDatum(f.geloescht_am)}</span></span>
                  <form action={stelleFunnelMailWiederHer}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="au-link">wiederherstellen</button>
                  </form>
                </div>
              ))}
            </details>
          )}
        </aside>

        <section className="au-panel au-funnel-rechts">
          {modus === "neu" && (
            <>
              <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Neue Funnel-Mail</h2></div>
              <div className="au-funnel-rechts-inhalt">
                <p className="au-klein" style={{ marginTop: 0 }}>Wird inaktiv angelegt. Nach dem Aktivieren geht sie nur für Stichtage ab dem Aktivierungstag raus – nie rückwirkend.</p>
                <FunnelEditor key="neu" mail={null} trigger={triggerOptionen} platzhalter={PLATZHALTER_HILFE} speichernAction={createFunnelMail} />
              </div>
            </>
          )}

          {modus === "import" && (
            <>
              <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Mail aus Text importieren</h2></div>
              <div className="au-funnel-rechts-inhalt">
                <FunnelImport
                  felder={PLATZHALTER_HILFE.map((p) => ({ key: p.key.replace(/[{}]/g, ""), beschreibung: p.beschreibung }))}
                  trigger={triggerOptionen}
                  importAction={importiereFunnelMail}
                />
              </div>
            </>
          )}

          {modus === "mail" && !ausgewaehlt && (
            <div className="au-funnel-rechts-inhalt">
              <p>Noch keine Funnel-Mails. <Link href="/funnel?mail=neu">Erste Mail anlegen</Link></p>
            </div>
          )}

          {ausgewaehlt && (
            <>
              <div className="au-panel-kopf">
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0 }}>{ausgewaehlt.name}</h2>
                  <div className="au-klein" style={{ marginTop: "0.2rem" }}>
                    {versandAnzahl ? `${versandAnzahl}× verschickt, zuletzt ${formatDatum(versandDerMail![0].gesendet_am)}` : "noch nie verschickt"}
                  </div>
                </div>
                <div className="au-funnel-kopf-aktionen">
                  {istSystem ? (
                    <span className="au-badge au-badge-neutral">System</span>
                  ) : (
                    <form action={toggleFunnelMailAktiv}>
                      <input type="hidden" name="id" value={ausgewaehlt.id} />
                      <input type="hidden" name="aktiv_neu" value={String(!ausgewaehlt.aktiv)} />
                      <button type="submit" className={`au-funnel-schalter${ausgewaehlt.aktiv ? " an" : ""}`} aria-pressed={ausgewaehlt.aktiv}>
                        <span className="au-funnel-schalter-knopf" aria-hidden="true" />
                        {ausgewaehlt.aktiv ? "Aktiv" : "Inaktiv"}
                      </button>
                    </form>
                  )}
                  {!istSystem && (
                    <form action={deleteFunnelMail}>
                      <input type="hidden" name="id" value={ausgewaehlt.id} />
                      <button type="submit" className="au-btn au-btn-danger au-btn-sm" title="Kommt in den Papierkorb – die Versand-Historie bleibt erhalten">Löschen</button>
                    </form>
                  )}
                </div>
              </div>
              <div className="au-funnel-rechts-inhalt">
                {istSystem ? (
                  <div className="au-banner au-banner-warning" style={{ marginTop: 0 }}>
                    {SYSTEM_FUNNEL_IDS[ausgewaehlt.id]} – „aktiv“ spielt dafür keine Rolle, bitte inaktiv lassen. Text und Betreff hier bearbeiten wirkt trotzdem.
                  </div>
                ) : ausgewaehlt.aktiv && ausgewaehlt.aktiviert_am ? (
                  <p className="au-klein" style={{ marginTop: 0 }}>Aktiv seit {formatDatum(ausgewaehlt.aktiviert_am)} – verschickt nur für Stichtage ab diesem Tag.</p>
                ) : null}
                <FunnelEditor key={ausgewaehlt.id + (ausgewaehlt.aktualisiert_am || "")} mail={ausgewaehlt} trigger={triggerOptionen} platzhalter={PLATZHALTER_HILFE} speichernAction={updateFunnelMail} />
              </div>
            </>
          )}
        </section>
      </div>

      <div className="au-card" style={{ marginTop: "1.5rem" }}>
        <h2>Letzte Versendungen</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          Zustellung/Öffnung/Klick werden von Resend per Webhook gemeldet (nur bei aktivierter Tracking-Domain,
          siehe Einrichtung auf der Seite „E-Mail-Versand testen“). Bis zur Einrichtung bleiben diese Spalten leer.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Funnel-Mail</th>
              <th>Empfänger</th>
              <th>Status</th>
              <th>Zugestellt</th>
              <th>Geöffnet (erste / letzte)</th>
              <th>Geklickt (erste / letzte)</th>
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
                  {l.bounced_am && <span className="au-badge au-badge-danger" style={{ marginLeft: "0.35rem" }}>Bounce</span>}
                  {l.beschwerde_am && <span className="au-badge au-badge-danger" style={{ marginLeft: "0.35rem" }}>Beschwerde</span>}
                </td>
                <td style={{ fontSize: "0.85rem" }}>{l.zugestellt_am ? formatDatumZeit(l.zugestellt_am) : "—"}</td>
                <td style={{ fontSize: "0.85rem" }}>
                  {l.geoeffnet_am ? (
                    <>
                      {formatDatumZeit(l.geoeffnet_am)}
                      {l.anzahl_oeffnungen > 1 && (
                        <div style={{ color: "var(--color-text-muted)" }}>
                          zuletzt {formatDatumZeit(l.zuletzt_geoeffnet_am)} ({l.anzahl_oeffnungen}×)
                        </div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ fontSize: "0.85rem" }}>
                  {l.geklickt_am ? (
                    <>
                      {formatDatumZeit(l.geklickt_am)}
                      {l.anzahl_klicks > 1 && (
                        <div style={{ color: "var(--color-text-muted)" }}>
                          zuletzt {formatDatumZeit(l.zuletzt_geklickt_am)} ({l.anzahl_klicks}×)
                        </div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{l.fehlermeldung || "—"}</td>
              </tr>
            ))}
            {!log?.length && (
              <tr className="au-table-empty"><td colSpan={8}>Noch keine Mails verschickt.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
