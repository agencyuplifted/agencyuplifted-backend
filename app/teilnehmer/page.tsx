export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createTeilnehmer } from "@/lib/actions";
import TeilnehmerTable from "./TeilnehmerTable";

export default async function TeilnehmerPage() {
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase
    .from("teilnehmer")
    .select("*, buchungspositionen(seminartermine(seminartypen(name))), legacy_buchungen(seminartypen(name))")
    .order("erstellt_am", { ascending: false });

  const rows = (teilnehmer || []).map((t: any) => {
    const seminare = Array.from(
      new Set([
        ...(t.buchungspositionen || []).map((p: any) => p.seminartermine?.seminartypen?.name),
        ...(t.legacy_buchungen || []).map((l: any) => l.seminartypen?.name),
      ].filter(Boolean))
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

      <div className="au-card" style={{ maxWidth: 460 }}>
        <h2>Neuer Teilnehmer</h2>
        <form action={createTeilnehmer}>
          <label className="au-label">Vorname</label>
          <input className="au-input" name="vorname" required />
          <label className="au-label">Nachname</label>
          <input className="au-input" name="nachname" required />
          <label className="au-label">E-Mail</label>
          <input className="au-input" name="email" type="email" required />
          <label className="au-label">Telefon</label>
          <input className="au-input" name="telefon" />
          <label className="au-label">LinkedIn-URL</label>
          <input className="au-input" name="linkedin_url" />
          <label className="au-label">Ernährung / Sonderwünsche</label>
          <input className="au-input" name="ernaehrung" />
          <button type="submit" className="au-btn au-btn-primary">Anlegen</button>
        </form>
      </div>
    </main>
  );
}
