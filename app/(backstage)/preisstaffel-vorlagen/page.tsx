export const dynamic = "force-dynamic";

import {
  listePreisstaffelVorlagen,
  createPreisstaffelVorlage,
  updatePreisstaffelVorlage,
  deletePreisstaffelVorlage,
  duplizierePreisstaffelVorlage,
} from "@/lib/actions";
import { formatDatumZeit, formatEUR, formatEURBrutto } from "@/lib/format";
import { stichtagRegelText } from "@/lib/preisstaffeln";
import VorlageFormular from "./VorlageFormular";
import VorlageLoeschenButton from "./VorlageLoeschenButton";
import VorlageDuplizierenButton from "./VorlageDuplizierenButton";

export default async function PreisstaffelVorlagenPage() {
  const vorlagen = await listePreisstaffelVorlagen();

  return (
    <main>
      <h1>Preisstaffel-Vorlagen</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Wiederverwendbare Preisstaffeln, die im Termin bei jeder Option über „Aus gespeicherter Vorlage laden“ übernommen werden können.
        Vorlagen arbeiten nur mit „Tage vor Start“ – so passen sie zu jedem Termin, unabhängig vom Datum.
      </p>

      <div className="au-card">
        <h3 style={{ marginTop: 0 }}>Neue Vorlage anlegen</h3>
        <VorlageFormular speichernAction={createPreisstaffelVorlage} />
      </div>

      <div className="au-card">
        <h3 style={{ marginTop: 0 }}>
          Gespeicherte Vorlagen <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.4rem", verticalAlign: "middle" }}>{vorlagen.length}</span>
        </h3>

        {vorlagen.map((v) => {
          const preise = v.stufen.map((s) => Number(s.preis));
          return (
            <div key={v.id} className="au-subcard">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <strong style={{ fontSize: "1rem" }}>{v.name}</strong>
                  <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.5rem" }}>
                    {v.stufen.length} {v.stufen.length === 1 ? "Stufe" : "Stufen"}
                  </span>
                  {preise.length > 0 && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                      {formatEUR(Math.min(...preise))} – {formatEUR(Math.max(...preise))} netto
                    </span>
                  )}
                  {v.beschreibung && (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{v.beschreibung}</p>
                  )}
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--color-text-faint)" }}>
                    Stichtage: {v.stichtag_regel ? `verschieben auf ${stichtagRegelText(v.stichtag_regel)}` : "nicht verschoben (relativ)"}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
                    zuletzt geändert {formatDatumZeit(v.aktualisiert_am)}
                  </span>
                  <VorlageDuplizierenButton vorlageId={v.id} duplizierenAction={duplizierePreisstaffelVorlage} />
                  <VorlageLoeschenButton vorlageId={v.id} vorlageName={v.name} loeschenAction={deletePreisstaffelVorlage} />
                </div>
              </div>

              <table className="au-table" style={{ margin: "0.6rem 0 0.5rem" }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Stichtag</th>
                    <th>Preis (netto)</th>
                    <th>Preis (brutto, 19% USt.)</th>
                  </tr>
                </thead>
                <tbody>
                  {v.stufen.map((s, i) => (
                    <tr key={i}>
                      <td>{s.name}</td>
                      <td>{s.stichtag_tage_vor_start === 0 ? "bis Seminarstart" : `${s.stichtag_tage_vor_start} Tage vorher`}</td>
                      <td>{formatEUR(Number(s.preis))}</td>
                      <td style={{ color: "var(--color-text-muted)" }}>{formatEURBrutto(Number(s.preis))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <details>
                <summary style={{ cursor: "pointer", color: "#0B1B33", fontWeight: 600, fontSize: "0.85rem" }}>bearbeiten</summary>
                <div style={{ marginTop: "0.75rem" }}>
                  <VorlageFormular vorlage={v} speichernAction={updatePreisstaffelVorlage} />
                </div>
              </details>
            </div>
          );
        })}

        {!vorlagen.length && (
          <p style={{ color: "var(--color-text-faint)", margin: 0 }}>
            Noch keine Vorlagen. Lege oben eine an – oder speichere im Termin die Preisstaffel einer Option über „Aktuelle Staffel als Vorlage speichern“.
          </p>
        )}
      </div>
    </main>
  );
}
