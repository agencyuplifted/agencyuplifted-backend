import { setzeAufgabeErledigt, archiviereAufgabe, speichereAufgabe } from "@/lib/actions";
import { formatTag } from "@/lib/events";
import AktionsFormular from "../AktionsFormular";

// Eine Aufgabe mit Abhaken, Faelligkeit, Bearbeiten und Archivieren --
// genutzt auf der Event-Seite, unter /wiedervorlage und im Dashboard.
export default function AufgabeZeile({
  aufgabe,
  heute,
  reiheId,
  kontext,
}: {
  aufgabe: { id: string; titel: string; faellig_am: string | null; erledigt_am: string | null; notizen: string | null };
  heute: string;
  reiheId?: string | null;
  kontext?: React.ReactNode;
}) {
  const erledigt = !!aufgabe.erledigt_am;
  const ueberfaellig = !erledigt && !!aufgabe.faellig_am && aufgabe.faellig_am < heute;
  const heuteFaellig = !erledigt && aufgabe.faellig_am === heute;
  return (
    <div className={`au-aufgabe${erledigt ? " erledigt" : ""}`}>
      <AktionsFormular action={setzeAufgabeErledigt}>
        <input type="hidden" name="id" value={aufgabe.id} />
        <input type="hidden" name="erledigt" value={String(!erledigt)} />
        <input type="hidden" name="event_reihe_id" value={reiheId || ""} />
        <button type="submit" className="au-haken" aria-label={erledigt ? "wieder öffnen" : "erledigt"} title={erledigt ? "wieder öffnen" : "als erledigt markieren"}>
          {erledigt ? "✓" : ""}
        </button>
      </AktionsFormular>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="au-aufgabe-titel">{aufgabe.titel}</div>
        <div className="au-klein">
          <span className={ueberfaellig ? "au-text-danger" : heuteFaellig ? "au-text-warning" : undefined}>
            {aufgabe.faellig_am ? (ueberfaellig ? "überfällig seit " : heuteFaellig ? "heute · " : "fällig ") + formatTag(aufgabe.faellig_am) : "ohne Termin"}
          </span>
          {kontext && <> · {kontext}</>}
        </div>
        {aufgabe.notizen && <div className="au-klein" style={{ whiteSpace: "pre-wrap" }}>{aufgabe.notizen}</div>}
        {!erledigt && (
          <details>
            <summary className="au-klein">bearbeiten</summary>
            <AktionsFormular action={speichereAufgabe} className="au-inline-form" style={{ marginTop: "0.35rem" }}>
              <input type="hidden" name="id" value={aufgabe.id} />
              <input type="hidden" name="event_reihe_id" value={reiheId || ""} />
              <input className="au-input" name="titel" defaultValue={aufgabe.titel} required />
              <input className="au-input" name="faellig_am" type="date" defaultValue={aufgabe.faellig_am || ""} />
              <input className="au-input" name="notizen" defaultValue={aufgabe.notizen || ""} placeholder="Notiz" />
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
            </AktionsFormular>
            <AktionsFormular action={archiviereAufgabe} bestaetigung="Aufgabe archivieren? Sie verschwindet aus allen Listen, bleibt aber in der Datenbank.">
              <input type="hidden" name="id" value={aufgabe.id} />
              <input type="hidden" name="event_reihe_id" value={reiheId || ""} />
              <button type="submit" className="au-link-danger">archivieren</button>
            </AktionsFormular>
          </details>
        )}
      </div>
    </div>
  );
}
