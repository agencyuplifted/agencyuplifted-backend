export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createBuchKontaktKategorie, deleteBuchKontaktKategorie } from "@/lib/actions";

export default async function BuchKontaktKategorienPage() {
  const supabase = getSupabaseAdmin();
  const { data: kategorien } = await supabase
    .from("buch_kontakt_kategorien")
    .select("*")
    .order("name");

  return (
    <main>
      <h1>Buch-Kontakt-Kategorien</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Legt fest, welche "Empfänger ist"-Kategorien beim Anlegen eines Buch-Exemplars zur Auswahl stehen
        (z. B. Journalist, Redakteur, Pitch-Berater). Nur "Agenturunternehmer" schaltet zusätzlich den
        Kundenstatus (Neu/Bestand) frei.
      </p>

      <a href="/buch-versand" className="au-btn au-btn-secondary au-btn-sm" style={{ marginBottom: "1rem", display: "inline-block" }}>
        ← Zurück zu Buch-Versand
      </a>

      <div className="au-card">
        <h2>Kategorien · {kategorien?.length || 0}</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {kategorien?.map((k) => (
              <tr key={k.id}>
                <td style={{ fontWeight: 600 }}>{k.name}</td>
                <td>
                  <form action={deleteBuchKontaktKategorie}>
                    <input type="hidden" name="id" value={k.id} />
                    <button type="submit" className="au-btn au-btn-danger au-btn-sm">
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!kategorien?.length && (
              <tr className="au-table-empty">
                <td colSpan={2}>Noch keine Kategorien angelegt.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="au-card" style={{ maxWidth: 480 }}>
        <h2>Neue Kategorie</h2>
        <form action={createBuchKontaktKategorie}>
          <label className="au-label">Name (z. B. Pitch-Berater, Journalist, Redakteur)</label>
          <input className="au-input" name="name" required />
          <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "0.75rem" }}>
            Anlegen
          </button>
        </form>
      </div>
    </main>
  );
}
