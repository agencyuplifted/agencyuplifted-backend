"use client";

import { useState } from "react";
import Link from "next/link";
import { stufenMitFestemDatum, stichtagRegelText, berechneVorlagenStichtage, type PreisstaffelVorlage } from "@/lib/preisstaffeln";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import { formatEUR } from "@/lib/format";
import StufenEditor, {
  entwurfAusStufen,
  entwurfZuStufen,
  type StufeEntwurf,
} from "../../preisstaffel-vorlagen/StufenEditor";

// Zwei Aktionen pro Option im Preisstaffel-Bereich, analog zu "Preisstaffeln
// aus anderem Seminar kopieren":
// 1. Gespeicherte Vorlage laden -- Stufen erscheinen zuerst als editierbare
//    Vorschau (Preisstaffeln sind einzeln gespeicherte Zeilen, es gibt kein
//    "befuellt, aber noch nicht gespeichert"-Formular). "Uebernehmen" ersetzt
//    dann alle bestehenden Staffeln der Option.
// 2. Aktuelle Staffel als Vorlage speichern -- nur, wenn keine Stufe ein
//    festes Datum nutzt; sonst Hinweis, welche Stufen das verhindern.
// Bestaetigungen als sichtbares Element statt window.confirm() (siehe
// OptionSchnelleinfuegen.tsx).

type BestehendeStaffel = {
  name: string;
  stichtag_tage_vor_start: number | null;
  stichtag_datum: string | null;
  preis: number | string;
};

const summaryStyle = { cursor: "pointer", color: "#0B1B33", fontWeight: 600, fontSize: "0.85rem" } as const;
const hinweisStyle = { color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "0.5rem 0" } as const;
const bestaetigungStyle = {
  background: "#fdf3e2",
  border: "1px solid #f2ddb0",
  borderRadius: "var(--radius-sm)",
  padding: "0.5rem 0.65rem",
  marginTop: "0.75rem",
} as const;

function Meldung({ art, text }: { art: "fehler" | "erfolg"; text: string }) {
  return (
    <div
      className={`au-banner ${art === "fehler" ? "au-banner-error" : "au-banner-success"}`}
      style={{ margin: "0.75rem 0 0", padding: "0.5rem 0.75rem" }}
    >
      {text}
    </div>
  );
}

export default function PreisstaffelVorlagenAktionen({
  seminarterminOptionId,
  seminarterminId,
  terminDatumStart,
  vorlagen,
  bestehendeStaffeln,
  ersetzenAction,
  alsVorlageSpeichernAction,
}: {
  seminarterminOptionId: string;
  seminarterminId: string;
  terminDatumStart: string;
  vorlagen: PreisstaffelVorlage[];
  bestehendeStaffeln: BestehendeStaffel[];
  ersetzenAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
  alsVorlageSpeichernAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  return (
    <>
      <VorlageLaden
        seminarterminOptionId={seminarterminOptionId}
        seminarterminId={seminarterminId}
        terminDatumStart={terminDatumStart}
        vorlagen={vorlagen}
        anzahlBestehend={bestehendeStaffeln.length}
        ersetzenAction={ersetzenAction}
      />
      <AlsVorlageSpeichern
        seminarterminOptionId={seminarterminOptionId}
        seminarterminId={seminarterminId}
        bestehendeStaffeln={bestehendeStaffeln}
        speichernAction={alsVorlageSpeichernAction}
      />
    </>
  );
}

function VorlageLaden({
  seminarterminOptionId,
  seminarterminId,
  terminDatumStart,
  vorlagen,
  anzahlBestehend,
  ersetzenAction,
}: {
  seminarterminOptionId: string;
  seminarterminId: string;
  terminDatumStart: string;
  vorlagen: PreisstaffelVorlage[];
  anzahlBestehend: number;
  ersetzenAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [vorlageId, setVorlageId] = useState("");
  const [entwurf, setEntwurf] = useState<StufeEntwurf[]>([]);
  const [fragt, setFragt] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  // Regel der Vorlage ist standardmaessig an, laesst sich fuer diesen einen
  // Termin aber abschalten (z. B. wenn die Stufen hier bewusst relativ bleiben
  // sollen, damit sie bei einer Terminverschiebung mitwandern).
  const [regelAnwenden, setRegelAnwenden] = useState(true);

  const vorlage = vorlagen.find((v) => v.id === vorlageId) || null;
  const regel = vorlage?.stichtag_regel && regelAnwenden ? vorlage.stichtag_regel : null;

  function waehleVorlage(id: string) {
    setVorlageId(id);
    setFragt(false);
    setFehler(null);
    setErfolg(null);
    setRegelAnwenden(true);
    const v = vorlagen.find((x) => x.id === id);
    setEntwurf(v ? entwurfAusStufen(v.stufen) : []);
  }

  function starteUebernahme() {
    setFehler(null);
    try {
      const stufen = entwurfZuStufen(entwurf);
      if (regel) {
        const { kollision } = berechneVorlagenStichtage(stufen, terminDatumStart, regel);
        if (kollision) throw new Error(kollision);
      }
    } catch (e: any) {
      setFehler(e.message);
      return;
    }
    if (anzahlBestehend > 0) {
      setFragt(true);
      return;
    }
    uebernehmen();
  }

  async function uebernehmen() {
    let stufen;
    try {
      stufen = entwurfZuStufen(entwurf);
    } catch (e: any) {
      setFehler(e.message);
      setFragt(false);
      return;
    }
    const formData = new FormData();
    formData.set("seminartermin_option_id", seminarterminOptionId);
    formData.set("seminartermin_id", seminarterminId);
    formData.set("stufen_json", JSON.stringify(stufen));
    formData.set("stichtag_regel_json", JSON.stringify(regel));

    setLaedt(true);
    try {
      const ergebnis = await ersetzenAction(formData);
      if (ergebnis.fehler) {
        setFehler(ergebnis.fehler);
        return;
      }
      setErfolg(`${stufen.length} ${stufen.length === 1 ? "Stufe" : "Stufen"} aus „${vorlage?.name}“ übernommen – siehe Tabelle oben.`);
      setVorlageId("");
      setEntwurf([]);
    } catch (e: any) {
      setFehler(`Übernehmen fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    } finally {
      setLaedt(false);
      setFragt(false);
    }
  }

  return (
    <details style={{ marginTop: "0.5rem" }}>
      <summary style={summaryStyle}>Aus gespeicherter Vorlage laden</summary>

      {!vorlagen.length ? (
        <p style={hinweisStyle}>
          Noch keine Preisstaffel-Vorlagen vorhanden. <Link href="/preisstaffel-vorlagen" prefetch={false}>Vorlagen verwalten →</Link>
        </p>
      ) : (
        <div style={{ marginTop: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260, maxWidth: 520 }}>
              <label className="au-label">Vorlage</label>
              <select
                className="au-select"
                style={{ marginBottom: 0 }}
                value={vorlageId}
                onChange={(e) => waehleVorlage(e.target.value)}
                disabled={laedt}
              >
                <option value="">— bitte wählen —</option>
                {vorlagen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.stufen.length} {v.stufen.length === 1 ? "Stufe" : "Stufen"})
                  </option>
                ))}
              </select>
            </div>
            <Link href="/preisstaffel-vorlagen" prefetch={false} style={{ fontSize: "0.8rem", paddingBottom: "0.55rem" }}>
              Vorlagen verwalten →
            </Link>
          </div>

          {vorlage && (
            <div style={{ marginTop: "0.75rem" }}>
              {vorlage.beschreibung && <p style={{ ...hinweisStyle, marginTop: 0 }}>{vorlage.beschreibung}</p>}
              <p style={{ ...hinweisStyle, marginTop: 0 }}>
                Vorschau – Werte lassen sich vor dem Übernehmen noch für diese Option anpassen. Die Vorlage selbst bleibt unverändert.
              </p>
              {vorlage.stichtag_regel && (
                <div style={{ margin: "0 0 0.6rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={regelAnwenden}
                      disabled={laedt || fragt}
                      onChange={(e) => setRegelAnwenden(e.target.checked)}
                    />
                    Stichtage verschieben auf {stichtagRegelText(vorlage.stichtag_regel)}
                  </label>
                  <p style={{ ...hinweisStyle, margin: "0.2rem 0 0 1.5rem" }}>
                    {regelAnwenden
                      ? "Verschobene Stichtage werden als festes Datum gespeichert (öffentlich mit „gültig bis“) – sie wandern bei einer späteren Terminverschiebung nicht mit."
                      : "Aus: Stufen werden relativ („X Tage vor Start“) übernommen."}
                  </p>
                </div>
              )}
              <StufenEditor
                entwurf={entwurf}
                onChange={setEntwurf}
                deaktiviert={laedt || fragt}
                stichtagVorschau={{ terminDatumStart, regel }}
              />

              {fragt ? (
                <div style={bestaetigungStyle}>
                  <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
                    Die {anzahlBestehend} bestehende(n) Preisstaffel(n) dieser Option werden unwiderruflich durch {entwurf.length}{" "}
                    {entwurf.length === 1 ? "Stufe" : "Stufen"} aus „{vorlage.name}“ ersetzt.
                  </p>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={uebernehmen} disabled={laedt}>
                      {laedt ? "Übernimmt …" : "Ja, ersetzen"}
                    </button>
                    <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setFragt(false)} disabled={laedt}>
                      Abbrechen
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "0.75rem" }}>
                  <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={starteUebernahme} disabled={laedt}>
                    {laedt ? "Übernimmt …" : anzahlBestehend > 0 ? "Preisstaffeln ersetzen" : "Stufen übernehmen"}
                  </button>
                  {anzahlBestehend > 0 && (
                    <span style={{ ...hinweisStyle, marginLeft: "0.6rem" }}>
                      Ersetzt alle {anzahlBestehend} bestehende(n) Preisstaffel(n) dieser Option.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {fehler && <Meldung art="fehler" text={fehler} />}
      {erfolg && <Meldung art="erfolg" text={erfolg} />}
    </details>
  );
}

function AlsVorlageSpeichern({
  seminarterminOptionId,
  seminarterminId,
  bestehendeStaffeln,
  speichernAction,
}: {
  seminarterminOptionId: string;
  seminarterminId: string;
  bestehendeStaffeln: BestehendeStaffel[];
  speichernAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [name, setName] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  const mitDatum = stufenMitFestemDatum(bestehendeStaffeln);
  const moeglich = bestehendeStaffeln.length > 0 && mitDatum.length === 0;

  async function speichern() {
    setFehler(null);
    setErfolg(null);
    if (!name.trim()) {
      setFehler("Bitte einen Namen für die Vorlage angeben.");
      return;
    }
    const formData = new FormData();
    formData.set("seminartermin_option_id", seminarterminOptionId);
    formData.set("seminartermin_id", seminarterminId);
    formData.set("name", name);
    formData.set("beschreibung", beschreibung);

    setLaedt(true);
    try {
      const ergebnis = await speichernAction(formData);
      if (ergebnis.fehler) {
        setFehler(ergebnis.fehler);
        return;
      }
      setErfolg(`Vorlage „${name.trim()}“ gespeichert.`);
      setName("");
      setBeschreibung("");
    } catch (e: any) {
      setFehler(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <details style={{ marginTop: "0.5rem" }}>
      <summary style={summaryStyle}>
        Aktuelle Staffel als Vorlage speichern
        {!moeglich && bestehendeStaffeln.length > 0 && (
          <span style={{ fontWeight: 400, color: "var(--color-text-faint)" }}> (nur mit „Tage vor Start“ möglich)</span>
        )}
      </summary>

      {bestehendeStaffeln.length === 0 ? (
        <p style={hinweisStyle}>Diese Option hat noch keine Preisstaffeln – lege zuerst Stufen an, dann kann die Staffel als Vorlage gespeichert werden.</p>
      ) : mitDatum.length > 0 ? (
        <div className="au-banner au-banner-warning" style={{ margin: "0.5rem 0 0", padding: "0.5rem 0.75rem", fontSize: "0.85rem", maxWidth: 640 }}>
          Nicht möglich: {mitDatum.map((s) => `„${s.name}“`).join(", ")} {mitDatum.length === 1 ? "nutzt" : "nutzen"} ein festes Datum.
          Vorlagen arbeiten nur mit „Tage vor Start“, damit sie in jedem Termin passen. Stelle die betroffenen Stufen über
          „bearbeiten“ auf „Tage vor Start“ um, dann lässt sich die Staffel als Vorlage speichern.
        </div>
      ) : (
        <div style={{ marginTop: "0.5rem", maxWidth: 640 }}>
          <p style={{ ...hinweisStyle, marginTop: 0 }}>
            Speichert die {bestehendeStaffeln.length} Stufe(n) dieser Option als neue Vorlage:{" "}
            {[...bestehendeStaffeln]
              .sort((a, b) => (b.stichtag_tage_vor_start ?? 0) - (a.stichtag_tage_vor_start ?? 0))
              .map((s) => `${s.name} ${formatEUR(Number(s.preis))} (${s.stichtag_tage_vor_start} T.)`)
              .join(" · ")}
          </p>
          <div className="au-row-2">
            <div>
              <label className="au-label">Name der Vorlage</label>
              <input
                className="au-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Standard 2-Tages-Seminar"
                disabled={laedt}
              />
            </div>
            <div>
              <label className="au-label">Beschreibung</label>
              <input
                className="au-input"
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
                placeholder="optional"
                disabled={laedt}
              />
            </div>
          </div>
          <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={speichern} disabled={laedt}>
            {laedt ? "Speichert …" : "Als Vorlage speichern"}
          </button>
        </div>
      )}

      {fehler && <Meldung art="fehler" text={fehler} />}
      {erfolg && (
        <div className="au-banner au-banner-success" style={{ margin: "0.75rem 0 0", padding: "0.5rem 0.75rem" }}>
          {erfolg} <Link href="/preisstaffel-vorlagen" prefetch={false}>Vorlagen verwalten →</Link>
        </div>
      )}
    </details>
  );
}
