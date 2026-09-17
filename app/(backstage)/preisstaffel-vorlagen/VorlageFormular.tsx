"use client";

import { useEffect, useState } from "react";
import { normalisiereStichtagRegel, tagePlus, type PreisstaffelVorlage, type StichtagRegel } from "@/lib/preisstaffeln";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import StufenEditor, { entwurfAusStufen, entwurfZuStufen, leererEntwurf, type StufeEntwurf } from "./StufenEditor";
import StichtagRegelFelder from "./StichtagRegelFelder";

// Anlegen (ohne vorlage) bzw. Bearbeiten (mit vorlage) einer Preisstaffel-
// Vorlage. Kein <form action>, weil die Stufen als JSON aus dem State kommen
// und Fehler ({ fehler }) inline angezeigt werden sollen statt als Fehlerseite.
export default function VorlageFormular({
  vorlage,
  speichernAction,
}: {
  vorlage?: PreisstaffelVorlage;
  speichernAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [name, setName] = useState(vorlage?.name ?? "");
  const [beschreibung, setBeschreibung] = useState(vorlage?.beschreibung ?? "");
  const [entwurf, setEntwurf] = useState<StufeEntwurf[]>(() =>
    vorlage ? entwurfAusStufen(vorlage.stufen) : leererEntwurf()
  );
  const [regel, setRegel] = useState<StichtagRegel | null>(vorlage?.stichtag_regel ?? null);
  // Beispiel-Terminstart nur fuer die Stichtag-Vorschau (wird nicht
  // gespeichert). Erst nach dem Mounten gesetzt: "heute" auf dem Server (UTC)
  // und im Browser koennen abweichen -> sonst Hydration-Mismatch im Datumsfeld.
  const [beispielStart, setBeispielStart] = useState("");
  useEffect(() => {
    const d = new Date();
    const heute = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setBeispielStart(tagePlus(heute, 180));
  }, []);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);

  async function speichern() {
    setFehler(null);
    setErfolg(null);
    if (!name.trim()) {
      setFehler("Bitte einen Namen für die Vorlage angeben.");
      return;
    }
    let stufen;
    let geprueftRegel: StichtagRegel | null;
    try {
      stufen = entwurfZuStufen(entwurf);
      geprueftRegel = normalisiereStichtagRegel(regel);
    } catch (e: any) {
      setFehler(e.message);
      return;
    }

    const formData = new FormData();
    if (vorlage) formData.set("vorlage_id", vorlage.id);
    formData.set("name", name);
    formData.set("beschreibung", beschreibung);
    formData.set("stufen_json", JSON.stringify(stufen));
    formData.set("stichtag_regel_json", JSON.stringify(geprueftRegel));

    setLaedt(true);
    try {
      const ergebnis = await speichernAction(formData);
      if (ergebnis.fehler) {
        setFehler(ergebnis.fehler);
        return;
      }
      if (vorlage) {
        // Gespeicherte Reihenfolge ist nach Stichtag sortiert -- Editor
        // entsprechend nachziehen, damit er dem gespeicherten Stand entspricht.
        setEntwurf(entwurfAusStufen(stufen));
        setErfolg("Änderungen gespeichert.");
      } else {
        setName("");
        setBeschreibung("");
        setEntwurf(leererEntwurf());
        setRegel(null);
        setErfolg(`Vorlage „${name.trim()}“ angelegt.`);
      }
    } catch (e: any) {
      setFehler(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div>
      <div className="au-row-2">
        <div>
          <label className="au-label">Name</label>
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
            placeholder="optional, z. B. wofür die Staffel gedacht ist"
            disabled={laedt}
          />
        </div>
      </div>

      <StichtagRegelFelder regel={regel} onChange={setRegel} deaktiviert={laedt} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
        <label className="au-label" style={{ margin: 0 }}>Preisstufen</label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
          Stichtag-Vorschau für Terminstart
          <input
            type="date"
            className="au-input"
            style={{ marginBottom: 0, width: "auto", padding: "0.25rem 0.45rem", fontSize: "0.8rem" }}
            value={beispielStart}
            onChange={(e) => setBeispielStart(e.target.value)}
          />
        </label>
      </div>
      <StufenEditor
        entwurf={entwurf}
        onChange={setEntwurf}
        deaktiviert={laedt}
        stichtagVorschau={beispielStart ? { terminDatumStart: beispielStart, regel } : null}
      />

      {fehler && (
        <div className="au-banner au-banner-error" style={{ margin: "0.75rem 0 0", padding: "0.5rem 0.75rem" }}>
          {fehler}
        </div>
      )}
      {erfolg && (
        <div className="au-banner au-banner-success" style={{ margin: "0.75rem 0 0", padding: "0.5rem 0.75rem" }}>
          {erfolg}
        </div>
      )}

      <div style={{ marginTop: "0.9rem" }}>
        <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={speichern} disabled={laedt}>
          {laedt ? "Speichert …" : vorlage ? "Änderungen speichern" : "Vorlage anlegen"}
        </button>
      </div>
    </div>
  );
}
