export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  createFunnelMail,
  updateFunnelMail,
  deleteFunnelMail,
  toggleFunnelMailAktiv,
  importiereFunnelMail,
  stelleFunnelMailWiederHer,
  speichereMailBausteine,
} from "@/lib/actions";
import { ladeBausteine } from "@/lib/mail-bausteine";
import BausteinEditor from "./BausteinEditor";
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

  const [{ data: alleFunnelMails }, { data: log }, { data: termine }, bausteine, { data: tagListe }, { data: seminartypListe }, { data: optionsListe }] = await Promise.all([
    supabase.from("funnel_mails").select("*").order("erstellt_am", { ascending: false }),
    supabase.from("funnel_versand_log").select("*, funnel_mails(name)").order("gesendet_am", { ascending: false }).limit(30),
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, datum_ende")
      .neq("status", "abgesagt")
      .gte("datum_start", vorVierMonaten)
      .order("datum_start")
      .limit(40),
    ladeBausteine(supabase),
    supabase.from("tags").select("id, label, aktiv").order("label"),
    supabase.from("seminartypen").select("id, name").order("name"),
    supabase.from("seminartermin_optionen").select("titel").is("deaktiviert_am", null),
  ]);
  const optionen = Array.from(new Set((optionsListe || []).map((o: any) => String(o.titel || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));
  const seminartypen = (seminartypListe || []) as { id: string; name: string }[];
  const typName = new Map(seminartypen.map((t) => [t.id, t.name]));
  const tags = (tagListe || []) as { id: string; label: string; aktiv: boolean }[];
  const funnelMails = (alleFunnelMails || [])
    .filter((f: any) => !f.geloescht_am)
    .sort((a: any, b: any) => zeitstrahlRang(a) - zeitstrahlRang(b));
  const geloeschte = (alleFunnelMails || []).filter((f: any) => f.geloescht_am);

  const modus = mailParam === "neu" ? "neu" : mailParam === "import" ? "import" : mailParam === "bausteine" ? "bausteine" : "mail";
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
    hinweis:
      [f.nur_seminartyp_id ? `nur ${typName.get(f.nur_seminartyp_id) || "Kategorie"}` : null, f.nur_optionen?.length ? `Option ${f.nur_optionen.join("/")}` : null]
        .filter(Boolean)
        .join(", ") || null,
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
          <Link href="/funnel?mail=bausteine" data-funnel-link className={`au-zs-mail au-funnel-bausteine-link${modus === "bausteine" ? " gewaehlt" : ""}`}>
            <span className="au-zs-mail-name">Signatur &amp; Fußzeile</span>
            <span className="au-zs-mail-zeit">gilt für alle Mails</span>
          </Link>
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
                <FunnelEditor key="neu" mail={null} trigger={triggerOptionen} platzhalter={PLATZHALTER_HILFE} speichernAction={createFunnelMail} bausteine={bausteine} tags={tags} seminartypen={seminartypen} optionen={optionen} />
              </div>
            </>
          )}

          {modus === "bausteine" && (
            <>
              <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Signatur &amp; Fußzeile</h2></div>
              <div className="au-funnel-rechts-inhalt">
                <BausteinEditor bausteine={bausteine} speichernAction={speichereMailBausteine} />
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
                <FunnelEditor key={ausgewaehlt.id + (ausgewaehlt.aktualisiert_am || "")} mail={ausgewaehlt} trigger={triggerOptionen} platzhalter={PLATZHALTER_HILFE} speichernAction={updateFunnelMail} bausteine={bausteine} tags={tags} seminartypen={seminartypen} optionen={optionen} istSystem={istSystem} />
              </div>
            </>
          )}
        </section>
      </div>

      <section className="au-panel au-versand">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Letzte Versendungen</h2>
          <span className="au-klein">Zustellung, Öffnen und Klicks meldet Resend (sofern Tracking aktiv ist)</span>
        </div>
        {(log || []).length === 0 ? (
          <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Noch keine Mails verschickt.</p>
        ) : (
          <ul className="au-versand-liste">
            {(log || []).map((l: any) => (
              <li key={l.id} className={l.status === "fehler" || l.bounced_am || l.beschwerde_am ? "problem" : undefined}>
                <span className="au-versand-datum">{formatDatumZeit(l.gesendet_am)}</span>
                <span className="au-versand-wer">
                  <span className="au-versand-mail">{l.funnel_mails?.name || "—"}</span>
                  <span className="au-versand-an">{l.empfaenger_email}</span>
                  {l.fehlermeldung && <span className="au-versand-fehler">{l.fehlermeldung}</span>}
                </span>
                <span className="au-versand-status">
                  {l.status === "fehler" ? (
                    <span className="au-badge au-badge-danger">Fehler</span>
                  ) : (
                    <>
                      <span className={`au-versand-schritt${l.zugestellt_am ? " an" : ""}`} title={l.zugestellt_am ? `Zugestellt ${formatDatumZeit(l.zugestellt_am)}` : "Zustellung noch nicht gemeldet"}>Zugestellt</span>
                      <span className={`au-versand-schritt${l.geoeffnet_am ? " an" : ""}`} title={l.geoeffnet_am ? `Zuerst ${formatDatumZeit(l.geoeffnet_am)}${l.zuletzt_geoeffnet_am ? `, zuletzt ${formatDatumZeit(l.zuletzt_geoeffnet_am)}` : ""}` : "Nicht geöffnet"}>
                        Geöffnet{l.anzahl_oeffnungen > 1 ? ` ${l.anzahl_oeffnungen}×` : ""}
                      </span>
                      <span className={`au-versand-schritt${l.geklickt_am ? " an" : ""}`} title={l.geklickt_am ? `Zuerst ${formatDatumZeit(l.geklickt_am)}` : "Kein Klick"}>
                        Geklickt{l.anzahl_klicks > 1 ? ` ${l.anzahl_klicks}×` : ""}
                      </span>
                    </>
                  )}
                  {l.bounced_am && <span className="au-badge au-badge-danger">Bounce</span>}
                  {l.beschwerde_am && <span className="au-badge au-badge-danger">Beschwerde</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
