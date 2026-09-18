export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { legeTagAn, aktualisiereTag, setzeTagAktiv } from "@/lib/actions";
import { TAG_TYP_LABEL } from "@/lib/tags";

export const metadata = { title: "Tags" };

export default async function TagsPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: tags }, { data: zuordnungen }] = await Promise.all([
    supabase.from("tags").select("*").order("aktiv", { ascending: false }).order("label"),
    supabase.from("teilnehmer_tags").select("tag_id"),
  ]);
  const anzahl = new Map<string, number>();
  (zuordnungen || []).forEach((z: any) => anzahl.set(z.tag_id, (anzahl.get(z.tag_id) || 0) + 1));
  const aktive = (tags || []).filter((t: any) => t.aktiv);
  const inaktive = (tags || []).filter((t: any) => !t.aktiv);

  const typAuswahl = (wert?: string) => (
    <select className="au-select" name="typ" required defaultValue={wert || ""}>
      <option value="" disabled>Typ wählen …</option>
      {Object.entries(TAG_TYP_LABEL).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );

  const zeile = (t: any) => (
    <li key={t.id} className="au-tag-zeile">
      <div className="au-tag-zeile-kopf">
        <div>
          <strong>{t.label}</strong> <span className="au-badge au-badge-neutral">{TAG_TYP_LABEL[t.typ] || t.typ}</span>
          <div className="au-klein">
            <code>{t.key}</code> · {anzahl.get(t.id) || 0} Teilnehmer{t.beschreibung ? ` · ${t.beschreibung}` : ""}
          </div>
        </div>
        <form action={setzeTagAktiv}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="aktiv" value={String(!t.aktiv)} />
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">{t.aktiv ? "Deaktivieren" : "Wieder aktivieren"}</button>
        </form>
      </div>
      <details>
        <summary className="au-klein">Bearbeiten</summary>
        <form action={aktualisiereTag} className="au-tag-form">
          <input type="hidden" name="id" value={t.id} />
          <input className="au-input" name="label" required defaultValue={t.label} />
          {typAuswahl(t.typ)}
          <input className="au-input" name="beschreibung" defaultValue={t.beschreibung || ""} placeholder="Beschreibung (optional)" />
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Speichern</button>
        </form>
      </details>
    </li>
  );

  return (
    <main>
      <div className="au-dash-kopf">
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>Tags</h1>
          <p style={{ margin: 0 }}>Eigene Merkmale für Teilnehmer – zuordnen auf der Teilnehmerseite, filtern in Kampagnen. Nur intern sichtbar.</p>
        </div>
      </div>

      <section className="au-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Neuer Tag</h2></div>
        <form action={legeTagAn} className="au-tag-form" style={{ padding: "1rem 1.15rem" }}>
          <input className="au-input" name="label" required placeholder="Bezeichnung, z. B. Funnel SPS abgeschlossen" />
          {typAuswahl()}
          <input className="au-input" name="key" placeholder="Schlüssel (optional, sonst aus Bezeichnung)" />
          <input className="au-input" name="beschreibung" placeholder="Beschreibung (optional)" />
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Anlegen</button>
        </form>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Aktive Tags</h2>
          <span className="au-klein">{aktive.length}</span>
        </div>
        {aktive.length ? <ul className="au-tag-liste">{aktive.map(zeile)}</ul> : <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Noch keine Tags angelegt.</p>}
        {inaktive.length > 0 && (
          <details style={{ padding: "0.75rem 1.15rem" }}>
            <summary className="au-klein">Deaktiviert ({inaktive.length}) – bleiben an den Teilnehmern gespeichert, sind aber nicht mehr auswählbar</summary>
            <ul className="au-tag-liste">{inaktive.map(zeile)}</ul>
          </details>
        )}
      </section>
    </main>
  );
}
