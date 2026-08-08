export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { erledigtMarkierenContentAufgabe, wiederEroeffnenContentAufgabe, neueContentAufgabe } from "@/lib/actions";

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

export default async function ContentCreationPage() {
  const supabase = getSupabaseAdmin();
  const { data: aufgaben } = await supabase
    .from("content_aufgaben")
    .select("*")
    .order("status", { ascending: true })
    .order("erstellt_am", { ascending: true });

  const offen = (aufgaben || []).filter((a: any) => a.status === "offen");
  const erledigt = (aufgaben || []).filter((a: any) => a.status === "erledigt");

  return (
    <main>
      <h1>Content Creation</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Wiederkehrende und einmalige Aufgaben rund um Onepage, Blog und SEO/GEO-Signale (llms.txt, schema.org,
        interne Verlinkung, Content-Rhythmus) – damit nichts nur im Chat-Verlauf hängen bleibt.
      </p>

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
    </main>
  );
}
