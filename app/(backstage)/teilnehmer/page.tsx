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
  const { data: segmente } = await supabase
    .from("teilnehmer_segmente")
    .select("*")
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
      anrede: t.anrede || "keine_angabe",
      rolle: t.rolle || "teilnehmer",
      unternehmer_status: t.unternehmer_status || "unbekannt",
      seminare,
    };
  });

  return (
    <main>
      <h1>Teilnehmer</h1>

      <TeilnehmerTable teilnehmer={rows} segmente={segmente || []} />

      <div className="au-card" style={{ maxWidth: 620 }}>
        <h2>Neuer Teilnehmer</h2>
        <form action={createTeilnehmer}>
          <div className="au-row-3">
            <div>
              <label className="au-label">Anrede</label>
              <select className="au-select" name="anrede" defaultValue="keine_angabe">
                <option value="keine_angabe">—</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="Divers">Divers</option>
              </select>
            </div>
            <div>
              <label className="au-label">Geburtsdatum</label>
              <input className="au-input" name="geburtsdatum" type="date" />
            </div>
            <div>
              <label className="au-label">Unternehmer:in / Mitarbeiter:in</label>
              <select className="au-select" name="unternehmer_status" defaultValue="unbekannt">
                <option value="unbekannt">—</option>
                <option value="unternehmer">Unternehmer:in</option>
                <option value="mitarbeiter">Mitarbeiter:in</option>
              </select>
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Vorname</label>
              <input className="au-input" name="vorname" required />
            </div>
            <div>
              <label className="au-label">Nachname</label>
              <input className="au-input" name="nachname" required />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">E-Mail</label>
              <input className="au-input" name="email" type="email" required />
            </div>
            <div>
              <label className="au-label">Zweite E-Mail (optional)</label>
              <input className="au-input" name="email_zweite" type="email" />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Telefon</label>
              <input className="au-input" name="telefon" />
            </div>
            <div>
              <label className="au-label">Mobiltelefon</label>
              <input className="au-input" name="mobiltelefon" />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Position / Jobtitel</label>
              <input className="au-input" name="position" />
            </div>
            <div>
              <label className="au-label">Firma (falls keine Organisation im System)</label>
              <input className="au-input" name="firma_freitext" />
            </div>
          </div>

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
