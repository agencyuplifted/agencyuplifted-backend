"use client";

import { useState } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";

// Sichtbare Ja/Abbrechen-Bestaetigung statt window.confirm() -- Chrome
// unterdrueckt native Dialoge nach ein paar Aufrufen auf derselben Seite
// stillschweigend (siehe OptionSchnelleinfuegen.tsx).
export default function OptionLoeschenButton({
  optionId,
  seminarterminId,
  titel,
  loeschenAction,
}: {
  optionId: string;
  seminarterminId: string;
  titel: string;
  loeschenAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [fragt, setFragt] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function loeschen() {
    const formData = new FormData();
    formData.set("seminartermin_option_id", optionId);
    formData.set("seminartermin_id", seminarterminId);
    setLaedt(true);
    setFehler(null);
    try {
      const ergebnis = await loeschenAction(formData);
      if (ergebnis.fehler) setFehler(ergebnis.fehler);
    } catch (e: any) {
      setFehler(`Löschen fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    } finally {
      setLaedt(false);
    }
  }

  if (!fragt) {
    return (
      <button type="button" className="au-btn au-btn-danger au-btn-sm" onClick={() => setFragt(true)}>
        Löschen
      </button>
    );
  }

  return (
    <div style={{ background: "#fdf3e2", border: "1px solid #f2ddb0", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.65rem", maxWidth: 380 }}>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
        Option „{titel}“ endgültig löschen? Preisstaffeln und Features dieser Option werden mitgelöscht. Das lässt sich nicht rückgängig machen.
      </p>
      {fehler && <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--color-danger)" }}>{fehler}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="au-btn au-btn-danger-solid au-btn-sm" onClick={loeschen} disabled={laedt}>
          {laedt ? "Löscht …" : "Ja, endgültig löschen"}
        </button>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setFragt(false)} disabled={laedt}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}
