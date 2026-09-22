export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createSeminartyp, updateSeminartyp } from "@/lib/actions";
import { PROGRAMME, PROGRAMM_KEYS } from "@/lib/programme";

// Auswahl "Programm" (Foundation/Uplift/Advance) -- bestimmt den Programm-Kalender
function ProgrammAuswahl({ wert, form }: { wert?: string | null; form?: string }) {
  return (
    <select name="programm" form={form} defaultValue={wert || ""} className="au-select" style={{ marginBottom: 0 }}>
      <option value="">kein Programm</option>
      {PROGRAMM_KEYS.map((k) => (
        <option key={k} value={k}>{PROGRAMME[k].titel}</option>
      ))}
    </select>
  );
}

export default async function SeminartypenPage() {
  const supabase = getSupabaseAdmin();
  const { data: typen } = await supabase.from("seminartypen").select("*").order("name");

  return (
    <main>
      <h1>Seminarkategorien &amp; Farben</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Jede Kategorie bekommt eine Farbe – wird in der Monatsübersicht der Termine zur schnellen Einordnung genutzt. Das Programm legt fest, in welchem
        Programm-Kalender (Foundation, Uplift, Advance) ihre Seminare erscheinen.
      </p>

      <div className="au-card">
        <h3 style={{ marginTop: 0 }}>Neue Kategorie anlegen</h3>
        <form action={createSeminartyp} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label className="au-label">Name</label>
            <input type="text" name="name" required className="au-input" placeholder="z.B. Verhandlung" />
          </div>
          <div>
            <label className="au-label">Kurzbeschreibung</label>
            <input type="text" name="kurzbeschreibung" className="au-input" placeholder="optional" />
          </div>
          <div>
            <label className="au-label">Farbe</label>
            <input
              type="color"
              name="farbe"
              defaultValue="#102A4C"
              style={{ display: "block", width: 44, height: 32, padding: 0, border: "1px solid var(--color-border-strong)", borderRadius: 6, cursor: "pointer" }}
            />
          </div>
          <div>
            <label className="au-label">Programm</label>
            <ProgrammAuswahl />
          </div>
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Anlegen</button>
        </form>
      </div>

      <div className="au-card">
        <table className="au-table">
          <thead>
            <tr>
              <th>Farbe</th>
              <th>Kategorie</th>
              <th>Kurzbeschreibung</th>
              <th>Programm</th>
              <th>Aktiv</th>
              <th>Speichern</th>
            </tr>
          </thead>
          <tbody>
            {typen?.map((t: any) => {
              const formId = `seminartyp-${t.id}`;
              return (
                <tr key={t.id}>
                  <td>
                    <form id={formId} action={updateSeminartyp}>
                      <input type="hidden" name="seminartyp_id" value={t.id} />
                    </form>
                    <input
                      type="color"
                      name="farbe"
                      form={formId}
                      defaultValue={t.farbe || "#102A4C"}
                      style={{ width: 44, height: 32, padding: 0, border: "1px solid var(--color-border-strong)", borderRadius: 6, cursor: "pointer" }}
                    />
                  </td>
                  <td>
                    <input type="text" name="name" form={formId} defaultValue={t.name} required className="au-input" />
                  </td>
                  <td>
                    <input type="text" name="kurzbeschreibung" form={formId} defaultValue={t.kurzbeschreibung || ""} className="au-input" placeholder="optional" />
                  </td>
                  <td>
                    <ProgrammAuswahl wert={t.programm} form={formId} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <input type="checkbox" name="aktiv" form={formId} defaultChecked={t.aktiv} />
                  </td>
                  <td>
                    <button type="submit" form={formId} className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
                  </td>
                </tr>
              );
            })}
            {!typen?.length && (
              <tr className="au-table-empty"><td colSpan={6}>Keine Seminarkategorien vorhanden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
