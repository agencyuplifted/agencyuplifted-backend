"use client";

import { useState } from "react";

type Kategorie = { id: string; name: string };

// Gleiche Logik wie im "Neues Exemplar"-Formular: Kundenstatus (Neu/Bestand)
// ist nur bei der Kategorie "Agenturunternehmer" relevant.
export default function KategorieUndStatusFelder({
  kategorien,
  initialTyp,
  initialStatus,
}: {
  kategorien: Kategorie[];
  initialTyp: string;
  initialStatus: string | null;
}) {
  const [typ, setTyp] = useState(initialTyp || kategorien[0]?.name || "");
  const [status, setStatus] = useState(initialStatus || "neu");

  return (
    <div className="au-row-2">
      <div>
        <label className="au-label">Empfänger ist</label>
        <select className="au-select" name="empfaenger_typ" value={typ} onChange={(e) => setTyp(e.target.value)}>
          {kategorien.map((k) => (
            <option key={k.id} value={k.name}>
              {k.name}
            </option>
          ))}
          {typ && !kategorien.some((k) => k.name === typ) && (
            // Falls die gespeicherte Kategorie inzwischen gelöscht wurde,
            // trotzdem als Option anbieten, damit sie nicht stillschweigend
            // wegfällt.
            <option value={typ}>{typ} (nicht mehr in der Liste)</option>
          )}
        </select>
      </div>
      {typ === "Agenturunternehmer" && (
        <div>
          <label className="au-label">Kundenstatus</label>
          <select className="au-select" name="empfaenger_status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="neu">Neu (potenzieller Kunde)</option>
            <option value="bestand">Bestand (schon Kunde)</option>
          </select>
        </div>
      )}
    </div>
  );
}
