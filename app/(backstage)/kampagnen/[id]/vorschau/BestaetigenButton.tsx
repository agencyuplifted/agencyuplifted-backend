"use client";

import { useState } from "react";

// Versand-Bestaetigung inkl. Frequency-Capping-Wahl. Standard: Empfaenger
// innerhalb der Sperrfrist werden ausgelassen (und als uebersprungen geloggt).
export default function KampagneBestaetigenButton({ anzahl, inSperrfrist }: { anzahl: number; inSperrfrist: number }) {
  const [trotz, setTrotz] = useState(false);
  const zuSenden = trotz ? anzahl : anzahl - inSperrfrist;
  return (
    <>
      {inSperrfrist > 0 && (
        <fieldset className="au-sperrfrist-wahl">
          <legend>{inSperrfrist} Empfänger:innen innerhalb der Sperrfrist</legend>
          <label>
            <input type="radio" name="trotz_sperrfrist" value="nein" checked={!trotz} onChange={() => setTrotz(false)} />
            Auslassen (empfohlen) – wird im Versandprotokoll als „übersprungen (Sperrfrist)“ vermerkt
          </label>
          <label>
            <input type="radio" name="trotz_sperrfrist" value="ja" checked={trotz} onChange={() => setTrotz(true)} />
            Trotzdem mitschicken
          </label>
        </fieldset>
      )}
      <button
        type="submit"
        className="au-btn au-btn-danger-solid"
        disabled={zuSenden === 0}
        onClick={(e) => {
          const hinweis = !trotz && inSperrfrist > 0 ? `\n${inSperrfrist} Empfänger:innen innerhalb der Sperrfrist werden ausgelassen.` : "";
          const ok = window.confirm(`Wirklich ${zuSenden} E-Mail(s) jetzt endgültig verschicken?${hinweis}\n\nDieser Schritt kann nicht rückgängig gemacht werden.`);
          if (!ok) e.preventDefault();
        }}
      >
        Ja, {zuSenden} E-Mail(s) jetzt endgültig verschicken
      </button>
    </>
  );
}
