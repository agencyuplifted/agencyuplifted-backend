export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createTeilnehmer } from "@/lib/actions";
import TeilnehmerTable from "./TeilnehmerTable";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };

export default async function TeilnehmerPage() {
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase
    .from("teilnehmer")
    .select("*, buchungspositionen(seminartermine(seminartypen(name)))")
    .order("erstellt_am", { ascending: false });

  const rows = (teilnehmer || []).map((t: any) => {
    const seminare = Array.from(
      new Set(
        (t.buchungspositionen || [])
          .map((p: any) => p.seminartermine?.seminartypen?.name)
          .filter(Boolean)
      )
    ) as string[];
    return {
      id: t.id,
      vorname: t.vorname,
      nachname: t.nachname,
      email: t.email,
      telefon: t.telefon,
      erstellt_am: t.erstellt_am,
      seminare,
    };
  });

  return (
    <main>
      <h1>Teilnehmer</h1>

      <TeilnehmerTable teilnehmer={rows} />

      <h2>Neuer Teilnehmer</h2>
      <form action={createTeilnehmer} style={{ maxWidth: 420 }}>
        <label style={labelStyle}>Vorname</label>
        <input style={inputStyle} name="vorname" required />
        <label style={labelStyle}>Nachname</label>
        <input style={inputStyle} name="nachname" required />
        <label style={labelStyle}>E-Mail</label>
        <input style={inputStyle} name="email" type="email" required />
        <label style={labelStyle}>Telefon</label>
        <input style={inputStyle} name="telefon" />
        <label style={labelStyle}>LinkedIn-URL</label>
        <input style={inputStyle} name="linkedin_url" />
        <label style={labelStyle}>Ernährung / Sonderwünsche</label>
        <input style={inputStyle} name="ernaehrung" />
        <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
          Anlegen
        </button>
      </form>
    </main>
  );
}
