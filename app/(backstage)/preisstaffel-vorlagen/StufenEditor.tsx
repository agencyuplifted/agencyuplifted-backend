"use client";

import { formatEURBrutto } from "@/lib/format";
import { normalisiereVorlageStufen, type PreisstaffelVorlageStufe } from "@/lib/preisstaffeln";

// Editierbare Liste von Preisstufen im relativen Modus ("Tage vor Start").
// Gemeinsam genutzt von der Vorlagen-Verwaltung (/preisstaffel-vorlagen) und
// der "Aus Vorlage laden"-Vorschau im Termin (PreisstaffelVorlagenAktionen),
// damit beide Stellen identisch aussehen und dieselbe Validierung nutzen.
// Zahlenfelder bleiben im Entwurf Strings -- sonst liesse sich ein Feld beim
// Tippen nicht voruebergehend leeren (Number("") = 0 wuerde sofort eine 0
// hineinschreiben).

export type StufeEntwurf = { key: string; name: string; tage: string; preis: string };

let naechsterKey = 0;
function neuerKey() {
  naechsterKey += 1;
  return `stufe-${naechsterKey}`;
}

export function entwurfAusStufen(stufen: PreisstaffelVorlageStufe[]): StufeEntwurf[] {
  return stufen.map((s) => ({
    key: neuerKey(),
    name: s.name,
    tage: String(s.stichtag_tage_vor_start),
    preis: String(s.preis),
  }));
}

export function leererEntwurf(): StufeEntwurf[] {
  return [{ key: neuerKey(), name: "Normalpreis", tage: "0", preis: "" }];
}

// Wirft einen anzeigbaren Fehler, wenn der Entwurf ungueltig ist.
export function entwurfZuStufen(entwurf: StufeEntwurf[]): PreisstaffelVorlageStufe[] {
  return normalisiereVorlageStufen(
    entwurf.map((e) => ({ name: e.name, stichtag_tage_vor_start: e.tage, preis: e.preis }))
  );
}

const zellenInput = { marginBottom: 0 } as const;

export default function StufenEditor({
  entwurf,
  onChange,
  deaktiviert = false,
}: {
  entwurf: StufeEntwurf[];
  onChange: (entwurf: StufeEntwurf[]) => void;
  deaktiviert?: boolean;
}) {
  function aendere(key: string, feld: "name" | "tage" | "preis", wert: string) {
    onChange(entwurf.map((e) => (e.key === key ? { ...e, [feld]: wert } : e)));
  }

  // Neue Stufen werden oben eingefuegt, mit etwas mehr Vorlauf als die bisher
  // frueheste Stufe -- typischer Fall ist "noch eine frühere Frühbucherstufe".
  function stufeHinzufuegen() {
    const maxTage = entwurf.reduce((m, e) => Math.max(m, Number(e.tage) || 0), 0);
    const vorschlag = entwurf.length ? maxTage + 30 : 0;
    onChange([{ key: neuerKey(), name: "", tage: String(vorschlag), preis: "" }, ...entwurf]);
  }

  // Sortiert nach Stichtag wie in der spaeteren Options-Tabelle; nur auf
  // Knopfdruck statt bei jeder Eingabe, sonst springt die Zeile beim Tippen weg.
  function sortieren() {
    onChange([...entwurf].sort((a, b) => (Number(b.tage) || 0) - (Number(a.tage) || 0)));
  }

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="au-table" style={{ marginBottom: "0.5rem", minWidth: 520 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 130 }}>Tage vor Start</th>
              <th style={{ width: 140 }}>Preis (€, netto)</th>
              <th style={{ width: 120 }}>Brutto (19% USt.)</th>
              <th style={{ width: 70 }}></th>
            </tr>
          </thead>
          <tbody>
            {entwurf.map((e) => {
              const preisZahl = e.preis === "" ? NaN : Number(e.preis);
              return (
                <tr key={e.key}>
                  <td>
                    <input
                      className="au-input"
                      style={zellenInput}
                      value={e.name}
                      placeholder="z. B. Super-Frühbucher"
                      disabled={deaktiviert}
                      onChange={(ev) => aendere(e.key, "name", ev.target.value)}
                      aria-label="Name der Stufe"
                    />
                  </td>
                  <td>
                    <input
                      className="au-input"
                      style={zellenInput}
                      type="number"
                      min={0}
                      step={1}
                      value={e.tage}
                      disabled={deaktiviert}
                      onChange={(ev) => aendere(e.key, "tage", ev.target.value)}
                      aria-label="Tage vor Start"
                    />
                  </td>
                  <td>
                    <input
                      className="au-input"
                      style={zellenInput}
                      type="number"
                      min={0}
                      step="0.01"
                      value={e.preis}
                      disabled={deaktiviert}
                      onChange={(ev) => aendere(e.key, "preis", ev.target.value)}
                      aria-label="Preis netto"
                    />
                  </td>
                  <td style={{ color: "var(--color-text-muted)", verticalAlign: "middle" }}>
                    {Number.isFinite(preisZahl) ? formatEURBrutto(preisZahl) : "—"}
                  </td>
                  <td style={{ verticalAlign: "middle" }}>
                    <button
                      type="button"
                      className="au-link-danger"
                      disabled={deaktiviert || entwurf.length <= 1}
                      title={entwurf.length <= 1 ? "Eine Vorlage braucht mindestens eine Stufe" : undefined}
                      onClick={() => onChange(entwurf.filter((x) => x.key !== e.key))}
                    >
                      entfernen
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={stufeHinzufuegen} disabled={deaktiviert}>
          + Stufe
        </button>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={sortieren} disabled={deaktiviert || entwurf.length < 2}>
          Nach Stichtag sortieren
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
          Stufe gilt bis X Tage vor Seminarstart · 0 Tage = Normalpreis bis zum Start
        </span>
      </div>
    </div>
  );
}
