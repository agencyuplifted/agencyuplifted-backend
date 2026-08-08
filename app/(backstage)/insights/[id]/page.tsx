export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { speichereInsightsEintrag, setzeInsightsStatus } from "@/lib/actions";
import { ladeInsightsEintrag, ladeKategorien, ladeKategorienFuerEintrag, ladeTags, ladeTagsFuerEintrag, insightsTypLabel } from "@/lib/insights";
import BlockEditor from "../BlockEditor";

const STATUS_FOLGE: Record<string, { status: string; label: string; klasse: string }[]> = {
  entwurf: [{ status: "review", label: "Zur Review", klasse: "au-btn-secondary" }],
  review: [
    { status: "entwurf", label: "Zurück zu Entwurf", klasse: "au-btn-secondary" },
    { status: "veroeffentlicht", label: "Veröffentlichen", klasse: "au-btn-primary" },
  ],
  veroeffentlicht: [{ status: "archiviert", label: "Archivieren", klasse: "au-btn-danger" }],
  archiviert: [{ status: "entwurf", label: "Reaktivieren als Entwurf", klasse: "au-btn-secondary" }],
};

export default async function InsightsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gespeichert?: string }>;
}) {
  const { id } = await params;
  const { gespeichert } = await searchParams;
  const eintrag = await ladeInsightsEintrag(id);
  if (!eintrag) {
    return (
      <main>
        <h1>Nicht gefunden</h1>
        <Link href="/insights" className="au-btn au-btn-secondary">← Zurück zu Insights</Link>
      </main>
    );
  }

  const [kategorien, eintragKategorien, tags, eintragTagIds] = await Promise.all([
    ladeKategorien(),
    ladeKategorienFuerEintrag(id),
    ladeTags(),
    ladeTagsFuerEintrag(id),
  ]);
  const aktuelleHauptkategorie = eintragKategorien.find((k: any) => k.ist_hauptkategorie)?.kategorie_id || "";
  const aktuelleTagIds = new Set(eintragTagIds);

  return (
    <main>
      <Link href="/insights" style={{ color: "#102A4C", fontSize: "0.85rem" }}>← Zurück zu Insights</Link>
      <h1>{eintrag.titel}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        {insightsTypLabel(eintrag.typ)} · Slug: {eintrag.slug} · Sprache: {eintrag.sprache} · Status: {eintrag.status}
        {eintrag.quelle_typ && <> · Quelle: {eintrag.quelle_typ}</>}
        {eintrag.status === "veroeffentlicht" && (
          <>
            {" "}
            ·{" "}
            <a href={`/wissen/${eintrag.slug}`} target="_blank" rel="noopener noreferrer">
              Live ansehen ↗
            </a>
          </>
        )}
      </p>

      {gespeichert && <div className="au-banner au-banner-success">Gespeichert.</div>}

      <div className="au-card">
        <h2>Status</h2>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {(STATUS_FOLGE[eintrag.status] || []).map((s) => (
            <form key={s.status} action={setzeInsightsStatus}>
              <input type="hidden" name="id" value={eintrag.id} />
              <input type="hidden" name="status" value={s.status} />
              <button type="submit" className={`au-btn au-btn-sm ${s.klasse}`}>{s.label}</button>
            </form>
          ))}
        </div>
      </div>

      <form action={speichereInsightsEintrag}>
        <input type="hidden" name="id" value={eintrag.id} />

        <div className="au-card">
          <h2>Meta</h2>
          <label className="au-label">Titel</label>
          <input className="au-input" name="titel" defaultValue={eintrag.titel} required />

          <label className="au-label">Einleitung (Teaser auf der Seite &amp; Meta-Description für Google)</label>
          <textarea className="au-textarea" name="kurzfassung" rows={3} defaultValue={eintrag.kurzfassung || ""} />

          <div className="au-row-2">
            <div>
              <label className="au-label">Titelbild-URL</label>
              <input className="au-input" name="titelbild_url" defaultValue={eintrag.titelbild_url || ""} />
            </div>
            <div>
              <label className="au-label">Titelbild Alt-Text</label>
              <input className="au-input" name="titelbild_alt" defaultValue={eintrag.titelbild_alt || ""} />
            </div>
          </div>

          <label className="au-label">Content-Pillar (Hauptkategorie)</label>
          <select className="au-select" name="hauptkategorie_id" defaultValue={aktuelleHauptkategorie}>
            <option value="">Keine</option>
            {kategorien.map((k: any) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>

          <label className="au-label" style={{ marginTop: "1rem" }}>Tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 1rem", marginBottom: "0.5rem" }}>
            {tags.map((t: any) => (
              <label key={t.id} style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <input type="checkbox" name="tag_ids" value={t.id} defaultChecked={aktuelleTagIds.has(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
          <label className="au-label">Neue Tags (kommagetrennt, werden automatisch angelegt)</label>
          <input className="au-input" name="neue_tags" placeholder="z. B. Onboarding, Skalierung" />
        </div>

        <div className="au-card">
          <h2>SEO &amp; GEO</h2>
          <label className="au-label">SEO-Titel (Google-Suchergebnis, Browser-Tab)</label>
          <input className="au-input" name="seo_titel" defaultValue={eintrag.seo_titel || ""} placeholder={eintrag.titel} maxLength={70} />
          <label className="au-label">SEO-Beschreibung (Google-Snippet)</label>
          <textarea className="au-textarea" name="seo_beschreibung" rows={2} defaultValue={eintrag.seo_beschreibung || ""} placeholder={eintrag.kurzfassung || ""} maxLength={170} />
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", marginTop: "0.3rem" }}>
            Leer lassen, um automatisch aus Titel/Einleitung zu übernehmen.
          </p>
        </div>

        <div className="au-card">
          <h2>Inhalt</h2>
          <BlockEditor name="bloecke" initial={eintrag.bloecke || []} />
        </div>

        <div className="au-card" style={{ display: "flex", gap: "0.75rem" }}>
          <button type="submit" className="au-btn au-btn-primary">Speichern</button>
          <Link href="/insights" className="au-btn au-btn-secondary">Abbrechen</Link>
        </div>
      </form>
    </main>
  );
}
