"use client";

import { FEIERTAGS_LAENDER, WOCHENTAG_KURZ, type StichtagRegel } from "@/lib/preisstaffeln";

// Einstellungen "Stichtage auf passende Tage verschieben" einer Vorlage
// (siehe berechneStichtagMitRegel in lib/preisstaffeln.ts). Wochentage als
// Pillen zum An-/Abwaehlen, dazu Schnellauswahl fuer die typischen Faelle.

export const STANDARD_REGEL: StichtagRegel = {
  wochentage: [1, 2, 3, 4, 5],
  feiertage_laender: ["DE", "AT", "CH"],
  max_verschiebung_tage: 3,
};

const WOCHE_AB_MONTAG = [1, 2, 3, 4, 5, 6, 0];

const LAND_NAME: Record<string, string> = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz" };

const SCHNELLAUSWAHL: { label: string; wochentage: number[] }[] = [
  { label: "Nur Donnerstag", wochentage: [4] },
  { label: "Werktage (Mo–Fr)", wochentage: [1, 2, 3, 4, 5] },
  { label: "Kein Sonntag", wochentage: [1, 2, 3, 4, 5, 6] },
];

const pilleStyle = { cursor: "pointer", padding: "0.25rem 0.6rem", fontSize: "0.78rem", minWidth: 38 } as const;

export default function StichtagRegelFelder({
  regel,
  onChange,
  deaktiviert = false,
}: {
  regel: StichtagRegel | null;
  onChange: (regel: StichtagRegel | null) => void;
  deaktiviert?: boolean;
}) {
  const aktiv = regel !== null;
  const r = regel ?? STANDARD_REGEL;

  function setze(teil: Partial<StichtagRegel>) {
    onChange({ ...r, ...teil });
  }

  function toggleWochentag(w: number) {
    setze({ wochentage: r.wochentage.includes(w) ? r.wochentage.filter((x) => x !== w) : [...r.wochentage, w].sort() });
  }

  function toggleLand(land: (typeof FEIERTAGS_LAENDER)[number]) {
    setze({
      feiertage_laender: r.feiertage_laender.includes(land)
        ? r.feiertage_laender.filter((l) => l !== land)
        : FEIERTAGS_LAENDER.filter((l) => l === land || r.feiertage_laender.includes(l)),
    });
  }

  const nurEinTag = r.wochentage.length === 1;

  return (
    <div className="au-subcard" style={{ background: "#fff", marginBottom: "0.9rem", padding: "0.75rem 1rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={aktiv}
          disabled={deaktiviert}
          onChange={(e) => onChange(e.target.checked ? STANDARD_REGEL : null)}
        />
        Stichtage auf passende Tage verschieben
      </label>
      <p style={{ fontSize: "0.78rem", color: "var(--color-text-faint)", margin: "0.25rem 0 0 1.5rem" }}>
        {aktiv
          ? "Beim Laden in einen Termin wird jeder Stichtag (außer „0 Tage“) auf den nächstgelegenen erlaubten Tag verschoben und als festes Datum gespeichert. Der Stichtag ist der letzte Tag zum günstigeren Preis."
          : "Aus: Stufen bleiben beim Laden relativ („X Tage vor Start“), egal auf welchen Wochentag das fällt."}
      </p>

      {aktiv && (
        <div style={{ marginTop: "0.75rem", paddingLeft: "1.5rem" }}>
          <label className="au-label">Erlaubte Wochentage</label>
          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
            {WOCHE_AB_MONTAG.map((w) => {
              const an = r.wochentage.includes(w);
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={an}
                  className={`au-tab ${an ? "au-tab-active" : ""}`}
                  style={pilleStyle}
                  disabled={deaktiviert}
                  onClick={() => toggleWochentag(w)}
                >
                  {WOCHENTAG_KURZ[w]}
                </button>
              );
            })}
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-faint)", marginLeft: "0.5rem" }}>Schnellauswahl:</span>
            {SCHNELLAUSWAHL.map((s) => (
              <button
                key={s.label}
                type="button"
                disabled={deaktiviert}
                onClick={() => setze({ wochentage: s.wochentage })}
                style={{ background: "none", border: "none", padding: 0, color: "#0B1B33", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
              >
                {s.label}
              </button>
            ))}
          </div>
          {r.wochentage.length === 0 && (
            <p style={{ fontSize: "0.78rem", color: "var(--color-danger)", margin: "0.35rem 0 0" }}>Mindestens einen Wochentag auswählen.</p>
          )}

          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.85rem", alignItems: "flex-start" }}>
            <div>
              <label className="au-label">Feiertage ausschließen</label>
              <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap" }}>
                {FEIERTAGS_LAENDER.map((land) => (
                  <label key={land} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.88rem", cursor: "pointer" }} title={`Landesweite Feiertage ${LAND_NAME[land]}`}>
                    <input type="checkbox" checked={r.feiertage_laender.includes(land)} disabled={deaktiviert} onChange={() => toggleLand(land)} />
                    {land}
                  </label>
                ))}
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--color-text-faint)", margin: "0.3rem 0 0" }}>landesweite Feiertage, keine regionalen</p>
            </div>
            <div style={{ width: 150 }}>
              <label className="au-label">Max. Verschiebung (± Tage)</label>
              <input
                className="au-input"
                type="number"
                min={0}
                max={14}
                style={{ marginBottom: 0 }}
                value={r.max_verschiebung_tage}
                disabled={deaktiviert}
                onChange={(e) => setze({ max_verschiebung_tage: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
            </div>
          </div>
          {nurEinTag && r.max_verschiebung_tage < 3 && (
            <p style={{ fontSize: "0.78rem", color: "var(--color-warning)", margin: "0.5rem 0 0" }}>
              Bei nur einem Wochentag sind mindestens ±3 Tage nötig, damit immer ein passender Tag erreichbar ist.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
