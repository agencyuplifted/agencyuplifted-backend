"use client";

import { useEffect, useState, useTransition } from "react";
import { pruefeKandidat, legeKandidatAn } from "@/lib/terminplaner-actions";
import type { Bewertung } from "@/lib/terminplaner";
import BewertungAnzeige from "./BewertungAnzeige";

// Schlanke Draft-Maske: Datum + Format (optional Ort/Kategorie). Bewertet
// sofort mit derselben Logik wie die Vorschlaege -- nur zur Information,
// keine Sperre. Einzige Ausnahme: Ueberschneidung mit eigenem Termin muss
// bewusst bestaetigt werden.
export default function ManuellerKandidat({
  formate,
  orte,
  typen,
  jahr,
}: {
  formate: { id: string; name: string; start_uhrzeit: string | null; end_uhrzeit: string | null; mitHotel: boolean }[];
  orte: { id: string; name: string }[];
  typen: { id: string; name: string }[];
  jahr: number;
}) {
  const [start, setStart] = useState("");
  const [formatId, setFormatId] = useState(formate.find((f) => f.name.startsWith("3-Tage"))?.id || formate[0]?.id || "");
  const [bewertung, setBewertung] = useState<Bewertung | null>(null);
  const [meldung, setMeldung] = useState<{ fehler: string | null; info?: string } | null>(null);
  const [kollisionOk, setKollisionOk] = useState(false);
  const [laeuft, starte] = useTransition();
  const format = formate.find((f) => f.id === formatId);

  useEffect(() => {
    setBewertung(null);
    setKollisionOk(false);
    if (!start || !formatId) return;
    const t = setTimeout(async () => {
      const r = await pruefeKandidat(start, formatId);
      if (!r.fehler && r.bewertung) setBewertung(r.bewertung);
    }, 250);
    return () => clearTimeout(t);
  }, [start, formatId]);

  return (
    <form
      className="au-tp-manuell"
      action={(fd) =>
        starte(async () => {
          setMeldung(null);
          const r = await legeKandidatAn(fd);
          setMeldung(r);
          if (!r.fehler) {
            setStart("");
            setBewertung(null);
          }
        })
      }
    >
      <input type="hidden" name="herkunft" value="manuell" />
      <div className="au-tp-manuell-felder">
        <label>
          <span className="au-klein">Erster Seminartag</span>
          <input className="au-input" type="date" name="datum_start" value={start} min={`${jahr - 1}-01-01`} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <label>
          <span className="au-klein">Format</span>
          <select className="au-select" name="format_id" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {formate.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-klein">Ort (optional)</span>
          <select className="au-select" name="veranstaltungsort_id" defaultValue="">
            <option value="">– offen –</option>
            {orte.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-klein">Kategorie (optional)</span>
          <select className="au-select" name="seminartyp_id" defaultValue="">
            <option value="">– offen –</option>
            {typen.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      </div>

      {format && (format.start_uhrzeit || !format.mitHotel) && (
        <div className="au-tp-form" key={formatId}>
          <label className="au-klein au-tp-inline">Beginn <input className="au-input au-tp-zeit" type="time" name="start_uhrzeit" defaultValue={format.start_uhrzeit?.slice(0, 5) || ""} /></label>
          <label className="au-klein au-tp-inline">Ende <input className="au-input au-tp-zeit" type="time" name="end_uhrzeit" defaultValue={format.end_uhrzeit?.slice(0, 5) || ""} /></label>
          <span className="au-klein">Touring: jede Stadt als eigenen Termin speichern (Ort wählen, merken, nächste Stadt).</span>
        </div>
      )}

      {bewertung && (
        <div className="au-tp-manuell-ergebnis">
          <BewertungAnzeige b={bewertung} />
          {bewertung.kollision && (
            <label className="au-tp-kollision">
              <input type="checkbox" name="kollision_bestaetigt" checked={kollisionOk} onChange={(e) => setKollisionOk(e.target.checked)} />
              <span><strong>Überschneidung bewusst in Kauf nehmen</strong> – {bewertung.kollision}</span>
            </label>
          )}
          {!bewertung.kollision && bewertung.gesperrt && (
            <p className="au-klein" style={{ margin: 0 }}>Hinweis: Den würde der Algorithmus nicht vorschlagen ({bewertung.gesperrt}). Speichern geht trotzdem.</p>
          )}
        </div>
      )}

      <div className="au-tp-manuell-fuss">
        <button type="submit" name="status" value="vorgeschlagen" className="au-btn au-btn-secondary au-btn-sm" disabled={laeuft || !start || (!!bewertung?.kollision && !kollisionOk)}>
          Als Kandidat merken
        </button>
        <button type="submit" name="status" value="in_pruefung" className="au-btn au-btn-primary au-btn-sm" disabled={laeuft || !start || (!!bewertung?.kollision && !kollisionOk)}>
          Direkt „in Prüfung“ ({format?.mitHotel === false ? "Location anfragen" : "Hotel anfragen"})
        </button>
        {meldung && <span className="au-klein" style={{ color: meldung.fehler ? "var(--color-danger)" : "var(--color-success)" }}>{meldung.fehler || meldung.info}</span>}
      </div>
    </form>
  );
}
