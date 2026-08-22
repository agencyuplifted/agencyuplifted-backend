export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createGeburtstagsVorlage,
  updateGeburtstagsVorlage,
  deleteGeburtstagsVorlage,
  setGeburtstagsVorlageStandard,
} from "@/lib/actions";

export default async function GeburtstagsVorlagenPage() {
  const supabase = getSupabaseAdmin();
  const { data: vorlagen } = await supabase
    .from("geburtstags_vorlagen")
    .select("*")
    .order("ist_standard", { ascending: false })
    .order("name");

  return (
    <main>
      <h1>Geburtstags-Vorlagen</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Textbausteine für den Geburtstagsgruß. Verfügbare Platzhalter: <code>{"{{vorname}}"}</code>,{" "}
        <code>{"{{nachname}}"}</code>, <code>{"{{firma}}"}</code> (falls bekannt). Die Standard-Vorlage wird beim
        Versand vorausgefüllt, bleibt vor dem Senden aber immer editierbar.
      </p>

      <Link href="/geburtstage" className="au-btn au-btn-secondary au-btn-sm" style={{ marginBottom: "1rem", display: "inline-block" }}>
        ← Zurück zu Geburtstage
      </Link>

      <div className="au-card">
        <h2>Vorlagen · {vorlagen?.length || 0}</h2>
        {!vorlagen?.length && <p style={{ margin: 0 }}>Noch keine Vorlagen angelegt.</p>}
        {vorlagen?.map((v) => (
          <div key={v.id} style={{ padding: "0.85rem 0", borderTop: "1px solid var(--color-border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <strong>{v.name}</strong>{" "}
                {v.ist_standard && <span className="au-badge au-badge-success">Standard</span>}
                <div style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Betreff: {v.betreff}</div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {!v.ist_standard && (
                  <form action={setGeburtstagsVorlageStandard}>
                    <input type="hidden" name="id" value={v.id} />
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Als Standard</button>
                  </form>
                )}
                <form action={deleteGeburtstagsVorlage}>
                  <input type="hidden" name="id" value={v.id} />
                  <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
                </form>
              </div>
            </div>

            <details style={{ marginTop: "0.75rem" }}>
              <summary style={{ color: "#0B1B33", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}>Bearbeiten</summary>
              <form action={updateGeburtstagsVorlage} style={{ marginTop: "0.75rem", maxWidth: 640 }}>
                <input type="hidden" name="id" value={v.id} />
                <label className="au-label">Name (intern)</label>
                <input className="au-input" name="name" required defaultValue={v.name} />
                <label className="au-label">Betreff</label>
                <input className="au-input" name="betreff" required defaultValue={v.betreff} />
                <label className="au-label">Inhalt</label>
                <textarea className="au-textarea" name="inhalt" rows={8} required defaultValue={v.inhalt} />
                <button type="submit" className="au-btn au-btn-primary au-btn-sm" style={{ marginTop: "0.5rem" }}>
                  Speichern
                </button>
              </form>
            </details>
          </div>
        ))}
      </div>

      <div className="au-card" style={{ maxWidth: 640 }}>
        <h2>Neue Vorlage</h2>
        <form action={createGeburtstagsVorlage}>
          <label className="au-label">Name (intern)</label>
          <input className="au-input" name="name" required placeholder="z. B. Geburtstagsgruß Presse" />
          <label className="au-label">Betreff</label>
          <input className="au-input" name="betreff" required placeholder="Alles Gute zum Geburtstag, {{vorname}}!" />
          <label className="au-label">Inhalt</label>
          <textarea className="au-textarea" name="inhalt" rows={8} required placeholder={"Liebe(r) {{vorname}},\n\n..."} />
          <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.6rem", fontSize: "0.9rem" }}>
            <input type="checkbox" name="ist_standard" />
            Als Standard-Vorlage verwenden
          </label>
          <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "0.75rem" }}>
            Anlegen
          </button>
        </form>
      </div>
    </main>
  );
}
