export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { updateSeminartypFarbe } from "@/lib/actions";

export default async function SeminartypenPage() {
  const supabase = getSupabaseAdmin();
  const { data: typen } = await supabase.from("seminartypen").select("*").order("name");

  return (
    <main>
      <h1>Seminarkategorien &amp; Farben</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Jede Kategorie bekommt eine Farbe – wird in der Monatsübersicht der Termine zur schnellen Einordnung genutzt.
      </p>

      <div className="au-card">
        <table className="au-table">
          <thead>
            <tr>
              <th>Farbe</th>
              <th>Kategorie</th>
              <th>Aktiv</th>
              <th>Speichern</th>
            </tr>
          </thead>
          <tbody>
            {typen?.map((t: any) => (
              <tr key={t.id}>
                <td>
                  <span
                    style={{
                      display: "inline-block",
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      background: t.farbe,
                      border: "1px solid var(--color-border-strong)",
                      verticalAlign: "middle",
                    }}
                  />
                </td>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td>{t.aktiv ? "Ja" : "Nein"}</td>
                <td>
                  <form action={updateSeminartypFarbe} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input type="hidden" name="seminartyp_id" value={t.id} />
                    <input
                      type="color"
                      name="farbe"
                      defaultValue={t.farbe || "#102A4C"}
                      style={{ width: 44, height: 32, padding: 0, border: "1px solid var(--color-border-strong)", borderRadius: 6, cursor: "pointer" }}
                    />
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
                  </form>
                </td>
              </tr>
            ))}
            {!typen?.length && (
              <tr className="au-table-empty"><td colSpan={4}>Keine Seminarkategorien vorhanden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
