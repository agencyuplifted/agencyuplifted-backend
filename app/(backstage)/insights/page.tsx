export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { erstelleInsightsEintrag } from "@/lib/actions";
import { insightsTypLabel, type InsightsTyp } from "@/lib/insights";
import { formatDatumZeit } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  entwurf: "Entwurf",
  review: "Review",
  veroeffentlicht: "Veröffentlicht",
  archiviert: "Archiviert",
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ typ?: string }>;
}) {
  const { typ } = await searchParams;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("insights_eintraege")
    .select("id, typ, titel, status, sprache, quelle_typ, aktualisiert_am")
    .order("aktualisiert_am", { ascending: false });
  if (typ) query = query.eq("typ", typ);
  const { data: eintraege } = await query;

  const { data: alle } = await supabase.from("insights_eintraege").select("typ");
  const anzahlProTyp = new Map<string, number>();
  (alle || []).forEach((e: any) => anzahlProTyp.set(e.typ, (anzahlProTyp.get(e.typ) || 0) + 1));

  const typen: InsightsTyp[] = ["artikel", "glossar", "faq", "guide"];

  return (
    <main>
      <h1>Insights</h1>
      <p>
        Der Wissenshub für agencyuplifted.com — Artikel, Glossar, FAQ und Guides in einer Struktur, mit Fokus auf
        sauberes SEO/GEO-Markup. v0.1: Datenmodell, Kern-Editor, Contao-Import.
      </p>

      <div className="au-card">
        <h2>Neuer Eintrag</h2>
        <form action={erstelleInsightsEintrag}>
          <div className="au-row-2">
            <select className="au-select" name="typ" defaultValue="artikel">
              {typen.map((t) => (
                <option key={t} value={t}>{insightsTypLabel(t)}</option>
              ))}
            </select>
            <input className="au-input" name="titel" required placeholder="Titel des neuen Eintrags" />
          </div>
          <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "0.75rem" }}>
            Anlegen &amp; bearbeiten
          </button>
        </form>
      </div>

      <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
        <Link href="/insights" className={`au-btn au-btn-sm ${!typ ? "au-btn-primary" : "au-btn-secondary"}`}>
          Alle ({(alle || []).length})
        </Link>
        {typen.map((t) => (
          <Link
            key={t}
            href={`/insights?typ=${t}`}
            className={`au-btn au-btn-sm ${typ === t ? "au-btn-primary" : "au-btn-secondary"}`}
          >
            {insightsTypLabel(t)} ({anzahlProTyp.get(t) || 0})
          </Link>
        ))}
      </div>

      <div className="au-card">
        <table className="au-table">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Typ</th>
              <th>Status</th>
              <th>Sprache</th>
              <th>Quelle</th>
              <th>Aktualisiert</th>
            </tr>
          </thead>
          <tbody>
            {(eintraege || []).map((e: any) => (
              <tr key={e.id}>
                <td style={{ color: "#0B1B33", fontWeight: 600 }}>
                  <Link href={`/insights/${e.id}`}>{e.titel}</Link>
                </td>
                <td>{insightsTypLabel(e.typ)}</td>
                <td>{STATUS_LABEL[e.status] || e.status}</td>
                <td>{e.sprache}</td>
                <td>{e.quelle_typ || "—"}</td>
                <td>{formatDatumZeit(e.aktualisiert_am)}</td>
              </tr>
            ))}
            {!(eintraege || []).length && (
              <tr className="au-table-empty"><td colSpan={6}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
