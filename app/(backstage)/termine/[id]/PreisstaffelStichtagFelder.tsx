"use client";

import { useState } from "react";

// Umschalter fuer das "Preisstufe anlegen/bearbeiten"-Formular: eine
// Preisstufe endet entweder nach einer relativen Frist vor Terminstart
// ("Tage vor Start") oder zu einem festen Kalendertag ("Festes Datum"), nie
// beides gleichzeitig. Je nach Auswahl wird nur das passende Input gerendert
// -- das nicht gerenderte Feld fehlt dann in der FormData, create-/
// updatePreisstaffel (lib/actions.ts) lesen zusaetzlich stichtag_modus, um
// eindeutig zu wissen, welches Feld gemeint ist (falls beide leer waeren).
// initialModus/-TageVorStart/-Datum fuellen das Formular beim Bearbeiten
// einer bestehenden Preisstufe mit deren aktuellen Werten vor.
export default function PreisstaffelStichtagFelder({
  initialModus = "tage",
  initialTageVorStart,
  initialDatum,
}: {
  initialModus?: "tage" | "datum";
  initialTageVorStart?: number | null;
  initialDatum?: string | null;
}) {
  const [modus, setModus] = useState<"tage" | "datum">(initialModus);

  return (
    <div>
      <label className="au-label">Stichtag</label>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.35rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400 }}>
          <input type="radio" name="stichtag_modus" value="tage" checked={modus === "tage"} onChange={() => setModus("tage")} />
          Tage vor Start
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400 }}>
          <input type="radio" name="stichtag_modus" value="datum" checked={modus === "datum"} onChange={() => setModus("datum")} />
          Festes Datum
        </label>
      </div>
      {modus === "tage" ? (
        <input className="au-input" name="stichtag_tage_vor_start" type="number" defaultValue={initialTageVorStart ?? undefined} required />
      ) : (
        <input className="au-input" name="stichtag_datum" type="date" defaultValue={initialDatum ?? undefined} required />
      )}
    </div>
  );
}
