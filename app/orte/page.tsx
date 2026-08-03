export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createVeranstaltungsort } from "@/lib/actions";

export default async function OrtePage() {
  const supabase = getSupabaseAdmin();
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");

  return (
    <main>
      <h1>Veranstaltungsorte</h1>
      <p>Hotels/Locations, in denen Präsenz-Seminare stattfinden.</p>

      <table className="au-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Adresse</th>
            <th>Ort</th>
            <th>Nahe Großstadt</th>
          </tr>
        </thead>
        <tbody>
          {orte?.map((o) => (
            <tr key={o.id}>
              <td>{o.name}</td>
              <td>{o.adresse || "—"}</td>
              <td>{o.ort || "—"}</td>
              <td>{o.nahe_grossstadt ? `bei ${o.nahe_grossstadt}` : "—"}</td>
            </tr>
          ))}
          {!orte?.length && (
            <tr className="au-table-empty"><td colSpan={4}>Noch keine Orte erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div className="au-card" style={{ maxWidth: 600 }}>
        <h2>Neuer Ort</h2>
        <form action={createVeranstaltungsort} className="au-row-2">
          <div className="au-span-all">
            <label className="au-label">Name (z. B. Weißes Ross)</label>
            <input className="au-input" name="name" required />
          </div>
          <div className="au-span-all">
            <label className="au-label">Adresse</label>
            <input className="au-input" name="adresse" placeholder="Straße, PLZ, Land" />
          </div>
          <div>
            <label className="au-label">Ort (z. B. Illschwang)</label>
            <input className="au-input" name="ort" />
          </div>
          <div>
            <label className="au-label">Nahe Großstadt (für Marketing, z. B. Nürnberg)</label>
            <input className="au-input" name="nahe_grossstadt" placeholder="wird angezeigt als „bei Nürnberg“" />
          </div>
          <div className="au-span-all">
            <button type="submit" className="au-btn au-btn-primary">Ort anlegen</button>
          </div>
        </form>
      </div>
    </main>
  );
}
