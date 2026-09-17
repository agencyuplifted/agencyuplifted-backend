"use client";

import { useState } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";

export default function VorlageDuplizierenButton({
  vorlageId,
  duplizierenAction,
}: {
  vorlageId: string;
  duplizierenAction: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function duplizieren() {
    const formData = new FormData();
    formData.set("vorlage_id", vorlageId);
    setLaedt(true);
    setFehler(null);
    try {
      const ergebnis = await duplizierenAction(formData);
      if (ergebnis.fehler) setFehler(ergebnis.fehler);
    } catch (e: any) {
      setFehler(`Duplizieren fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button type="button" className="au-link" onClick={duplizieren} disabled={laedt}>
        {laedt ? "dupliziert …" : "duplizieren"}
      </button>
      {fehler && <span style={{ fontSize: "0.8rem", color: "var(--color-danger)", maxWidth: 280 }}>{fehler}</span>}
    </span>
  );
}
