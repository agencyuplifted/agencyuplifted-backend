"use client";

import { useState } from "react";

// Kopiert die Anweisung fuer ChatGPT/Claude in die Zwischenablage, damit ein
// dort erzeugter Options-Entwurf direkt der "Schnelleinfuegen"-Konvention
// entspricht (Titel, dann Beschreibung, dann "-"-Feature-Liste).
const PROMPT_TEXT =
  "Bereite die Option jetzt für den Export vor: erste Zeile der Titel, danach ein Beschreibungsabsatz (wichtige Begriffe mit **fett**), danach eine Liste der Features mit '-' pro Zeile (ebenfalls mit **fett** wo sinnvoll). Kein Text davor oder danach.";

export default function KopierePromptLink() {
  const [kopiert, setKopiert] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(PROMPT_TEXT);
          setKopiert(true);
          setTimeout(() => setKopiert(false), 1500);
        } catch {
          // Zwischenablage evtl. blockiert (z.B. Berechtigung) -- kein Absturz noetig.
        }
      }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: "var(--color-text-faint)",
        fontSize: "0.75rem",
        cursor: "pointer",
        textDecoration: "underline",
      }}
    >
      {kopiert ? "Kopiert!" : "Anweisung für ChatGPT/Claude kopieren"}
    </button>
  );
}
