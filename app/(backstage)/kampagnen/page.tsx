export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatDatumZeit } from "@/lib/format";
import { loescheKampagnenEntwurf, dupliziereKampagne } from "@/lib/actions";
import { beschreibeFilter, type FilterKriterien } from "@/lib/kampagnen";
import { ladeBausteine } from "@/lib/mail-bausteine";

type Stats = { gesendet: number; fehler: number; geoeffnet: number; geklickt: number; uebersprungen: number; bounces: number };
const LEER: Stats = { gesendet: 0, fehler: 0, geoeffnet: 0, geklickt: 0, uebersprungen: 0, bounces: 0 };

const prozent = (teil: number, ganz: number) => (ganz ? Math.round((teil / ganz) * 100) : 0);

export default async function KampagnenPage({
  searchParams,
}: {
  searchParams: Promise<{ versendet?: string; gesendet?: string; fehler?: string; uebersprungen?: string; geplant?: string }>;
}) {
  const { versendet, gesendet, fehler, uebersprungen, geplant } = await searchParams;
  const supabase = getSupabaseAdmin();

  const [{ data: kampagnen }, { data: logZeilen }, { data: segmente }, { data: tags }, { count: abmeldungen }, bausteine] = await Promise.all([
    supabase.from("kampagnen").select("*").order("erstellt_am", { ascending: false }),
    supabase.from("kampagnen_versand_log").select("kampagne_id, status, geoeffnet_am, geklickt_am, bounced_am").limit(50000),
    supabase.from("teilnehmer_segmente").select("id, name, filter_kriterien").order("name"),
    supabase.from("tags").select("id, label"),
    supabase.from("mail_abmeldungen").select("email", { count: "exact", head: true }),
    ladeBausteine(supabase),
  ]);
  const tagLabel = new Map((tags || []).map((t: any) => [t.id, t.label]));

  const statsProKampagne = new Map<string, Stats>();
  (logZeilen || []).forEach((z: any) => {
    const s = { ...(statsProKampagne.get(z.kampagne_id) || LEER) };
    if (z.status === "gesendet") s.gesendet++;
    if (z.status === "fehler") s.fehler++;
    if (z.status === "uebersprungen_frequency_cap") s.uebersprungen++;
    if (z.geoeffnet_am) s.geoeffnet++;
    if (z.geklickt_am) s.geklickt++;
    if (z.bounced_am) s.bounces++;
    statsProKampagne.set(z.kampagne_id, s);
  });

  const entwuerfe = (kampagnen || []).filter((k: any) => k.status === "entwurf");
  const geplante = (kampagnen || [])
    .filter((k: any) => k.status === "geplant" || k.status === "wird_versendet")
    .sort((x: any, y: any) => String(x.geplant_fuer || "").localeCompare(String(y.geplant_fuer || "")));
  const versendetListe = (kampagnen || []).filter((k: any) => k.status === "versendet");
  const summe = versendetListe.reduce(
    (acc: Stats, k: any) => {
      const s = statsProKampagne.get(k.id) || LEER;
      return { gesendet: acc.gesendet + s.gesendet, fehler: acc.fehler + s.fehler, geoeffnet: acc.geoeffnet + s.geoeffnet, geklickt: acc.geklickt + s.geklickt, uebersprungen: acc.uebersprungen + s.uebersprungen, bounces: acc.bounces + s.bounces };
    },
    LEER
  );
  const fussUnvollstaendig = !bausteine.firmenangaben.trim();

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            {versendetListe.length} versendet · {entwuerfe.length} {entwuerfe.length === 1 ? "Entwurf" : "Entwürfe"}
          </p>
          <h1>Kampagnen</h1>
        </div>
        <div className="au-dash-aktionen">
          <Link href="/kampagnen/neu" className="au-btn au-btn-primary au-btn-sm">+ Neue Kampagne</Link>
        </div>
      </header>

      {versendet && (
        <div className="au-banner au-banner-success">
          Kampagne versendet: {gesendet} E-Mail(s) verschickt, {fehler} Fehler{Number(uebersprungen) > 0 ? `, ${uebersprungen} wegen Sperrfrist ausgelassen` : ""}.
        </div>
      )}
      {geplant && <div className="au-banner au-banner-success">Kampagne eingeplant – sie geht zum gewählten Zeitpunkt automatisch raus.</div>}
      {fussUnvollstaendig && (
        <div className="au-banner au-banner-warning">
          Die Firmenangaben für die Fußzeile fehlen noch – Werbe-Mails brauchen eine vollständige Anbieterkennzeichnung.{" "}
          <Link href="/funnel?mail=bausteine">Jetzt unter Signatur &amp; Fußzeile eintragen →</Link>
        </div>
      )}

      <div className="au-kennzahlen">
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Mails verschickt</div>
          <div className="au-kennzahl-wert">{summe.gesendet}</div>
          <div className="au-kennzahl-kontext">aus {versendetListe.length} Kampagnen{summe.fehler ? ` · ${summe.fehler} Fehler` : ""}</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Öffnungsrate</div>
          <div className="au-kennzahl-wert">{summe.gesendet ? `${prozent(summe.geoeffnet, summe.gesendet)} %` : "—"}</div>
          <div className="au-kennzahl-kontext">{summe.geoeffnet} geöffnet · Apple-Mail zählt oft automatisch mit</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Klickrate</div>
          <div className="au-kennzahl-wert">{summe.gesendet ? `${prozent(summe.geklickt, summe.gesendet)} %` : "—"}</div>
          <div className="au-kennzahl-kontext">{summe.geklickt} mit mindestens einem Klick</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Abgemeldet per Link</div>
          <div className="au-kennzahl-wert">{abmeldungen || 0}</div>
          <div className="au-kennzahl-kontext">{summe.uebersprungen} wegen Sperrfrist ausgelassen</div>
        </div>
      </div>

      <div className="au-dash-raster">
        <div className="au-dash-haupt">
          {geplante.length > 0 && (
            <section className="au-panel">
              <div className="au-panel-kopf">
                <h2 style={{ margin: 0 }}>Geplant</h2>
                <span className="au-klein">{geplante.length}</span>
              </div>
              <ul className="au-kliste">
                {geplante.map((k: any) => (
                  <li key={k.id}>
                    <div className="au-kliste-haupt">
                      <Link href={`/kampagnen/${k.id}/vorschau`} className="au-kliste-name">{k.name}</Link>
                      <span className="au-kliste-betreff">{k.betreff}</span>
                    </div>
                    <div className="au-kliste-aktionen">
                      {k.status === "wird_versendet" ? (
                        <span className="au-badge au-badge-warning">Versand läuft / unterbrochen</span>
                      ) : (
                        <span className="au-badge au-badge-neutral">
                          {k.geplant_fuer_b ? `A ${formatDatumZeit(k.geplant_fuer)} · B ${formatDatumZeit(k.geplant_fuer_b)}` : formatDatumZeit(k.geplant_fuer)}
                        </span>
                      )}
                      <Link href={`/kampagnen/${k.id}/vorschau`} className="au-panel-link">öffnen →</Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="au-panel">
            <div className="au-panel-kopf">
              <h2 style={{ margin: 0 }}>Entwürfe</h2>
              <span className="au-klein">{entwuerfe.length}</span>
            </div>
            {entwuerfe.length === 0 ? (
              <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>
                Keine offenen Entwürfe. <Link href="/kampagnen/neu">Neue Kampagne anlegen</Link>
              </p>
            ) : (
              <ul className="au-kliste">
                {entwuerfe.map((k: any) => {
                  const filter = beschreibeFilter((k.filter_kriterien || {}) as FilterKriterien, tagLabel);
                  return (
                    <li key={k.id}>
                      <div className="au-kliste-haupt">
                        <Link href={`/kampagnen/${k.id}/vorschau`} className="au-kliste-name">{k.name}</Link>
                        <span className="au-kliste-betreff">{k.betreff}</span>
                        <span className="au-kliste-filter">
                          {filter.length ? filter.map((f) => <span key={f} className="au-etikett">{f}</span>) : <span className="au-klein">alle Teilnehmer</span>}
                          <span className="au-klein">· angelegt {formatDatum(k.erstellt_am)} · Sperrfrist {k.mindestabstand_tage ?? 4} T.</span>
                        </span>
                      </div>
                      <div className="au-kliste-aktionen">
                        <Link href={`/kampagnen/neu?kampagne=${k.id}&schritt=inhalt`} className="au-panel-link">bearbeiten</Link>
                        <Link href={`/kampagnen/${k.id}/vorschau`} className="au-btn au-btn-primary au-btn-sm">Vorschau &amp; Versand →</Link>
                        <form action={dupliziereKampagne}>
                          <input type="hidden" name="id" value={k.id} />
                          <button type="submit" className="au-link">duplizieren</button>
                        </form>
                        <form action={loescheKampagnenEntwurf}>
                          <input type="hidden" name="id" value={k.id} />
                          <button type="submit" className="au-link-danger">löschen</button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="au-panel">
            <div className="au-panel-kopf">
              <h2 style={{ margin: 0 }}>Versendet</h2>
              <span className="au-klein">Öffnungen und Klicks meldet Resend laufend nach</span>
            </div>
            {versendetListe.length === 0 ? (
              <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Noch keine Kampagne versendet.</p>
            ) : (
              <ul className="au-kliste">
                {versendetListe.map((k: any) => {
                  const s = statsProKampagne.get(k.id) || LEER;
                  const filter = beschreibeFilter((k.filter_kriterien || {}) as FilterKriterien, tagLabel);
                  return (
                    <li key={k.id}>
                      <div className="au-kliste-haupt">
                        <Link href={`/kampagnen/${k.id}`} className="au-kliste-name">{k.name}</Link>
                        <span className="au-kliste-betreff">{k.betreff}</span>
                        <span className="au-kliste-filter">
                          {filter.map((f) => <span key={f} className="au-etikett">{f}</span>)}
                          <span className="au-klein">{k.versendet_am ? formatDatumZeit(k.versendet_am) : "—"}</span>
                        </span>
                      </div>
                      <div className="au-kliste-werte">
                        <div className="au-kliste-wert">
                          <strong>{s.gesendet}</strong>
                          <span>verschickt</span>
                        </div>
                        <div className="au-kliste-wert">
                          <strong>{prozent(s.geoeffnet, s.gesendet)} %</strong>
                          <span>geöffnet</span>
                          <i className="au-kliste-balken"><b style={{ width: `${prozent(s.geoeffnet, s.gesendet)}%` }} /></i>
                        </div>
                        <div className="au-kliste-wert">
                          <strong>{prozent(s.geklickt, s.gesendet)} %</strong>
                          <span>geklickt</span>
                          <i className="au-kliste-balken"><b style={{ width: `${prozent(s.geklickt, s.gesendet)}%` }} /></i>
                        </div>
                        <form action={dupliziereKampagne} className="au-kliste-dup">
                          <input type="hidden" name="id" value={k.id} />
                          <button type="submit" className="au-link" title="Als neuen Entwurf mit gleichem Text und gleichen Empfänger-Regeln anlegen">duplizieren</button>
                        </form>
                        {(s.fehler > 0 || s.bounces > 0 || s.uebersprungen > 0) && (
                          <div className="au-kliste-hinweise">
                            {s.fehler > 0 && <span className="au-badge au-badge-danger">{s.fehler} Fehler</span>}
                            {s.bounces > 0 && <span className="au-badge au-badge-danger">{s.bounces} Bounce</span>}
                            {s.uebersprungen > 0 && <span className="au-badge au-badge-warning" title="Wegen Mindestabstand ausgelassen">{s.uebersprungen} Sperrfrist</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="au-dash-seite">
          <section className="au-panel">
            <div className="au-panel-kopf">
              <h2 style={{ margin: 0 }}>Filtergruppen</h2>
              <Link href="/teilnehmer" className="au-panel-link">in Teilnehmern anlegen →</Link>
            </div>
            {segmente?.length ? (
              <ul className="au-kliste au-kliste-kompakt">
                {segmente.map((sg: any) => (
                  <li key={sg.id}>
                    <div className="au-kliste-haupt">
                      <Link href={`/kampagnen/neu?segment_id=${sg.id}`} className="au-kliste-name">{sg.name}</Link>
                      <span className="au-kliste-filter">
                        {beschreibeFilter((sg.filter_kriterien || {}) as FilterKriterien, tagLabel).map((f) => (
                          <span key={f} className="au-etikett">{f}</span>
                        ))}
                      </span>
                    </div>
                    <Link href={`/kampagnen/neu?segment_id=${sg.id}`} className="au-panel-link">Kampagne →</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>
                Noch keine. In der Teilnehmer-Liste filtern und „Als Filtergruppe speichern“.
              </p>
            )}
          </section>

          <section className="au-panel">
            <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Gut zu wissen</h2></div>
            <ul className="au-kampagne-regeln">
              <li><strong>Sperrfrist:</strong> Wer in den letzten Tagen schon eine Mail bekommen hat, wird standardmäßig ausgelassen und protokolliert.</li>
              <li><strong>Fußzeile:</strong> Impressum, Datenschutz und persönlicher Abmeldelink hängen immer dran. <Link href="/funnel?mail=bausteine">Bausteine bearbeiten</Link></li>
              <li><strong>Nur mit Einwilligung:</strong> Kampagnen gehen ausschließlich an „abonniert“. Abgemeldete, Bounces und Spam-Beschwerden sind gesperrt.</li>
              <li><strong>Automatische Mails</strong> (Erinnerungen, Anschluss-Angebote) laufen über die <Link href="/funnel">Funnel-Mails</Link>.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
