export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  erledigtMarkierenContentAufgabe,
  wiederEroeffnenContentAufgabe,
  neueContentAufgabe,
  erstelleThemenRadarIdee,
  holeAutocompleteIdeen,
} from "@/lib/actions";
import { CLUSTER, QUELLE_LABEL, ladeThemenRadarIdeen, ladeNaechsteThemenRadarIdeen } from "@/lib/themen-radar";
import ThemenRadarZeile from "./ThemenRadarZeile";
import { ladeTriageEintraege, gruppiereClusterKandidaten, GROESSE_LABEL, TRIAGE_AKTION, TRIAGE_AKTION_LABEL, type Groesse, type TriageAktion } from "@/lib/triage";
import TriageZeile from "./TriageZeile";
import ClusterMergeForm from "./ClusterMergeForm";
import OffsiteZeile, { OFFSITE_STATUS_LABEL, OFFSITE_STATUS_BADGE } from "./OffsiteZeile";
import { erstelleOffsitePlatzierung, loescheOffsitePlatzierung } from "@/lib/actions";

const RHYTHMUS_LABEL: Record<string, string> = {
  einmalig: "Einmalig",
  woechentlich: "Wöchentlich",
  monatlich: "Monatlich",
  quartalsweise: "Quartalsweise",
};

function formatDatum(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function ContentCreationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cluster?: string; triage_kategorie?: string; triage_groesse?: string; triage_aktion?: string }>;
}) {
  const {
    tab: tabParam,
    cluster: clusterFilter,
    triage_kategorie: triageKategorieFilter,
    triage_groesse: triageGroesseFilter,
    triage_aktion: triageAktionFilter,
  } = await searchParams;
  const tab =
    tabParam === "themen-radar" ? "themen-radar" :
    tabParam === "triage" ? "triage" :
    tabParam === "offsite" ? "offsite" :
    "uebersicht";

  const supabase = getSupabaseAdmin();

  const { data: aufgaben } = await supabase
    .from("content_aufgaben")
    .select("*")
    .order("status", { ascending: true })
    .order("erstellt_am", { ascending: true });

  const offen = (aufgaben || []).filter((a: any) => a.status === "offen");
  const erledigt = (aufgaben || []).filter((a: any) => a.status === "erledigt");

  let entwuerfeCount = 0;
  let letzteVeroeffentlichung: string | null = null;
  let naechsteIdeen: Awaited<ReturnType<typeof ladeNaechsteThemenRadarIdeen>> = [];

  if (tab === "uebersicht") {
    const { count } = await supabase
      .from("insights_eintraege")
      .select("id", { count: "exact", head: true })
      .eq("status", "entwurf");
    entwuerfeCount = count || 0;

    const { data: letzte } = await supabase
      .from("insights_eintraege")
      .select("veroeffentlicht_am")
      .eq("status", "veroeffentlicht")
      .order("veroeffentlicht_am", { ascending: false })
      .limit(1)
      .maybeSingle();
    letzteVeroeffentlichung = letzte?.veroeffentlicht_am || null;

    naechsteIdeen = await ladeNaechsteThemenRadarIdeen(3);
  }

  const ideen = tab === "themen-radar" ? await ladeThemenRadarIdeen(clusterFilter ? { cluster: clusterFilter } : undefined) : [];

  const alleTriageEintraege = tab === "triage" ? await ladeTriageEintraege() : [];
  const triageEintraege =
    tab === "triage"
      ? alleTriageEintraege.filter(
          (e) =>
            (!triageKategorieFilter || e.kategorie === triageKategorieFilter) &&
            (!triageGroesseFilter || e.groesse === triageGroesseFilter) &&
            (!triageAktionFilter || e.triage_aktion === triageAktionFilter)
        )
      : [];

  const triageNachKategorie: Record<string, number> = {};
  const triageNachGroesse: Record<string, number> = {};
  for (const e of alleTriageEintraege) {
    const k = e.kategorie || "Ohne Kategorie";
    triageNachKategorie[k] = (triageNachKategorie[k] || 0) + 1;
    triageNachGroesse[e.groesse] = (triageNachGroesse[e.groesse] || 0) + 1;
  }

  const clusterGruppen = tab === "triage" ? gruppiereClusterKandidaten(alleTriageEintraege) : [];

  let offsitePlatzierungen: any[] = [];
  let gespraechsmaterial: any[] = [];
  if (tab === "offsite") {
    const [{ data: platzierungen }, { data: material }] = await Promise.all([
      supabase.from("content_offsite_platzierungen").select("*").order("erstellt_am", { ascending: false }),
      supabase
        .from("insights_eintraege")
        .select("id, titel, slug, status")
        .eq("ist_gespraechsmaterial", true)
        .order("titel"),
    ]);
    offsitePlatzierungen = platzierungen || [];
    gespraechsmaterial = material || [];
  }
  const offsiteNachStatus: Record<string, number> = {};
  for (const p of offsitePlatzierungen) {
    offsiteNachStatus[p.status] = (offsiteNachStatus[p.status] || 0) + 1;
  }

  return (
    <main>
      <h1>Content Creation</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Wiederkehrende Aufgaben, die Themen-Ideen-Pipeline (Themen-Radar) und der direkte Übergang in die
        Insights/Blog-Redaktion — damit nichts nur im Chat-Verlauf hängen bleibt.
      </p>

      <div className="au-toolbar">
        <Link
          href="/content-creation"
          className={`au-btn au-btn-sm ${tab === "uebersicht" ? "au-btn-primary" : "au-btn-secondary"}`}
        >
          Übersicht
        </Link>
        <Link
          href="/content-creation?tab=themen-radar"
          className={`au-btn au-btn-sm ${tab === "themen-radar" ? "au-btn-primary" : "au-btn-secondary"}`}
        >
          Themen-Radar
        </Link>
        <Link
          href="/content-creation?tab=triage"
          className={`au-btn au-btn-sm ${tab === "triage" ? "au-btn-primary" : "au-btn-secondary"}`}
        >
          Alt-Content-Triage
        </Link>
        <Link
          href="/content-creation?tab=offsite"
          className={`au-btn au-btn-sm ${tab === "offsite" ? "au-btn-primary" : "au-btn-secondary"}`}
        >
          Off-Site & Zitierfähigkeit
        </Link>
      </div>

      {tab === "uebersicht" && (
        <>
          <div className="au-card">
            <h2>Auf einen Blick</h2>
            <div className="au-row-2" style={{ gap: "1.5rem" }}>
              <div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{entwuerfeCount}</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Insights-Entwürfe warten</div>
              </div>
              <div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatDatum(letzteVeroeffentlichung)}</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Letzte Veröffentlichung</div>
              </div>
            </div>
            {naechsteIdeen.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                  Nächste Themen aus dem Themen-Radar
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {naechsteIdeen.map((i) => (
                    <li key={i.id}>{i.thema}</li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/content-creation?tab=themen-radar" className="au-btn au-btn-secondary au-btn-sm" style={{ marginTop: "1rem" }}>
              Zum Themen-Radar →
            </Link>
          </div>

          <div className="au-card">
            <h2>Offen · {offen.length}</h2>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Aufgabe</th>
                  <th>Rhythmus</th>
                  <th>Zuletzt erledigt</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {offen.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{a.titel}</div>
                      {a.beschreibung && (
                        <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "0.15rem" }}>
                          {a.beschreibung}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="au-badge au-badge-neutral">{RHYTHMUS_LABEL[a.rhythmus] || a.rhythmus}</span>
                    </td>
                    <td>{formatDatum(a.zuletzt_erledigt_am)}</td>
                    <td>
                      <form action={erledigtMarkierenContentAufgabe}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Erledigt</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!offen.length && (
                  <tr className="au-table-empty"><td colSpan={4}>Keine offenen Aufgaben.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="au-card">
            <h2>Neue Aufgabe</h2>
            <form action={neueContentAufgabe} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 520 }}>
              <label>
                Titel
                <input type="text" name="titel" required placeholder="z.B. Neuen Blog-Artikel schreiben" />
              </label>
              <label>
                Beschreibung (optional)
                <textarea name="beschreibung" rows={2} />
              </label>
              <label>
                Rhythmus
                <select name="rhythmus" defaultValue="einmalig">
                  <option value="einmalig">Einmalig</option>
                  <option value="woechentlich">Wöchentlich</option>
                  <option value="monatlich">Monatlich</option>
                  <option value="quartalsweise">Quartalsweise</option>
                </select>
              </label>
              <button type="submit" className="au-btn au-btn-primary" style={{ alignSelf: "flex-start" }}>
                Anlegen
              </button>
            </form>
          </div>

          <div className="au-card">
            <h2>Erledigt · {erledigt.length}</h2>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Aufgabe</th>
                  <th>Rhythmus</th>
                  <th>Zuletzt erledigt</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {erledigt.map((a: any) => (
                  <tr key={a.id}>
                    <td style={{ color: "var(--color-text-muted)" }}>{a.titel}</td>
                    <td>
                      <span className="au-badge au-badge-success">{RHYTHMUS_LABEL[a.rhythmus] || a.rhythmus}</span>
                    </td>
                    <td>{formatDatum(a.zuletzt_erledigt_am)}</td>
                    <td>
                      <form action={wiederEroeffnenContentAufgabe}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Wieder öffnen</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!erledigt.length && (
                  <tr className="au-table-empty"><td colSpan={4}>Noch nichts erledigt.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "themen-radar" && (
        <>
          <div className="au-card">
            <h2>Neue Idee</h2>
            <form action={erstelleThemenRadarIdee} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 560 }}>
              <label>
                Thema / Frage
                <input type="text" name="thema" required placeholder="z.B. Stundensatz für KI-Tools in Agenturen kalkulieren" />
              </label>
              <div className="au-row-2">
                <label>
                  Cluster
                  <select className="au-select" name="cluster" defaultValue="Sonstige">
                    {CLUSTER.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "1.6rem" }}>
                  <input type="checkbox" name="fuer_linkedin" />
                  Direkt für LinkedIn vormerken
                </label>
              </div>
              <label>
                Notiz (optional)
                <textarea name="notiz" rows={2} placeholder="Kontext, Quelle, erste Gedanken..." />
              </label>
              <button type="submit" className="au-btn au-btn-primary" style={{ alignSelf: "flex-start" }}>
                Anlegen
              </button>
            </form>
          </div>

          <div className="au-card">
            <h2>Autocomplete-Vorschläge holen</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Fragt Google-Autocomplete (kostenlos, ohne Anmeldung) zu einem Startbegriff ab und legt verwandte
              Suchanfragen direkt als neue Ideen an. Unpassende einfach danach in der Liste löschen oder
              verwerfen. Google Search Console als präzisere Quelle folgt separat.
            </p>
            <form action={holeAutocompleteIdeen} className="au-row-2" style={{ maxWidth: 560 }}>
              <input type="text" name="seed" required placeholder="z.B. Stundensatz Agentur" />
              <select className="au-select" name="cluster" defaultValue="Sonstige">
                {CLUSTER.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button type="submit" className="au-btn au-btn-secondary">Vorschläge holen</button>
            </form>
          </div>

          <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
            <Link href="/content-creation?tab=themen-radar" className={`au-btn au-btn-sm ${!clusterFilter ? "au-btn-primary" : "au-btn-secondary"}`}>
              Alle Cluster
            </Link>
            {CLUSTER.map((c) => (
              <Link
                key={c}
                href={`/content-creation?tab=themen-radar&cluster=${encodeURIComponent(c)}`}
                className={`au-btn au-btn-sm ${clusterFilter === c ? "au-btn-primary" : "au-btn-secondary"}`}
              >
                {c}
              </Link>
            ))}
          </div>

          <div className="au-card">
            <h2>Ideen · {ideen.length}</h2>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Thema</th>
                  <th>Cluster</th>
                  <th>Quelle</th>
                  <th>Status</th>
                  <th>LinkedIn</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {ideen.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{i.thema}</div>
                      {i.notiz && (
                        <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "0.15rem" }}>
                          {i.notiz}
                        </div>
                      )}
                      {i.insights_eintrag_id && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <Link href={`/insights/${i.insights_eintrag_id}`} className="au-badge au-badge-gold">
                            Insights-Entwurf ansehen →
                          </Link>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="au-badge au-badge-neutral">{i.cluster}</span>
                    </td>
                    <td>{QUELLE_LABEL[i.quelle] || i.quelle}</td>
                    <ThemenRadarZeile id={i.id} thema={i.thema} status={i.status} fuerLinkedin={i.fuer_linkedin} />
                  </tr>
                ))}
                {!ideen.length && (
                  <tr className="au-table-empty"><td colSpan={6}>Noch keine Ideen — oben eine anlegen oder Autocomplete-Vorschläge holen.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "triage" && (
        <>
          <div className="au-card">
            <h2>Phase-0-Triage: {alleTriageEintraege.length} Alt-Entwürfe</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Aus dem Contao-Import von agencyuplifted.de/blog — bevor neue Artikel geplant werden, erst
              entscheiden, was mit dem Vorhandenen passiert. „Klein" (unter ~2.500 Zeichen) sind meist einzelne
              pointierte Gedanken, die sich gut als FAQ-/Glossar-Baustein in einen größeren Pillar einfügen lassen
              und schnell per KI redigieren lassen. „Groß" (über ~7.000 Zeichen) sind bereits eigenständige
              Artikel, die eher ins Deep-Dive-Format überführt werden. „Cluster-Kandidat" markiert Entwürfe, die
              gemeinsam mit anderen zu einem Pillar zusammengeführt werden sollen — dafür bei mehreren
              zusammengehörigen Einträgen dasselbe Cluster-Label eintragen.
            </p>
            <div className="au-row-2" style={{ gap: "1.5rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                  Nach Größe
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {(["klein", "mittel", "gross"] as const).map((g) => (
                    <span key={g} className="au-badge au-badge-neutral">
                      {GROESSE_LABEL[g]}: {triageNachGroesse[g] || 0}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
                  Nach Kategorie
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {Object.entries(triageNachKategorie).map(([k, n]) => (
                    <span key={k} className="au-badge au-badge-neutral">
                      {k}: {n}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="au-card">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                  Kategorie
                </div>
                <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
                  <Link
                    href="/content-creation?tab=triage"
                    className={`au-btn au-btn-sm ${!triageKategorieFilter ? "au-btn-primary" : "au-btn-secondary"}`}
                  >
                    Alle
                  </Link>
                  {CLUSTER.filter((c) => c !== "Sonstige").map((c) => (
                    <Link
                      key={c}
                      href={`/content-creation?tab=triage&triage_kategorie=${encodeURIComponent(c)}`}
                      className={`au-btn au-btn-sm ${triageKategorieFilter === c ? "au-btn-primary" : "au-btn-secondary"}`}
                    >
                      {c}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                  Größe
                </div>
                <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
                  <Link
                    href={`/content-creation?tab=triage${triageKategorieFilter ? `&triage_kategorie=${encodeURIComponent(triageKategorieFilter)}` : ""}`}
                    className={`au-btn au-btn-sm ${!triageGroesseFilter ? "au-btn-primary" : "au-btn-secondary"}`}
                  >
                    Alle
                  </Link>
                  {(["klein", "mittel", "gross"] as const).map((g) => (
                    <Link
                      key={g}
                      href={`/content-creation?tab=triage&triage_groesse=${g}${triageKategorieFilter ? `&triage_kategorie=${encodeURIComponent(triageKategorieFilter)}` : ""}`}
                      className={`au-btn au-btn-sm ${triageGroesseFilter === g ? "au-btn-primary" : "au-btn-secondary"}`}
                    >
                      {GROESSE_LABEL[g]}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginBottom: "0.3rem" }}>
                  Triage-Aktion
                </div>
                <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
                  <Link
                    href={`/content-creation?tab=triage${triageKategorieFilter ? `&triage_kategorie=${encodeURIComponent(triageKategorieFilter)}` : ""}`}
                    className={`au-btn au-btn-sm ${!triageAktionFilter ? "au-btn-primary" : "au-btn-secondary"}`}
                  >
                    Alle
                  </Link>
                  {TRIAGE_AKTION.map((a) => (
                    <Link
                      key={a}
                      href={`/content-creation?tab=triage&triage_aktion=${a}${triageKategorieFilter ? `&triage_kategorie=${encodeURIComponent(triageKategorieFilter)}` : ""}`}
                      className={`au-btn au-btn-sm ${triageAktionFilter === a ? "au-btn-primary" : "au-btn-secondary"}`}
                    >
                      {TRIAGE_AKTION_LABEL[a]}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {clusterGruppen.length > 0 && (
            <div className="au-card">
              <h2>Cluster-Gruppen zum Zusammenführen · {clusterGruppen.length}</h2>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
                Entwürfe mit derselben Aktion „Cluster-Kandidat" und demselben Cluster-Label. Beim Zusammenführen
                entsteht ein neuer Insights-Entwurf, der jeden Quell-Entwurf als eigenen Abschnitt enthält; die
                Quellen selbst werden archiviert (nicht gelöscht) und auf den neuen Entwurf verlinkt.
              </p>
              {clusterGruppen.map((g) => (
                <div key={g.label} style={{ borderTop: "1px solid var(--color-border)", padding: "0.85rem 0" }}>
                  <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>
                    {g.label} <span className="au-badge au-badge-neutral">{g.eintraege.length} Entwürfe</span>
                  </div>
                  <ul style={{ margin: "0 0 0.6rem", paddingLeft: "1.1rem", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                    {g.eintraege.map((e) => (
                      <li key={e.id}>{e.titel}</li>
                    ))}
                  </ul>
                  <ClusterMergeForm label={g.label} anzahl={g.eintraege.length} />
                </div>
              ))}
            </div>
          )}

          <div className="au-card">
            <h2>Entwürfe · {triageEintraege.length}</h2>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Kategorie</th>
                  <th>Umfang</th>
                  <th>Triage-Aktion</th>
                  <th>Cluster-Label</th>
                </tr>
              </thead>
              <tbody>
                {triageEintraege.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/insights/${e.id}`} style={{ fontWeight: 600 }}>
                        {e.titel}
                      </Link>
                    </td>
                    <td>
                      <span className="au-badge au-badge-neutral">{e.kategorie || "—"}</span>
                    </td>
                    <td>
                      <span className="au-badge au-badge-neutral">{GROESSE_LABEL[e.groesse]}</span>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                        {e.block_count} Blöcke · {e.text_len.toLocaleString("de-DE")} Zeichen
                      </div>
                    </td>
                    <TriageZeile id={e.id} aktion={e.triage_aktion} clusterLabel={e.triage_cluster_label} />
                  </tr>
                ))}
                {!triageEintraege.length && (
                  <tr className="au-table-empty"><td colSpan={5}>Keine Entwürfe für diesen Filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "offsite" && (
        <>
          <div className="au-card">
            <h2>Off-Site-Autorität – auf einen Blick</h2>
            <p style={{ color: "var(--color-text-muted)", marginTop: "-0.5rem" }}>
              Podcasts, Gastbeiträge, Interviews und Erwähnungen durch Dritte – unabhängig von den eigenen
              Insights-Artikeln. Cross-Referenzierung über mehrere Quellen hinweg erhöht die Wahrscheinlichkeit,
              als Quelle in KI-Antworten genannt zu werden (Konzeptdokument Abschnitt 14.4).
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem", marginTop: "0.5rem" }}>
              {Object.entries(OFFSITE_STATUS_LABEL).map(([status, label]) => (
                <div key={status}>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{offsiteNachStatus[status] || 0}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="au-card">
            <h2>Pipeline · {offsitePlatzierungen.length}</h2>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Typ</th>
                  <th>Plattform</th>
                  <th>Status</th>
                  <th>Ziel-Link</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {offsitePlatzierungen.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.titel}</td>
                    <td><span className="au-badge au-badge-neutral">{p.typ}</span></td>
                    <td>{p.plattform || "—"}</td>
                    <OffsiteZeile id={p.id} status={p.status} zielUrl={p.ziel_url} />
                    <td>
                      <form action={loescheOffsitePlatzierung}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!offsitePlatzierungen.length && (
                  <tr className="au-table-empty"><td colSpan={6}>Noch keine Off-Site-Platzierungen angelegt.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="au-card" style={{ maxWidth: 560 }}>
            <h2>Neue Platzierung</h2>
            <form action={erstelleOffsitePlatzierung}>
              <label className="au-label">Titel (z. B. "Podcast XY: Wertorientierte Preisfindung")</label>
              <input className="au-input" name="titel" required />

              <label className="au-label" style={{ marginTop: "0.75rem" }}>Typ</label>
              <select className="au-select" name="typ" defaultValue="podcast">
                <option value="podcast">Podcast-Gast</option>
                <option value="gastbeitrag">Gastbeitrag</option>
                <option value="interview">Interview</option>
                <option value="erwaehnung">Erwähnung/Zitat durch Dritte</option>
                <option value="verzeichnis">Verzeichnis/Auszeichnung</option>
                <option value="sonstiges">Sonstiges</option>
              </select>

              <label className="au-label" style={{ marginTop: "0.75rem" }}>Plattform (optional)</label>
              <input className="au-input" name="plattform" placeholder="z. B. Marketing Insider Podcast" />

              <label className="au-label" style={{ marginTop: "0.75rem" }}>Notizen (optional)</label>
              <textarea className="au-textarea" name="notizen" rows={2} />

              <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "0.75rem" }}>
                Anlegen
              </button>
            </form>
          </div>

          <div className="au-card">
            <h2>Gesprächsmaterial · {gespraechsmaterial.length}</h2>
            <p style={{ color: "var(--color-text-muted)", marginTop: "-0.5rem" }}>
              Wissen-Artikel, die im Editor als "Gesprächsmaterial" markiert wurden – gedacht zum direkten
              Verlinken/Verschicken in echten Kundengesprächen (Erfolgsmetrik unabhängig von Traffic, Abschnitt 14.3).
            </p>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {gespraechsmaterial.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/insights/${e.id}`} style={{ fontWeight: 600 }}>{e.titel}</Link>
                    </td>
                    <td><span className="au-badge au-badge-neutral">{e.status}</span></td>
                  </tr>
                ))}
                {!gespraechsmaterial.length && (
                  <tr className="au-table-empty"><td colSpan={2}>Noch keine Artikel als Gesprächsmaterial markiert.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

    </main>
  );
}
