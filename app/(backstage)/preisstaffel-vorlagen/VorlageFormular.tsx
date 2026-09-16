"use client";

import { useState } from "react";
import type { PreisstaffelVorlage } from "@/lib/preisstaffeln";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import StufenEditor, { entwurfAusStufen, entwurfZuStufen, leererEntwurf, type StufeEntwurf } from "./StufenEditor";

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
    try {
      stufen = entwurfZuStufen(entwurf);
    } catch (e: any) {
      setFehler(e.message);
      return;
    }

    const formData = new FormData();
    if (vorlage) formData.set("vorlage_id", vorlage.id);
    formData.set("name", name);
    formData.set("beschreibung", beschreibung);
    formData.set("stufen_json", JSON.stringify(stufen));

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

      <label className="au-label">Preisstufen</label>
      <StufenEditor entwurf={entwurf} onChange={setEntwurf} deaktiviert={laedt} />

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
