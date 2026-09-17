"use client";

import { formatEURBrutto } from "@/lib/format";
import {
  normalisiereVorlageStufen,
  berechneStichtagMitRegel,
  berechneVorlagenStichtage,
  formatKalendertag,
  tagePlus,
  type PreisstaffelVorlageStufe,
  type StichtagRegel,
} from "@/lib/preisstaffeln";

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

export type StichtagVorschau = { terminDatumStart: string; regel: StichtagRegel | null };

function heuteISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Vorschau-Zelle "welcher Kalendertag wird das fuer diesen Termin" -- mit
// Regel inkl. Verschiebung und Grund, damit vor dem Uebernehmen sichtbar ist,
// was aus "90 Tage vor Start" wird.
function StichtagZelle({ tage, vorschau }: { tage: string; vorschau: StichtagVorschau }) {
  const n = tage === "" ? NaN : Number(tage);
  if (!Number.isInteger(n) || n < 0) return <span style={{ color: "var(--color-text-faint)" }}>—</span>;
  if (n === 0) return <span style={{ color: "var(--color-text-muted)" }}>bis Vortag Seminarstart (Normalpreis)</span>;

  const klein = { display: "block", fontSize: "0.72rem", lineHeight: 1.3 } as const;
  const verstrichen = (tag: string) =>
    tag < heuteISO() ? <span style={{ ...klein, color: "var(--color-text-faint)" }}>bereits verstrichen</span> : null;

  if (!vorschau.regel) {
    const tag = tagePlus(vorschau.terminDatumStart, -n);
    return (
      <span style={{ color: "var(--color-text-muted)" }}>
        {formatKalendertag(tag)}
        {verstrichen(tag)}
      </span>
    );
  }

  const b = berechneStichtagMitRegel(vorschau.terminDatumStart, n, vorschau.regel);
  return (
    <span>
      <strong style={{ fontWeight: 600 }}>{formatKalendertag(b.stichtag)}</strong>
      {b.verschiebung !== 0 && (
        <span style={{ ...klein, color: "var(--color-text-faint)" }}>
          statt {formatKalendertag(b.ausgangstag)} ({b.verschiebung > 0 ? "+" : "−"}
          {Math.abs(b.verschiebung)} T.{b.grund ? `, ${b.grund}` : ""})
        </span>
      )}
      {!b.gefunden ? (
        <span style={{ ...klein, color: "var(--color-danger)" }}>kein passender Tag gefunden</span>
      ) : b.ausserhalbMax ? (
        <span style={{ ...klein, color: "var(--color-warning)" }}>mehr als ±{vorschau.regel.max_verschiebung_tage} Tage verschoben</span>
      ) : null}
      {verstrichen(b.stichtag)}
    </span>
  );
}

export default function StufenEditor({
  entwurf,
  onChange,
  deaktiviert = false,
  stichtagVorschau,
}: {
  entwurf: StufeEntwurf[];
  onChange: (entwurf: StufeEntwurf[]) => void;
  deaktiviert?: boolean;
  stichtagVorschau?: StichtagVorschau | null;
}) {
  // Kollision (zwei Stufen nach dem Verschieben auf demselben Tag) nur
  // pruefbar, wenn der Entwurf gueltig ist -- sonst zeigt das Speichern ohnehin
  // die konkrete Validierungsmeldung.
  let kollision: string | null = null;
  if (stichtagVorschau?.regel) {
    try {
      kollision = berechneVorlagenStichtage(entwurfZuStufen(entwurf), stichtagVorschau.terminDatumStart, stichtagVorschau.regel).kollision;
    } catch {
      kollision = null;
    }
  }

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
        <table className="au-table" style={{ marginBottom: "0.5rem", minWidth: stichtagVorschau ? 720 : 520 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 150 }}>gilt bis … Tage vor Start</th>
              <th style={{ width: 140 }}>Preis (€, netto)</th>
              {stichtagVorschau && <th style={{ width: 190 }}>Stichtag</th>}
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
                  {stichtagVorschau && (
                    <td style={{ verticalAlign: "middle", fontSize: "0.85rem" }}>
                      <StichtagZelle tage={e.tage} vorschau={stichtagVorschau} />
                    </td>
                  )}
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
      {(() => {
        // Gleicher Hinweis wie im Termin (normalpreisLuecke): ohne 0-Tage-Stufe
        // endet auch der Normalpreis mit festem Datum vor dem Seminar.
        const zahlen = entwurf.map((e) => (e.tage === "" ? NaN : Number(e.tage))).filter((n) => Number.isInteger(n) && n >= 0);
        if (!zahlen.length || zahlen.length !== entwurf.length || Math.min(...zahlen) === 0) return null;
        return (
          <div className="au-banner au-banner-warning" style={{ margin: "0 0 0.5rem", padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
            Die letzte Stufe endet {Math.min(...zahlen)} Tage vor Start. Für den Normalpreis „0“ eintragen – er gilt dann bis zum Tag vor Seminarstart.
          </div>
        );
      })()}
      {kollision && (
        <div className="au-banner au-banner-error" style={{ margin: "0 0 0.5rem", padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}>
          {kollision}
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={stufeHinzufuegen} disabled={deaktiviert}>
          + Stufe
        </button>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={sortieren} disabled={deaktiviert || entwurf.length < 2}>
          Nach Stichtag sortieren
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
          Stufe gilt bis X Tage vor Seminarstart · 0 = Normalpreis, gilt bis zum Tag vor Seminarstart
        </span>
      </div>
    </div>
  );
}
