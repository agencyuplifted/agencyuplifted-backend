export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createTeilnehmer } from "@/lib/actions";
import TeilnehmerTable from "./TeilnehmerTable";
import AufklappBereich from "../AufklappBereich";

export default async function TeilnehmerPage() {
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase
    .from("teilnehmer")
    .select("*, buchungspositionen(seminartermine(seminartypen(name))), legacy_buchungen(seminartypen(name)), teilnehmer_organisationen(ist_hauptorganisation, organisationen(name))")
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
      position: t.position || null,
      agentur:
        ((t.teilnehmer_organisationen || []).find((z: any) => z.ist_hauptorganisation) || (t.teilnehmer_organisationen || [])[0])?.organisationen?.name ||
        t.firma_freitext ||
        null,
      consent: t.marketing_consent_status || "unbekannt",
      deaktiviert: !!t.deaktiviert_am,
    };
  });

  const aktiv = rows.filter((r) => !r.deaktiviert);
  const unternehmer = aktiv.filter((r) => r.unternehmer_status === "unternehmer").length;
  const abonniert = aktiv.filter((r) => r.consent === "abonniert").length;

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">{aktiv.length} Personen · {unternehmer} Unternehmer:innen · {abonniert} mit Marketing-Einwilligung</p>
          <h1>Teilnehmer</h1>
        </div>
        <div className="au-dash-aktionen">
          <a href="#neu" className="au-btn au-btn-primary au-btn-sm">+ Neuer Teilnehmer</a>
        </div>
      </header>

      <AufklappBereich merkSchluessel="teilnehmer-neu" oeffnenBeiHash="neu" className="au-aufklapp-panel au-neu-panel" zusammenfassung={<strong id="neu">Neuen Teilnehmer anlegen</strong>}>
        <form action={createTeilnehmer} style={{ maxWidth: 640 }}>
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
      </AufklappBereich>

      <TeilnehmerTable teilnehmer={rows} segmente={segmente || []} />
    </main>
  );
}
