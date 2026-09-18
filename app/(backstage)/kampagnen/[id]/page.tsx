export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatumZeit } from "@/lib/format";
import { erstelleNachfassKampagne } from "@/lib/actions";
import { beschreibeFilter, type FilterKriterien } from "@/lib/kampagnen";

const prozent = (teil: number, ganz: number) => (ganz ? Math.round((teil / ganz) * 100) : 0);

// Auswertung einer versendeten Kampagne: Raten, A/B-Vergleich, Links, Empfaenger.
export default async function KampagnenAuswertung({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ zeige?: string }> }) {
  const { id } = await params;
  const { zeige = "alle" } = await searchParams;
  const supabase = getSupabaseAdmin();
  const { data: k } = await supabase.from("kampagnen").select("*").eq("id", id).maybeSingle();
  if (!k) notFound();
  if (k.status !== "versendet") redirect(`/kampagnen/${id}/vorschau`);

  const log: any[] = [];
  for (let von = 0; ; von += 1000) {
    const { data } = await supabase
      .from("kampagnen_versand_log")
      .select("*, teilnehmer(vorname, nachname)")
      .eq("kampagne_id", id)
      .order("empfaenger_email")
      .range(von, von + 999);
    log.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const ids = log.map((l) => l.resend_email_id).filter(Boolean);
  const klicks: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase.from("mail_klicks").select("resend_email_id, link").in("resend_email_id", ids.slice(i, i + 100));
    klicks.push(...(data || []));
  }
  const { data: tags } = await supabase.from("tags").select("id, label");
  const tagLabel = new Map((tags || []).map((t: any) => [t.id, t.label]));

  const gesendet = log.filter((l) => l.status === "gesendet");
  const geoeffnet = gesendet.filter((l) => l.geoeffnet_am);
  const geklickt = gesendet.filter((l) => l.geklickt_am);
  const nichtGeoeffnet = gesendet.filter((l) => !l.geoeffnet_am);
  const problem = log.filter((l) => l.status === "fehler" || l.bounced_am || l.beschwerde_am);
  const uebersprungen = log.filter((l) => l.status === "uebersprungen_frequency_cap");

  const variante = (v: "A" | "B") => {
    const g = gesendet.filter((l) => l.variante === v);
    return { anzahl: g.length, geoeffnet: g.filter((l) => l.geoeffnet_am).length, geklickt: g.filter((l) => l.geklickt_am).length };
  };
  const a = variante("A");
  const b = variante("B");

  // Klicks pro Link: Gesamtklicks und wie viele verschiedene Personen
  const linkStats = new Map<string, { klicks: number; personen: Set<string> }>();
  for (const kl of klicks) {
    const s = linkStats.get(kl.link) || { klicks: 0, personen: new Set<string>() };
    s.klicks++;
    s.personen.add(kl.resend_email_id);
    linkStats.set(kl.link, s);
  }
  const links = [...linkStats.entries()].sort((x, y) => y[1].personen.size - x[1].personen.size);

  const liste =
    zeige === "geoeffnet" ? geoeffnet : zeige === "geklickt" ? geklickt : zeige === "nicht_geoeffnet" ? nichtGeoeffnet : zeige === "probleme" ? [...problem, ...uebersprungen] : log;
  const reiter: [string, string, number][] = [
    ["alle", "Alle", log.length],
    ["geoeffnet", "Geöffnet", geoeffnet.length],
    ["geklickt", "Geklickt", geklickt.length],
    ["nicht_geoeffnet", "Nicht geöffnet", nichtGeoeffnet.length],
    ["probleme", "Probleme & ausgelassen", problem.length + uebersprungen.length],
  ];

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            <Link href="/kampagnen" className="au-panel-link">← Kampagnen</Link> · versendet {k.versendet_am ? formatDatumZeit(k.versendet_am) : "—"}
          </p>
          <h1>{k.name}</h1>
          <div className="au-kliste-filter">
            {beschreibeFilter((k.filter_kriterien || {}) as FilterKriterien, tagLabel).map((f) => (
              <span key={f} className="au-etikett">{f}</span>
            ))}
          </div>
        </div>
        <div className="au-dash-aktionen">
          {nichtGeoeffnet.length > 0 && (
            <form action={erstelleNachfassKampagne}>
              <input type="hidden" name="id" value={k.id} />
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm" title="Legt einen Entwurf an – du kannst Betreff und Text vor dem Versand ändern">
                Nochmal an {nichtGeoeffnet.length} Nicht-Öffner …
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="au-kennzahlen">
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Verschickt</div>
          <div className="au-kennzahl-wert">{gesendet.length}</div>
          <div className="au-kennzahl-kontext">{uebersprungen.length ? `${uebersprungen.length} wegen Sperrfrist ausgelassen` : "niemand ausgelassen"}</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Geöffnet</div>
          <div className="au-kennzahl-wert">{prozent(geoeffnet.length, gesendet.length)} %</div>
          <div className="au-kennzahl-kontext">{geoeffnet.length} Personen · Apple Mail zählt oft automatisch mit</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Geklickt</div>
          <div className="au-kennzahl-wert">{prozent(geklickt.length, gesendet.length)} %</div>
          <div className="au-kennzahl-kontext">{geklickt.length} Personen · {klicks.length} Klicks</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Probleme</div>
          <div className="au-kennzahl-wert">{problem.length}</div>
          <div className="au-kennzahl-kontext">
            {log.filter((l) => l.bounced_am).length} Bounce · {log.filter((l) => l.beschwerde_am).length} Spam · {log.filter((l) => l.status === "fehler").length} Fehler
          </div>
        </div>
      </div>

      <div className="au-dash-raster">
        <div className="au-dash-haupt">
          <section className="au-panel">
            <div className="au-panel-kopf">
              <h2 style={{ margin: 0 }}>Empfänger:innen</h2>
            </div>
            <nav className="au-kampagne-reiter" aria-label="Filter">
              {reiter.map(([key, label, n]) => (
                <Link key={key} href={`/kampagnen/${id}?zeige=${key}`} className={`au-chip${zeige === key ? " aktiv" : ""}`} scroll={false}>
                  {label} {n}
                </Link>
              ))}
            </nav>
            <ul className="au-kampagne-empfaengerliste" style={{ maxHeight: 640 }}>
              {liste.map((l) => (
                <li key={l.id}>
                  <span>
                    {l.teilnehmer ? `${l.teilnehmer.vorname} ${l.teilnehmer.nachname}` : l.empfaenger_email}
                    <span className="au-klein"> · {l.empfaenger_email}</span>
                    {l.fehlermeldung && <span className="au-versand-fehler" style={{ display: "block" }}>{l.fehlermeldung}</span>}
                  </span>
                  <span className="au-kampagne-empfaenger-badges">
                    {l.variante && <span className="au-badge au-badge-neutral">{l.variante}</span>}
                    {l.status === "uebersprungen_frequency_cap" ? (
                      <span className="au-badge au-badge-warning">Sperrfrist</span>
                    ) : l.status === "fehler" ? (
                      <span className="au-badge au-badge-danger">Fehler</span>
                    ) : (
                      <>
                        <span className={`au-versand-schritt${l.zugestellt_am ? " an" : ""}`}>Zugestellt</span>
                        <span className={`au-versand-schritt${l.geoeffnet_am ? " an" : ""}`}>Geöffnet{l.anzahl_oeffnungen > 1 ? ` ${l.anzahl_oeffnungen}×` : ""}</span>
                        <span className={`au-versand-schritt${l.geklickt_am ? " an" : ""}`}>Geklickt{l.anzahl_klicks > 1 ? ` ${l.anzahl_klicks}×` : ""}</span>
                      </>
                    )}
                    {l.bounced_am && <span className="au-badge au-badge-danger">Bounce</span>}
                    {l.beschwerde_am && <span className="au-badge au-badge-danger">Spam</span>}
                  </span>
                </li>
              ))}
              {!liste.length && <li className="au-leer">Niemand in dieser Auswahl.</li>}
            </ul>
          </section>
        </div>

        <aside className="au-dash-seite">
          {k.betreff_b && (
            <section className="au-panel">
              <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>A/B-Test Betreff</h2></div>
              <div className="au-ab">
                {([["A", k.betreff, a], ["B", k.betreff_b, b]] as const).map(([v, betreff, s]) => {
                  const gewinner = v === "A" ? prozent(a.geoeffnet, a.anzahl) > prozent(b.geoeffnet, b.anzahl) : prozent(b.geoeffnet, b.anzahl) > prozent(a.geoeffnet, a.anzahl);
                  return (
                    <div key={v} className={`au-ab-variante${gewinner ? " gewinner" : ""}`}>
                      <div className="au-klein">Variante {v}{gewinner ? " · vorne" : ""}</div>
                      <strong>{betreff}</strong>
                      <div className="au-ab-werte">
                        <span><b>{prozent(s.geoeffnet, s.anzahl)} %</b> geöffnet</span>
                        <span><b>{prozent(s.geklickt, s.anzahl)} %</b> geklickt</span>
                        <span className="au-klein">{s.anzahl} Empfänger</span>
                      </div>
                    </div>
                  );
                })}
                <p className="au-klein" style={{ margin: 0 }}>Bei kleinen Gruppen (unter ~100 je Variante) sind Unterschiede von wenigen Prozent eher Zufall.</p>
              </div>
            </section>
          )}

          <section className="au-panel">
            <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Klicks pro Link</h2></div>
            {links.length ? (
              <ul className="au-kliste au-kliste-kompakt">
                {links.map(([link, s]) => (
                  <li key={link}>
                    <a href={link} target="_blank" rel="noreferrer" className="au-link-bruch">{link.replace(/^https?:\/\//, "")}</a>
                    <span className="au-klein" style={{ whiteSpace: "nowrap" }}>{s.personen.size} Pers. · {s.klicks}×</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Noch keine Klicks erfasst (Link-Details gibt es für Kampagnen ab jetzt).</p>
            )}
          </section>

          <section className="au-panel">
            <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Inhalt</h2></div>
            <div style={{ padding: "0.9rem 1.15rem" }}>
              <div className="au-klein">Betreff</div>
              <strong>{k.betreff}</strong>
              <div className="au-fe-vorschau-inhalt" style={{ padding: "0.75rem 0 0", whiteSpace: "pre-wrap" }}>{k.inhalt}</div>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
