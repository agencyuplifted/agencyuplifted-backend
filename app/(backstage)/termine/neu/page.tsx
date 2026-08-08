export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { createSeminartermin } from "@/lib/actions";

export default async function NeuerTerminPage() {
  const supabase = getSupabaseAdmin();
  const { data: seminartypen } = await supabase.from("seminartypen").select("*").order("name");
  const { data: orte } = await supabase.from("veranstaltungsorte").select("*").order("name");
  const { data: trainerListe } = await supabase.from("trainer").select("*").order("name");

  return (
    <main>
      <h1>Neuer Seminartermin</h1>
      <form action={createSeminartermin} style={{ maxWidth: 560 }}>
        <div className="au-row-2">
          <div>
            <label className="au-label">Titel des Seminars</label>
            <input className="au-input" name="titel" placeholder="z. B. Preisfindung Intensiv – Herbst 2026" required />
          </div>
          <div>
            <label className="au-label">Kennung (optional, z. B. SPS126)</label>
            <input className="au-input" name="kennung" placeholder="z. B. SPS126" />
          </div>
        </div>

        <label className="au-label">Seminartyp (Kategorie)</label>
        <select className="au-input" name="seminartyp_id" required>
          {seminartypen?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div className="au-card">
          <strong>Termin</strong>
          <div className="au-row-2" style={{ marginTop: "0.75rem" }}>
            <div>
              <label className="au-label">Startdatum</label>
              <input className="au-input" name="datum_start" type="date" required />
            </div>
            <div>
              <label className="au-label">Startuhrzeit</label>
              <input className="au-input" name="zeit_start" type="time" defaultValue="09:00" />
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Enddatum (leer = eintägig)</label>
              <input className="au-input" name="datum_ende" type="date" />
            </div>
            <div>
              <label className="au-label">Enduhrzeit</label>
              <input className="au-input" name="zeit_ende" type="time" defaultValue="17:00" />
            </div>
          </div>
        </div>

        <div className="au-card">
          <strong>Vorabendanreise (optional)</strong>
          <div className="au-row-2" style={{ marginTop: "0.75rem" }}>
            <div>
              <label className="au-label">Anreisetag</label>
              <input className="au-input" name="vorabend_anreise_datum" type="date" />
            </div>
            <div>
              <label className="au-label">Uhrzeit</label>
              <input className="au-input" name="vorabend_anreise_uhrzeit" type="time" />
            </div>
          </div>
        </div>

        <div className="au-row-2">
          <div>
            <label className="au-label">Format</label>
            <select className="au-input" name="format" defaultValue="praesenz">
              <option value="praesenz">Präsenz</option>
              <option value="online">Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label className="au-label">Ort</label>
            <select className="au-input" name="veranstaltungsort_id">
              <option value="">—</option>
              {orte?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.ort ? ` – ${o.ort}` : ""}{o.nahe_grossstadt ? ` (bei ${o.nahe_grossstadt})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="au-label">Trainer</label>
        <select className="au-input" name="trainer_id">
          <option value="">—</option>
          {trainerListe?.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <div className="au-row-2">
          <div>
            <label className="au-label">Kapazität</label>
            <input className="au-input" name="kapazitaet" type="number" defaultValue={12} />
          </div>
          <div>
            <label className="au-label">Mindestteilnehmerzahl</label>
            <input className="au-input" name="mindestteilnehmerzahl" type="number" defaultValue={5} />
          </div>
        </div>

        <div className="au-row-2">
          <div>
            <label className="au-label">Überbuchungspuffer (intern)</label>
            <input className="au-input" name="ueberbuchungspuffer" type="number" defaultValue={3} />
          </div>
          <div>
            <label className="au-label">Angezeigte Restplätze (manuell, Urgency)</label>
            <input className="au-input" name="angezeigte_restplaetze" type="number" placeholder="leer = kein Hinweis" />
          </div>
        </div>

        <p style={{ fontSize: "0.85rem" }}>
          Preise, Optionen (A/B/C) und Frühbucherstaffeln werden nach dem Anlegen auf der Termin-Detailseite eingerichtet.
        </p>

        <div className="au-card">
          <strong>Zusätzlicher Teilnehmer (Gruppenpreis)</strong>
          <p style={{ fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>
            Wenn mehrere Personen derselben Firma zusammen gebucht werden: Preis für die 2. (und weitere) Person(en). Entweder Festpreis ODER Rabatt in % angeben, nicht beides.
          </p>
          <div className="au-row-2">
            <div>
              <label className="au-label">Festpreis pro weiterer Person (€)</label>
              <input className="au-input" name="zusatzteilnehmer_preis" type="number" step="0.01" placeholder="z. B. 990" />
            </div>
            <div>
              <label className="au-label">oder Rabatt (%)</label>
              <input className="au-input" name="zusatzteilnehmer_rabatt_prozent" type="number" step="0.1" placeholder="z. B. 15" />
            </div>
          </div>
        </div>

        <button type="submit" className="au-btn au-btn-primary">
          Termin anlegen
        </button>
      </form>
    </main>
  );
}
