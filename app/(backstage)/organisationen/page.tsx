export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createOrganisation } from "@/lib/actions";
import OrganisationenTable from "./OrganisationenTable";

export default async function OrganisationenPage() {
  const supabase = getSupabaseAdmin();
  const { data: orgs } = await supabase
    .from("organisationen")
    .select("*, buchungen(buchungspositionen(seminartermine(seminartypen(name)))), legacy_buchungen(seminartypen(name))")
    .order("erstellt_am", { ascending: false });

  const rows = (orgs || []).map((o: any) => {
    const seminare = Array.from(
      new Set([
        ...(o.buchungen || []).flatMap((b: any) => b.buchungspositionen || []).map((p: any) => p.seminartermine?.seminartypen?.name),
        ...(o.legacy_buchungen || []).map((l: any) => l.seminartypen?.name),
      ].filter(Boolean))
    ) as string[];
    return {
      id: o.id,
      name: o.name,
      ort: o.rechnungsadresse_ort,
      ust_id: o.ust_id,
      erstellt_am: o.erstellt_am,
      seminare,
    };
  });

  return (
    <main>
      <h1>Organisationen</h1>

      <OrganisationenTable organisationen={rows} />

      <div className="au-card" style={{ maxWidth: 460 }}>
        <h2>Neue Organisation</h2>
        <form action={createOrganisation}>
          <label className="au-label">Name</label>
          <input className="au-input" name="name" required />
          <label className="au-label">Straße</label>
          <input className="au-input" name="strasse" />
          <label className="au-label">PLZ</label>
          <input className="au-input" name="plz" />
          <label className="au-label">Ort</label>
          <input className="au-input" name="ort" />
          <label className="au-label">USt-ID (falls Ausland)</label>
          <input className="au-input" name="ust_id" />
          <label className="au-label">Branche</label>
          <input className="au-input" name="branche" />
          <button type="submit" className="au-btn au-btn-primary">Anlegen</button>
        </form>
      </div>
    </main>
  );
}
