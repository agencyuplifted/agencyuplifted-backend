export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createTrainer } from "@/lib/actions";

export default async function TrainerPage() {
  const supabase = getSupabaseAdmin();
  const { data: trainer } = await supabase.from("trainer").select("*").order("name");

  return (
    <main>
      <h1>Trainer</h1>
      <table className="au-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>E-Mail</th>
          </tr>
        </thead>
        <tbody>
          {trainer?.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.email || "—"}</td>
            </tr>
          ))}
          {!trainer?.length && (
            <tr className="au-table-empty"><td colSpan={2}>Noch keine Trainer erfasst.</td></tr>
          )}
        </tbody>
      </table>

      <div className="au-card" style={{ maxWidth: 600 }}>
        <h2>Neuer Trainer</h2>
        <form action={createTrainer} className="au-row-2">
          <div>
            <label className="au-label">Name</label>
            <input className="au-input" name="name" required />
          </div>
          <div>
            <label className="au-label">E-Mail</label>
            <input className="au-input" name="email" type="email" />
          </div>
          <div className="au-span-all">
            <button type="submit" className="au-btn au-btn-primary">Trainer anlegen</button>
          </div>
        </form>
      </div>
    </main>
  );
}
