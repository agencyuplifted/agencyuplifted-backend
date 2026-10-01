"use client";

import { useFormStatus } from "react-dom";

// Der Import fragt jede Rechnung einzeln bei FastBill ab (Positionen) und
// dauert bei einem ganzen Jahr gut eine Minute -- ohne Rueckmeldung sah das
// aus, als waere nichts passiert (Import 2025 am 01.10.2026), und man klickte
// doppelt.
export default function ImportButton() {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" className="au-btn au-btn-primary" disabled={pending} aria-busy={pending}>
        {pending ? "Import läuft …" : "Rechnungen importieren"}
      </button>
      {pending && <span className="au-klein" style={{ alignSelf: "center" }}>kann 1–2 Minuten dauern, bitte Seite offen lassen</span>}
    </>
  );
}
