export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { erstelleKampagne } from "@/lib/actions";
import { ladeTeilnehmerFuerFilter, type FilterKriterien } from "@/lib/kampagnen";

export default async function NeueKampagnePage({
  searchParams,
}: {
  searchParams: Promise<{ anrede?: string; rolle?: string; seminartypen?: string; unternehmer_status?: string; segment_id?: string }>;
}) {
  const sp = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: segmente } = await supabase.from("teilnehmer_segmente").select("*").order("erstellt_am", { ascending: false });
  const { data: seminartypen } = await supabase.from("seminartypen").select("name").order("name");

  let filter: FilterKriterien;
  let aktivesSegment: { id: string; name: string } | null = null;

  if (sp.segment_id) {
    const segment = (segmente || []).find((s: any) => s.id === sp.segment_id);
    if (segment) {
      filter = segment.filter_kriterien || {};
      aktivesSegment = { id: segment.id, name: segment.name };
    } else {
      filter = {};
    }
  } else {
    filter = {
      anrede: sp.anrede ? [sp.anrede] : [],
      rolle: sp.rolle ? [sp.rolle] : [],
      seminartypen: sp.seminartypen ? [sp.seminartypen] : [],
      unternehmer_status: sp.unternehmer_status ? [sp.unternehmer_status] : [],
    };
  }

  const empfaenger = await ladeTeilnehmerFuerFilter(filter);

  const anredeWert = filter.anrede?.[0] || "";
  const rolleWert = filter.rolle?.[0] || "";
  const seminarWert = filter.seminartypen?.[0] || "";
  const unternehmerWert = filter.unternehmer_status?.[0] || "";

  return (
    <main>
      <h1>Neue Kampagne</h1>
      <p>
        Filter festlegen, Empfängerzahl prüfen, Inhalt schreiben. Der eigentliche Versand erfolgt erst im nächsten
        Schritt nach einer ausdrücklichen Bestätigung. Bereits abgemeldete Personen (Marketing-Consent) werden nie
        einbezogen.
      </p>

      {segmente && segmente.length > 0 && (
        <div className="au-card">
          <h2>Gespeicherte Filtergruppen</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {segmente.map((s: any) => (
              <Link
                key={s.id}
                href={`/kampagnen/neu?segment_id=${s.id}`}
                className={`au-btn au-btn-sm ${aktivesSegment?.id === s.id ? "au-btn-primary" : "au-btn-secondary"}`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="au-card">
        <h2>Filter {aktivesSegment ? `(aus Filtergruppe "${aktivesSegment.name}")` : "(manuell)"}</h2>
        <form method="get" action="/kampagnen/neu">
          <div className="au-row-2">
            <div>
              <label className="au-label">Geschlecht</label>
              <select className="au-select" name="anrede" defaultValue={anredeWert}>
                <option value="">Alle</option>
                <option value="Frau">Frauen</option>
                <option value="Herr">Männer</option>
                <option value="Divers">Divers</option>
                <option value="keine_angabe">Ohne Angabe</option>
              </select>
            </div>
            <div>
              <label className="au-label">Unternehmer:in / Mitarbeiter:in</label>
              <select className="au-select" name="unternehmer_status" defaultValue={unternehmerWert}>
                <option value="">Alle</option>
                <option value="unternehmer">Unternehmer:in</option>
                <option value="mitarbeiter">Mitarbeiter:in</option>
                <option value="unbekannt">Ohne Angabe</option>
              </select>
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Rolle (Event-Funktion)</label>
              <select className="au-select" name="rolle" defaultValue={rolleWert}>
                <option value="">Alle</option>
                <option value="teilnehmer">Teilnehmer</option>
                <option value="mitarbeiter">Mitarbeiter</option>
                <option value="gastreferent">Gastreferent</option>
                <option value="organisator">Organisator</option>
              </select>
            </div>
            <div>
              <label className="au-label">Seminarkategorie besucht</label>
              <select className="au-select" name="seminartypen" defaultValue={seminarWert}>
                <option value="">Alle</option>
                {(seminartypen || []).map((s: any) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Filter anwenden</button>
        </form>
      </div>

      <div className="au-card au-card-tint">
        <strong>{empfaenger.length}</strong> Empfänger:innen treffen auf diesen Filter zu (abgemeldete Personen bereits ausgeschlossen).
        {empfaenger.length > 0 && (
          <details style={{ marginTop: "0.6rem" }}>
            <summary style={{ cursor: "pointer" }}>Empfänger:innen anzeigen</summary>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
              {empfaenger.slice(0, 50).map((e) => (
                <li key={e.id}>{e.vorname} {e.nachname} — {e.email}</li>
              ))}
              {empfaenger.length > 50 && <li>... und {empfaenger.length - 50} weitere</li>}
            </ul>
          </details>
        )}
      </div>

      {empfaenger.length === 0 ? (
        <div className="au-card">
          <p style={{ marginTop: 0 }}>Mit diesem Filter gibt es aktuell keine Empfänger:innen. Bitte Filter anpassen.</p>
        </div>
      ) : (
        <div className="au-card" style={{ maxWidth: 640 }}>
          <h2>Inhalt</h2>
          <form action={erstelleKampagne}>
            {anredeWert && <input type="hidden" name="anrede" value={anredeWert} />}
            {rolleWert && <input type="hidden" name="rolle" value={rolleWert} />}
            {seminarWert && <input type="hidden" name="seminartypen" value={seminarWert} />}
            {unternehmerWert && <input type="hidden" name="unternehmer_status" value={unternehmerWert} />}
            {aktivesSegment && <input type="hidden" name="segment_id" value={aktivesSegment.id} />}

            <label className="au-label">Name der Kampagne (intern)</label>
            <input className="au-input" name="name" required placeholder="z. B. Arbeitsgruppe Unternehmerinnen – Einladung" />

            <label className="au-label">Betreff</label>
            <input className="au-input" name="betreff" required placeholder="z. B. Einladung: Arbeitsgruppe Unternehmerinnen" />

            <label className="au-label">Inhalt ({"{{vorname}}"} / {"{{nachname}}"} verfügbar, Zeilenumbrüche werden übernommen)</label>
            <textarea className="au-textarea" name="inhalt" required placeholder={"Hallo {{vorname}},\n\n..."} />

            <button type="submit" className="au-btn au-btn-primary">
              Weiter zur Vorschau ({empfaenger.length} Empfänger:innen)
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
