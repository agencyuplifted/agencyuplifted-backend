export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createWartelisteEintrag, benachrichtigeWarteliste } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

export default async function WartelistePage() {
  const supabase = getSupabaseAdmin();
  const { data: eintraege } = await supabase
    .from("warteliste")
    .select("*, seminartermine(datum_start, seminartypen(name))")
    .order("angemeldet_am", { ascending: true });

  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .order("datum_start");

  return (
    <main>
      <h1>Warteliste</h1>
      <p>Interessenten für ausgebuchte oder fast ausgebuchte Termine.</p>

      <table className="au-table">
        <thead>
          <tr>
            <th>Termin</th>
            <th>Name</th>
            <th>E-Mail</th>
            <th>Angemeldet</th>
            <th>Benachrichtigt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {eintraege?.map((e: any) => (
            <tr key={e.id}>
              <td>{e.seminartermine ? `${e.seminartermine.seminartypen?.name} – ${formatDatum(e.seminartermine.datum_start)}` : "—"}</td>
              <td>{e.name || "—"}</td>
              <td>{e.email}</td>
              <td>{formatDatum(e.angemeldet_am)}</td>
              <td>{e.benachrichtigt_am ? formatDatum(e.benachrichtigt_am) : "—"}</td>
              <td>
                {!e.benachrichtigt_am && (
                  <form action={benachrichtigeWarteliste}>
                    <input type="hidden" name="eintrag_id" value={e.id} />
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Als benachrichtigt markieren</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {!eintraege?.length && (
            <tr className="au-table-empty"><td colSpan={6}>Noch keine Warteliste-Einträge.</td></tr>
          )}
        </tbody>
      </table>

      <div className="au-card" style={{ maxWidth: 600 }}>
        <h2>Manuell hinzufügen</h2>
        <form action={createWartelisteEintrag} className="au-row-2">
          <div className="au-span-all">
            <label className="au-label">Seminartermin</label>
            <select className="au-select" name="seminartermin_id" required>
              {termine?.map((t: any) => (
                <option key={t.id} value={t.id}>{t.seminartypen?.name} – {formatDatum(t.datum_start)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="au-label">Name</label>
            <input className="au-input" name="name" />
          </div>
          <div>
            <label className="au-label">E-Mail</label>
            <input className="au-input" name="email" type="email" required />
          </div>
          <div className="au-span-all">
            <button type="submit" className="au-btn au-btn-primary">Zur Warteliste hinzufügen</button>
          </div>
        </form>
      </div>
    </main>
  );
}
