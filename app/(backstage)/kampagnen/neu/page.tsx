export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { erstelleKampagne } from "@/lib/actions";
import { ladeTeilnehmerFuerFilter, TEILNAHME_STAND_LABEL, type FilterKriterien } from "@/lib/kampagnen";
import { ladeBausteine } from "@/lib/mail-bausteine";
import InhaltMitLinkCheck from "./InhaltMitLinkCheck";

export default async function NeueKampagnePage({
  searchParams,
}: {
  searchParams: Promise<{
    anrede?: string;
    rolle?: string;
    seminartypen?: string;
    unternehmer_status?: string;
    segment_id?: string;
    kategorie2?: string;
    kategorie2_modus?: string;
    teilnahme_stand?: string;
    netzwerk_mitglied?: string;
    tags?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: segmente } = await supabase.from("teilnehmer_segmente").select("*").order("erstellt_am", { ascending: false });
  const { data: seminartypen } = await supabase.from("seminartypen").select("name").order("name");
  const { data: tags } = await supabase.from("tags").select("id, label").eq("aktiv", true).order("label");

  let filter: FilterKriterien;
  let aktivesSegment: { id: string; name: string } | null = null;

  if (sp.segment_id) {
    const segment = (segmente || []).find((s: any) => s.id === sp.segment_id);
    if (segment) {
      filter = segment.filter_kriterien || {};
      aktivesSegment = { id: segment.id, name: segment.name };
    } else {
      filter = {};
    }
  } else {
    filter = {
      anrede: sp.anrede ? [sp.anrede] : [],
      rolle: sp.rolle ? [sp.rolle] : [],
      seminartypen: sp.seminartypen ? [sp.seminartypen] : [],
      unternehmer_status: sp.unternehmer_status ? [sp.unternehmer_status] : [],
      kategorie2: sp.kategorie2 || undefined,
      kategorie2_modus: sp.kategorie2_modus === "nicht_besucht" ? "nicht_besucht" : "besucht",
      teilnahme_stand: sp.teilnahme_stand ? [sp.teilnahme_stand] : [],
      netzwerk_mitglied: sp.netzwerk_mitglied === "ja" || sp.netzwerk_mitglied === "nein" ? sp.netzwerk_mitglied : undefined,
      tags: sp.tags ? [sp.tags] : [],
    };
  }

  const [empfaenger, bausteine] = await Promise.all([ladeTeilnehmerFuerFilter(filter), ladeBausteine(supabase)]);

  const anredeWert = filter.anrede?.[0] || "";
  const rolleWert = filter.rolle?.[0] || "";
  const seminarWert = filter.seminartypen?.[0] || "";
  const unternehmerWert = filter.unternehmer_status?.[0] || "";
  const kategorie2Wert = filter.kategorie2 || "";
  const kategorie2Modus = filter.kategorie2_modus || "besucht";
  const teilnahmeWert = filter.teilnahme_stand?.[0] || "";
  const netzwerkWert = filter.netzwerk_mitglied || "";
  const tagWert = filter.tags?.[0] || "";
  const ruhend = empfaenger.filter((e) => e.vermutlichRuhend).length;

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            <Link href="/kampagnen" className="au-panel-link">← Kampagnen</Link>
          </p>
          <h1>Neue Kampagne</h1>
        </div>
        <ol className="au-schritte" aria-label="Ablauf">
          <li className="aktiv">1 · Empfänger</li>
          <li className="aktiv">2 · Inhalt</li>
          <li>3 · Vorschau &amp; Versand</li>
        </ol>
      </header>

      <div className="au-kampagne-raster">
        <section className="au-panel">
          <div className="au-panel-kopf">
            <h2 style={{ margin: 0 }}>1 · Empfänger auswählen</h2>
            {aktivesSegment && <span className="au-badge au-badge-neutral">Filtergruppe „{aktivesSegment.name}“</span>}
          </div>
          <div className="au-kampagne-panel-inhalt">
            {segmente && segmente.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <span className="au-klein">Gespeicherte Filtergruppen</span>
                <div className="au-chips">
                  {segmente.map((s: any) => (
                    <Link key={s.id} href={`/kampagnen/neu?segment_id=${s.id}`} className={`au-chip${aktivesSegment?.id === s.id ? " aktiv" : ""}`}>
                      {s.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <form method="get" action="/kampagnen/neu">
          <div className="au-row-2">
            <div>
              <label className="au-label">Geschlecht</label>
              <select className="au-select" name="anrede" defaultValue={anredeWert}>
                <option value="">Alle</option>
                <option value="Frau">Frauen</option>
                <option value="Herr">Männer</option>
                <option value="Divers">Divers</option>
                <option value="keine_angabe">Ohne Angabe</option>
              </select>
            </div>
            <div>
              <label className="au-label">Unternehmer:in / Mitarbeiter:in</label>
              <select className="au-select" name="unternehmer_status" defaultValue={unternehmerWert}>
                <option value="">Alle</option>
                <option value="unternehmer">Unternehmer:in</option>
                <option value="mitarbeiter">Mitarbeiter:in</option>
                <option value="unbekannt">Ohne Angabe</option>
              </select>
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Rolle (Event-Funktion)</label>
              <select className="au-select" name="rolle" defaultValue={rolleWert}>
                <option value="">Alle</option>
                <option value="teilnehmer">Teilnehmer</option>
                <option value="mitarbeiter">Mitarbeiter</option>
                <option value="gastreferent">Gastreferent</option>
                <option value="organisator">Organisator</option>
              </select>
            </div>
            <div>
              <label className="au-label">Seminarkategorie besucht</label>
              <select className="au-select" name="seminartypen" defaultValue={seminarWert}>
                <option value="">Alle</option>
                {(seminartypen || []).map((s: any) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">UND außerdem …</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select className="au-select" name="kategorie2_modus" defaultValue={kategorie2Modus} style={{ maxWidth: 170 }}>
                  <option value="besucht">schon besucht</option>
                  <option value="nicht_besucht">noch nicht besucht</option>
                </select>
                <select className="au-select" name="kategorie2" defaultValue={kategorie2Wert}>
                  <option value="">– egal –</option>
                  {(seminartypen || []).map((s: any) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <p className="au-klein" style={{ marginTop: "-0.5rem" }}>Zählt nur abgeschlossene Seminare, z. B. „Preisfindung, aber noch nicht Führung“.</p>
            </div>
            <div>
              <label className="au-label">Teilnahme-Stand</label>
              <select className="au-select" name="teilnahme_stand" defaultValue={teilnahmeWert}>
                <option value="">Alle</option>
                {Object.entries(TEILNAHME_STAND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Netzwerk-Mitglied (Uplifted Agencies)</label>
              <select className="au-select" name="netzwerk_mitglied" defaultValue={netzwerkWert}>
                <option value="">Alle</option>
                <option value="ja">Ja</option>
                <option value="nein">Nein</option>
              </select>
            </div>
            <div>
              <label className="au-label">Tag</label>
              <select className="au-select" name="tags" defaultValue={tagWert} disabled={!tags?.length}>
                <option value="">{tags?.length ? "Alle" : "Noch keine Tags angelegt"}</option>
                {(tags || []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="au-kampagne-filterfuss"><button type="submit" className="au-btn au-btn-secondary au-btn-sm">Filter anwenden</button><Link href="/kampagnen/neu" className="au-link">zurücksetzen</Link></div>
        </form>
          </div>
          <div className="au-kampagne-treffer">
            <div>
              <strong className="au-kampagne-treffer-zahl">{empfaenger.length}</strong> Empfänger:innen
              <div className="au-klein">
                Nur Personen mit Marketing-Einwilligung („abonniert“); Bounces und Spam-Beschwerden werden vor dem Versand zusätzlich ausgefiltert.
                {ruhend > 0 && ` ${ruhend} davon vermutlich ruhend (nur zur Orientierung).`}
              </div>
            </div>
          </div>
          {empfaenger.length > 0 && (
            <details className="au-kampagne-empfaenger">
              <summary className="au-klein">Empfänger:innen anzeigen</summary>
              <ul>
                {empfaenger.slice(0, 50).map((e) => (
                  <li key={e.id}>
                    <span>{e.vorname} {e.nachname} <span className="au-klein">· {e.email}</span></span>
                    {e.vermutlichRuhend && <span className="au-badge au-badge-neutral" title="Grobe Heuristik: letzte Mail über 180 Tage her oder nie">vermutlich ruhend</span>}
                  </li>
                ))}
                {empfaenger.length > 50 && <li className="au-klein">… und {empfaenger.length - 50} weitere</li>}
              </ul>
            </details>
          )}
        </section>

        <section className="au-panel">
          <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>2 · Inhalt</h2></div>
          <div className="au-kampagne-panel-inhalt">
            {empfaenger.length === 0 ? (
              <p className="au-leer" style={{ margin: 0 }}>Mit diesem Filter gibt es aktuell keine Empfänger:innen. Bitte links den Filter anpassen.</p>
            ) : (
              <form action={erstelleKampagne}>
            {anredeWert && <input type="hidden" name="anrede" value={anredeWert} />}
            {rolleWert && <input type="hidden" name="rolle" value={rolleWert} />}
            {seminarWert && <input type="hidden" name="seminartypen" value={seminarWert} />}
            {unternehmerWert && <input type="hidden" name="unternehmer_status" value={unternehmerWert} />}
            {kategorie2Wert && <input type="hidden" name="kategorie2" value={kategorie2Wert} />}
            {kategorie2Wert && <input type="hidden" name="kategorie2_modus" value={kategorie2Modus} />}
            {teilnahmeWert && <input type="hidden" name="teilnahme_stand" value={teilnahmeWert} />}
            {netzwerkWert && <input type="hidden" name="netzwerk_mitglied" value={netzwerkWert} />}
            {tagWert && <input type="hidden" name="tags" value={tagWert} />}
            {aktivesSegment && <input type="hidden" name="segment_id" value={aktivesSegment.id} />}

            <label className="au-label">Name der Kampagne (intern)</label>
            <input className="au-input" name="name" required placeholder="z. B. Arbeitsgruppe Unternehmerinnen – Einladung" />

            <label className="au-label">Betreff</label>
            <input className="au-input" name="betreff" required placeholder="z. B. Einladung: Arbeitsgruppe Unternehmerinnen" />

            <label className="au-label">Betreff B (optional, A/B-Test)</label>
            <input className="au-input" name="betreff_b" placeholder="Zweite Betreffzeile – die Empfänger werden zufällig 50/50 aufgeteilt" />

            <label className="au-label">Inhalt ({"{{vorname}}"} / {"{{nachname}}"} verfügbar, Zeilenumbrüche werden übernommen)</label>
            <InhaltMitLinkCheck
              fusszeile={[
                { label: "Impressum", url: bausteine.impressum_url },
                { label: "Datenschutz", url: bausteine.datenschutz_url },
              ]}
            />

            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontWeight: 400, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
              <input type="checkbox" name="baustein_signatur" defaultChecked /> Signatur anhängen
            </label>
            <p className="au-klein" style={{ marginTop: 0 }}>
              Impressum, Datenschutz und ein persönlicher Abmeldelink kommen bei Kampagnen immer darunter (Pflicht bei Werbe-Mails). Bausteine pflegen: Funnel → Signatur &amp; Fußzeile.
            </p>

            <label className="au-label" htmlFor="mindestabstand_tage">Mindestabstand (Tage)</label>
            <input className="au-input" id="mindestabstand_tage" name="mindestabstand_tage" type="number" min={0} max={90} defaultValue={4} style={{ maxWidth: 120 }} />
            <p className="au-klein" style={{ marginTop: "-0.5rem" }}>
              Wer in den letzten X Tagen schon eine Funnel- oder Kampagnen-Mail bekommen hat, wird in der Vorschau markiert und standardmäßig
              ausgelassen. 0 = keine Sperrfrist (z. B. bei einer dringenden Programmänderung).
            </p>

            <button type="submit" className="au-btn au-btn-primary">
              Weiter zur Vorschau ({empfaenger.length} Empfänger:innen) →
            </button>
            <p className="au-klein" style={{ marginBottom: 0 }}>Verschickt wird erst im nächsten Schritt, nach ausdrücklicher Bestätigung.</p>
          </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
