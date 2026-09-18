"use client";

import { useState } from "react";

// Mehrfachauswahl der Tags eines Teilnehmers als Pills; gespeichert wird erst
// mit "Speichern" (setzeTeilnehmerTags gleicht hinzu/weg ab).
export default function TagAuswahl({
  teilnehmerId,
  tags,
  gesetzt,
  speichernAction,
}: {
  teilnehmerId: string;
  tags: { id: string; label: string; aktiv: boolean }[];
  gesetzt: { tag_id: string; quelle: string; gesetzt_am: string }[];
  speichernAction: (fd: FormData) => Promise<void>;
}) {
  const start = new Set(gesetzt.map((g) => g.tag_id));
  const [auswahl, setAuswahl] = useState(start);
  const geaendert = auswahl.size !== start.size || [...auswahl].some((id) => !start.has(id));
  // Deaktivierte Tags nur zeigen, wenn die Person sie noch hat
  const sichtbar = tags.filter((t) => t.aktiv || start.has(t.id));
  if (!sichtbar.length) {
    return <p className="au-klein" style={{ margin: 0 }}>Noch keine Tags angelegt – unter <a href="/tags">Tags</a> anlegen.</p>;
  }
  return (
    <form action={speichernAction}>
      <input type="hidden" name="teilnehmer_id" value={teilnehmerId} />
      <div className="au-chips">
        {sichtbar.map((t) => {
          const an = auswahl.has(t.id);
          const info = gesetzt.find((g) => g.tag_id === t.id);
          return (
            <label
              key={t.id}
              className={`au-chip${an ? " aktiv" : ""}`}
              title={info ? `${info.quelle === "manuell" ? "Von Hand" : "Automatisch"} gesetzt am ${new Date(info.gesetzt_am).toLocaleDateString("de-DE")}` : undefined}
            >
              <input
                type="checkbox"
                name="tags"
                value={t.id}
                checked={an}
                onChange={() => {
                  const neu = new Set(auswahl);
                  if (an) neu.delete(t.id);
                  else neu.add(t.id);
                  setAuswahl(neu);
                }}
                style={{ display: "none" }}
              />
              {t.label}
              {!t.aktiv && " (deaktiviert)"}
            </label>
          );
        })}
      </div>
      {geaendert && (
        <button type="submit" className="au-btn au-btn-primary au-btn-sm" style={{ marginTop: "0.6rem" }}>
          Tags speichern
        </button>
      )}
    </form>
  );
}
