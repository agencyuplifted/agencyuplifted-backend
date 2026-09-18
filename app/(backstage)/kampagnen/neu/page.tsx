export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { erstelleKampagne, zaehleKampagnenEmpfaenger, speichereTeilnehmerSegment } from "@/lib/actions";
import { ladeTeilnehmerFuerFilter, normalisiereFilter, beschreibeFilter, type FilterKriterien } from "@/lib/kampagnen";
import { parseRegeln, wirksameRegeln } from "@/lib/kampagnen-regeln";
import { formatDatum } from "@/lib/format";
import RegelBuilder from "./RegelBuilder";
import { ladeBausteine } from "@/lib/mail-bausteine";
import KampagnenInhalt from "./KampagnenInhalt";

export default async function NeueKampagnePage({
  searchParams,
}: {
  searchParams: Promise<{
    regeln?: string;
    segment_id?: string;
    schritt?: string;
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

  const schrittInhalt = sp.schritt === "inhalt" && empfaenger.length > 0;
  const tagLabel = new Map((tags || []).map((t: any) => [t.id, t.label]));
  const filterText = beschreibeFilter({ regeln }, tagLabel);
  const empfaengerHref = `/kampagnen/neu?regeln=${encodeURIComponent(regelnJson)}`;
  const fussUnvollstaendig = !bausteine.firmenangaben.trim();

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            <Link href="/kampagnen" className="au-panel-link">← Kampagnen</Link>
          </p>
          <h1>Neue Kampagne</h1>
        </div>
        <ol className="au-schritte au-schritte-gross" aria-label="Ablauf">
          <li className={schrittInhalt ? "erledigt" : "aktiv"}>
            {schrittInhalt ? <Link href={empfaengerHref}>1 · Empfänger</Link> : "1 · Empfänger"}
          </li>
          <li className={schrittInhalt ? "aktiv" : undefined}>2 · Inhalt</li>
          <li>3 · Vorschau &amp; Versand</li>
        </ol>
      </header>

      {fussUnvollstaendig && (
        <div className="au-banner au-banner-warning">
          Die Firmenangaben für die Fußzeile fehlen noch – Werbe-Mails brauchen eine vollständige Anbieterkennzeichnung.{" "}
          <Link href="/funnel?mail=bausteine">Jetzt eintragen →</Link>
        </div>
      )}

      {!schrittInhalt ? (
        <div className="au-kschritt-raster">
          <section className="au-panel">
            <div className="au-panel-kopf">
              <h2 style={{ margin: 0 }}>Wer soll die Mail bekommen?</h2>
              {aktivesSegment && <span className="au-badge au-badge-neutral">Filtergruppe „{aktivesSegment.name}“</span>}
            </div>
            <div className="au-kampagne-panel-inhalt">
              {segmente && segmente.length > 0 && (
                <div className="au-kschnellstart">
                  <span className="au-klein">Schnellstart mit gespeicherter Filtergruppe:</span>
                  <div className="au-chips">
                    {segmente.map((sg: any) => (
                      <Link key={sg.id} href={`/kampagnen/neu?segment_id=${sg.id}`} className={`au-chip${aktivesSegment?.id === sg.id ? " aktiv" : ""}`}>
                        {sg.name}
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
            </div>
          </section>

          <aside className="au-kzusammenfassung">
            <section className="au-panel">
              <div className="au-kzusammenfassung-zahl">
                <strong>{empfaenger.length}</strong>
                <span>Empfänger:innen</span>
              </div>
              <p className="au-klein" style={{ margin: "0 1.15rem 0.75rem" }}>
                Nur Personen mit Marketing-Einwilligung. Bounces, Spam-Beschwerden und Abmeldungen werden vor dem Versand zusätzlich gesperrt.
                {ruhend > 0 && ` ${ruhend} davon vermutlich ruhend.`}
              </p>
              {empfaenger.length > 0 ? (
                <ul className="au-kzusammenfassung-liste">
                  {empfaenger.slice(0, 8).map((e) => (
                    <li key={e.id}>
                      <span className="au-initialen">{`${e.vorname?.[0] || ""}${e.nachname?.[0] || ""}`.toUpperCase()}</span>
                      <span>
                        {e.vorname} {e.nachname}
                        <span className="au-klein" style={{ display: "block" }}>{e.email}</span>
                      </span>
                    </li>
                  ))}
                  {empfaenger.length > 8 && (
                    <li>
                      <details className="au-kzusammenfassung-alle">
                        <summary className="au-klein">… und {empfaenger.length - 8} weitere anzeigen</summary>
                        <ul>
                          {empfaenger.slice(8).map((e) => (
                            <li key={e.id} className="au-klein">{e.vorname} {e.nachname} · {e.email}</li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  )}
                </ul>
              ) : (
                <p className="au-leer" style={{ margin: "0 1.15rem 1rem" }}>Niemand passt auf diese Regeln.</p>
              )}
              <div className="au-kzusammenfassung-fuss">
                {empfaenger.length > 0 ? (
                  <Link href={`${empfaengerHref}&schritt=inhalt`} className="au-btn au-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                    Weiter: Inhalt schreiben →
                  </Link>
                ) : null}
                <form action={speichereTeilnehmerSegment} className="au-regeln-speichern">
                  <input type="hidden" name="regeln" value={regelnJson} />
                  <input className="au-input" name="segment_name" required placeholder="Als Filtergruppe speichern …" />
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
                </form>
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <>
          <div className="au-kempfaenger-leiste">
            <div>
              <strong>{empfaenger.length} Empfänger:innen</strong>
              <span className="au-kliste-filter" style={{ marginTop: "0.25rem" }}>
                {filterText.length ? filterText.map((f, i) => <span key={i} className={f === "oder" || f === "und" ? "au-klein" : "au-etikett"}>{f}</span>) : <span className="au-klein">alle mit Marketing-Einwilligung</span>}
              </span>
            </div>
            <Link href={empfaengerHref} className="au-btn au-btn-secondary au-btn-sm">Empfänger ändern</Link>
          </div>
          <KampagnenInhalt
            speichernAction={erstelleKampagne}
            regelnJson={regelnJson}
            segmentId={aktivesSegment?.id || null}
            anzahl={empfaenger.length}
            beispiel={empfaenger[0] ? { vorname: empfaenger[0].vorname, nachname: empfaenger[0].nachname } : null}
            bausteine={bausteine}
          />
        </>
      )}
    </main>
  );
}
