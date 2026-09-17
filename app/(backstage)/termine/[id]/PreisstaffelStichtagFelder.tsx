"use client";

import { useState } from "react";
import { letzterGueltigerTag } from "@/lib/preisstaffeln";

// "Gilt bis"-Eingabe einer Preisstufe. Frueher hiess das Feld nur "Stichtag"
// ohne Hinweis, ob die Stufe AB oder BIS zu diesem Tag gilt -- beim
// nachtraeglichen Aendern war dadurch unklar, was man eigentlich einstellt.
// Jetzt: klare Formulierung plus Live-Vorschau des letzten Gueltigkeitstags,
// damit auch "Tage vor Start" sofort als konkretes Datum sichtbar ist.
//
// Je nach Modus wird nur das passende Input gerendert -- das andere fehlt in
// der FormData, create-/updatePreisstaffel (lib/actions.ts) lesen zusaetzlich
// stichtag_modus, um eindeutig zu wissen, welches Feld gemeint ist.
//
// "Normalpreis" ist kein eigener Datenbank-Zustand, sondern "0 Tage vor
// Start" (gilt bis einschl. Vortag): ein festes Enddatum fuer den Normalpreis
// hat nur Schaden angerichtet -- der Preis galt per Fallback ohnehin weiter,
// aber Onepage zeigte "gilt bis <vergangenes Datum>" und die Backstage
// "abgelaufen" (Vorlagen SPS-Option-A/B/C hatten 20 Tage hinterlegt).
export function formatTagMitWochentag(isoTag: string): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(j, m - 1, t)));
}

export default function PreisstaffelStichtagFelder({
  terminStart,
  initialModus = "datum",
  initialTageVorStart,
  initialDatum,
}: {
  terminStart: string;
  initialModus?: "tage" | "datum" | "normal";
  initialTageVorStart?: number | null;
  initialDatum?: string | null;
}) {
  const [modus, setModus] = useState<"tage" | "datum" | "normal">(
    initialModus === "tage" && initialTageVorStart === 0 ? "normal" : initialModus
  );
  const [tage, setTage] = useState<string>(initialTageVorStart != null ? String(initialTageVorStart) : "");
  const [datum, setDatum] = useState<string>(initialDatum ?? "");

  let vorschau: string | null = null;
  if (modus === "normal") {
    vorschau = letzterGueltigerTag({ stichtag_tage_vor_start: 0, stichtag_datum: null }, terminStart);
  } else if (modus === "tage" && tage !== "" && !Number.isNaN(Number(tage))) {
    vorschau = letzterGueltigerTag({ stichtag_tage_vor_start: Number(tage), stichtag_datum: null }, terminStart);
  } else if (modus === "datum" && datum) {
    vorschau = datum;
  }

  return (
    <div>
      <label className="au-label">Dieser Preis gilt bis einschließlich …</label>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400, fontSize: "0.85rem" }}>
          <input type="radio" checked={modus === "normal"} onChange={() => setModus("normal")} />
          dem Tag vor Seminarstart (Normalpreis)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400, fontSize: "0.85rem" }}>
          <input type="radio" checked={modus === "datum"} onChange={() => setModus("datum")} />
          einem festen Datum
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 400, fontSize: "0.85rem" }}>
          <input type="radio" checked={modus === "tage"} onChange={() => setModus("tage")} />
          X Tage vor Seminarstart
        </label>
      </div>
      <input type="hidden" name="stichtag_modus" value={modus === "datum" ? "datum" : "tage"} />
      {modus === "normal" ? (
        <input type="hidden" name="stichtag_tage_vor_start" value="0" />
      ) : modus === "datum" ? (
        <input
          className="au-input"
          name="stichtag_datum"
          type="date"
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          required
        />
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            className="au-input"
            name="stichtag_tage_vor_start"
            type="number"
            min={0}
            value={tage}
            onChange={(e) => setTage(e.target.value)}
            required
            style={{ maxWidth: 110 }}
          />
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>Tage vor Seminarstart</span>
        </div>
      )}
      <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: vorschau ? "var(--color-text-muted)" : "var(--color-text-faint)" }}>
        {vorschau ? (
          <>
            → letzter Tag zu diesem Preis: <strong>{formatTagMitWochentag(vorschau)}</strong>
            {vorschau > terminStart.slice(0, 10) && <span style={{ color: "var(--color-danger)" }}> (liegt nach Seminarstart)</span>}
          </>
        ) : (
          "→ Datum wählen, dann erscheint hier der letzte Tag zu diesem Preis."
        )}
      </p>
    </div>
  );
}
