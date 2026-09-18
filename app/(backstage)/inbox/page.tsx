export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { erfasseInboxEintrag, speichereInboxEintrag, legeThemenclusterAn, uebergebeInboxAnThemenRadar } from "@/lib/actions";
import {
  INBOX_TYPEN,
  INBOX_TYP_LABEL,
  INBOX_BEREICHE,
  INBOX_BEREICH_LABEL,
  INBOX_STATUS,
  INBOX_STATUS_LABEL,
  INBOX_STATUS_GESCHLOSSEN,
  type InboxEintrag,
  type Themencluster,
} from "@/lib/inbox";
import InboxKarte from "./InboxKarte";
import { InboxErfassen, ClusterAnlegen } from "./InboxErfassen";

type Filter = { status?: string; typ?: string; bereich?: string; cluster?: string; fokus?: string; wv?: string; q?: string };

function berlinHeute(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<Filter> }) {
  const f = await searchParams;
  const status = f.status || "offen";
  const heute = berlinHeute();
  const supabase = getSupabaseAdmin();

  const { data: clusterDaten } = await supabase.from("themencluster").select("*").order("sortierung").order("name");
  const cluster = (clusterDaten || []) as Themencluster[];

  let query = supabase
    .from("inbox_eintraege")
    .select("*, inbox_eintrag_cluster(themencluster_id)")
    .order("erstellt_am", { ascending: false })
    .limit(300);

  if (status === "offen") query = query.not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`);
  else if ((INBOX_STATUS as readonly string[]).includes(status)) query = query.eq("status", status);

  if (f.typ === "unsortiert") query = query.is("typ", null);
  else if (f.typ && (INBOX_TYPEN as readonly string[]).includes(f.typ)) query = query.eq("typ", f.typ);
  if (f.bereich && (INBOX_BEREICHE as readonly string[]).includes(f.bereich)) query = query.contains("bereiche", [f.bereich]);
  if (f.fokus === "1") query = query.eq("ist_fokus", true);
  if (f.wv === "faellig") query = query.lte("wiedervorlage_am", heute);
  if (f.wv === "gesetzt") query = query.not("wiedervorlage_am", "is", null);

  // Kommas/Klammern wuerden die PostgREST-or()-Syntax sprengen, % und _ sind
  // ILIKE-Platzhalter -- fuer eine Freitextsuche reicht es, sie zu entfernen.
  const q = (f.q || "").replace(/[,()%_\\]/g, " ").trim();
  if (q) query = query.or(`text.ilike.%${q}%,titel.ilike.%${q}%,notizen.ilike.%${q}%`);

  // Cluster-Filter per ID-Vorauswahl statt !inner-Join -- sonst kaeme pro
  // Eintrag nur noch die gefilterte Cluster-Zuordnung zurueck und die Chips
  // der Karte zeigten die anderen Cluster faelschlich als abgewaehlt.
  if (f.cluster) {
    const { data: zuordnungen } = await supabase.from("inbox_eintrag_cluster").select("inbox_eintrag_id").eq("themencluster_id", f.cluster);
    query = query.in("id", (zuordnungen || []).map((z) => z.inbox_eintrag_id).concat(["00000000-0000-0000-0000-000000000000"]));
  }

  const [{ data, error }, { count: unsortiert }, { count: faellig }] = await Promise.all([
    query,
    supabase.from("inbox_eintraege").select("id", { count: "exact", head: true }).is("typ", null).not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`),
    supabase.from("inbox_eintraege").select("id", { count: "exact", head: true }).lte("wiedervorlage_am", heute).not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`),
  ]);
  if (error) throw new Error(error.message);

  const eintraege: InboxEintrag[] = (data || []).map((e: any) => ({
    ...e,
    cluster_ids: (e.inbox_eintrag_cluster || []).map((z: any) => z.themencluster_id),
  }));
  // Fokus zuerst, dann faellige Wiedervorlagen, dann neueste zuerst.
  eintraege.sort((a, b) => {
    if (a.ist_fokus !== b.ist_fokus) return a.ist_fokus ? -1 : 1;
    const af = !!a.wiedervorlage_am && a.wiedervorlage_am <= heute;
    const bf = !!b.wiedervorlage_am && b.wiedervorlage_am <= heute;
    if (af !== bf) return af ? -1 : 1;
    return b.erstellt_am.localeCompare(a.erstellt_am);
  });

  const filterAktiv = !!(f.typ || f.bereich || f.cluster || f.fokus || f.wv || q || status !== "offen");

  return (
    <main className="au-inbox">
      <h1>Ideen-Inbox</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Alles, was dir einfällt – per Siri, iPhone, Watch oder hier. Sortiert wird später.
      </p>

      <div className="au-card">
        <InboxErfassen erfassenAction={erfasseInboxEintrag} />
        <div className="au-inbox-schnellfilter">
          <Link href="/inbox?typ=unsortiert" className="au-chip">Unsortiert <span className="au-badge au-badge-neutral">{unsortiert ?? 0}</span></Link>
          <Link href="/inbox?wv=faellig" className="au-chip">Wiedervorlage fällig <span className={`au-badge ${faellig ? "au-badge-warning" : "au-badge-neutral"}`}>{faellig ?? 0}</span></Link>
          <Link href="/inbox?fokus=1" className="au-chip">★ Fokus</Link>
          {filterAktiv && <Link href="/inbox" className="au-chip">× Filter zurücksetzen</Link>}
        </div>
      </div>

      <details className="au-card au-inbox-filter" open={filterAktiv}>
        <summary>Filter &amp; Suche</summary>
        <form method="get" className="au-inbox-filterform">
          <input className="au-input" name="q" defaultValue={f.q || ""} placeholder="Suche in Text, Titel, Notizen" />
          <select className="au-select" name="status" defaultValue={status}>
            <option value="offen">Offen (ohne erledigt/verworfen/archiviert)</option>
            <option value="alle">Alle Status</option>
            {INBOX_STATUS.map((s) => <option key={s} value={s}>{INBOX_STATUS_LABEL[s]}</option>)}
          </select>
          <select className="au-select" name="typ" defaultValue={f.typ || ""}>
            <option value="">Alle Typen</option>
            <option value="unsortiert">Unsortiert</option>
            {INBOX_TYPEN.map((t) => <option key={t} value={t}>{INBOX_TYP_LABEL[t]}</option>)}
          </select>
          <select className="au-select" name="bereich" defaultValue={f.bereich || ""}>
            <option value="">Alle Bereiche</option>
            {INBOX_BEREICHE.map((b) => <option key={b} value={b}>{INBOX_BEREICH_LABEL[b]}</option>)}
          </select>
          <select className="au-select" name="cluster" defaultValue={f.cluster || ""}>
            <option value="">Alle Cluster</option>
            {cluster.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="au-select" name="wv" defaultValue={f.wv || ""}>
            <option value="">Wiedervorlage egal</option>
            <option value="faellig">Wiedervorlage fällig</option>
            <option value="gesetzt">Mit Wiedervorlage</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
            <input type="checkbox" name="fokus" value="1" defaultChecked={f.fokus === "1"} /> nur Fokus
          </label>
          <button type="submit" className="au-btn au-btn-primary">Anwenden</button>
        </form>
      </details>

      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 0.75rem" }}>
        {eintraege.length} {eintraege.length === 1 ? "Eintrag" : "Einträge"}
        {eintraege.length === 300 && " (die neuesten 300 – Filter nutzen)"}
      </p>

      {eintraege.map((e) => (
        <InboxKarte
          key={e.id}
          eintrag={e}
          cluster={cluster}
          heute={heute}
          speichernAction={speichereInboxEintrag}
          themenRadarAction={uebergebeInboxAnThemenRadar}
        />
      ))}
      {!eintraege.length && (
        <div className="au-card" style={{ color: "var(--color-text-faint)" }}>
          Keine Einträge{filterAktiv ? " für diese Filter" : ""}.
        </div>
      )}

      <details className="au-card" style={{ marginTop: "1.5rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Themencluster verwalten</summary>
        <ul style={{ margin: "0.75rem 0", paddingLeft: "1.1rem" }}>
          {cluster.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox?cluster=${c.id}`}>{c.name}</Link>
              {c.beschreibung && <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}> – {c.beschreibung}</span>}
            </li>
          ))}
        </ul>
        <ClusterAnlegen anlegenAction={legeThemenclusterAn} />
      </details>
    </main>
  );
}
