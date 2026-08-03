export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createOrganisation } from "@/lib/actions";
import OrganisationenTable from "./OrganisationenTable";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };

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

      <h2>Neue Organisation</h2>
      <form action={createOrganisation} style={{ maxWidth: 420 }}>
        <label style={labelStyle}>Name</label>
        <input style={inputStyle} name="name" required />
        <label style={labelStyle}>Straße</label>
        <input style={inputStyle} name="strasse" />
        <label style={labelStyle}>PLZ</label>
        <input style={inputStyle} name="plz" />
        <label style={labelStyle}>Ort</label>
        <input style={inputStyle} name="ort" />
        <label style={labelStyle}>USt-ID (falls Ausland)</label>
        <input style={inputStyle} name="ust_id" />
        <label style={labelStyle}>Branche</label>
        <input style={inputStyle} name="branche" />
        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Anlegen
        </button>
      </form>
    </main>
  );
}
