export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { erstelleKampagne, zaehleKampagnenEmpfaenger, speichereTeilnehmerSegment } from "@/lib/actions";
import { ladeTeilnehmerFuerFilter, normalisiereFilter, type FilterKriterien } from "@/lib/kampagnen";
import { parseRegeln, wirksameRegeln } from "@/lib/kampagnen-regeln";
import { formatDatum } from "@/lib/format";
import RegelBuilder from "./RegelBuilder";
import { ladeBausteine } from "@/lib/mail-bausteine";
import InhaltMitLinkCheck from "./InhaltMitLinkCheck";

export default async function NeueKampagnePage({
  searchParams,
}: {
  searchParams: Promise<{
    regeln?: string;
    segment_id?: string;
    // Alte Einzelparameter (z. B. "Kampagne aus Auswahl" in der Teilnehmer-Liste)
    anrede?: string;
    rolle?: string;
    seminartypen?: string;
    unternehmer_status?: string;
    tags?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = getSupabaseAdmin();

  const vorDreiJahren = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: segmente }, { data: seminartypen }, { data: tags }, { data: termine }, { data: alteKampagnen }, { data: optionsListe }] = await Promise.all([
    supabase.from("teilnehmer_segmente").select("*").order("erstellt_am", { ascending: false }),
    supabase.from("seminartypen").select("name").order("name"),
    supabase.from("tags").select("id, label").eq("aktiv", true).order("label"),
    supabase.from("seminartermine").select("id, kennung, titel, datum_start").gte("datum_start", vorDreiJahren).order("datum_start", { ascending: false }),
    supabase.from("kampagnen").select("id, name, versendet_am").eq("status", "versendet").order("versendet_am", { ascending: false }),
    supabase.from("seminartermin_optionen").select("titel").is("deaktiviert_am", null),
  ]);
  const optionsTitel = Array.from(new Set((optionsListe || []).map((o: any) => String(o.titel || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "de"));

  let filter: FilterKriterien;
  let aktivesSegment: { id: string; name: string } | null = null;
  const segment = sp.segment_id ? (segmente || []).find((s: any) => s.id === sp.segment_id) : null;
  if (sp.regeln) {
    filter = { regeln: parseRegeln(sp.regeln) || undefined };
  } else if (segment) {
    filter = segment.filter_kriterien || {};
    aktivesSegment = { id: segment.id, name: segment.name };
  } else {
    filter = {
      anrede: sp.anrede ? [sp.anrede] : [],
      rolle: sp.rolle ? [sp.rolle] : [],
      seminartypen: sp.seminartypen ? [sp.seminartypen] : [],
      unternehmer_status: sp.unternehmer_status ? [sp.unternehmer_status] : [],
      tags: sp.tags ? [sp.tags] : [],
    };
  }
  // Alles in Regeln uebersetzen -- ab hier gibt es nur noch den Baukasten
  const regeln = normalisiereFilter(filter);
  const regelnJson = JSON.stringify(wirksameRegeln(regeln));

  const [empfaenger, bausteine] = await Promise.all([ladeTeilnehmerFuerFilter({ regeln }), ladeBausteine(supabase)]);
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
            <RegelBuilder
              key={regelnJson}
              start={regeln}
              seminartypen={(seminartypen || []).map((t: any) => t.name)}
              tags={(tags || []) as any[]}
              termine={(termine || []).map((t: any) => ({ id: t.id, label: `${t.kennung || t.titel} · ${formatDatum(t.datum_start)}` }))}
              kampagnen={(alteKampagnen || []).map((k: any) => ({ id: k.id, label: `${k.name}${k.versendet_am ? ` · ${formatDatum(k.versendet_am)}` : ""}` }))}
              optionen={optionsTitel}
              zaehlen={zaehleKampagnenEmpfaenger}
              angewendetAnzahl={empfaenger.length}
            />
            <form action={speichereTeilnehmerSegment} className="au-regeln-speichern">
              <input type="hidden" name="regeln" value={regelnJson} />
              <input className="au-input" name="segment_name" required placeholder="Als Filtergruppe speichern, z. B. „Preisfindung ohne Führung“" />
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
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
            <input type="hidden" name="regeln" value={regelnJson} />
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
