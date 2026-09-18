"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

// Versand-Bestaetigung: jetzt oder geplant, plus Frequency-Capping-Wahl.
// Standard: Empfaenger innerhalb der Sperrfrist werden ausgelassen (und als
// uebersprungen geloggt).
export default function KampagneBestaetigenButton({ anzahl, inSperrfrist }: { anzahl: number; inSperrfrist: number }) {
  const [trotz, setTrotz] = useState(false);
  const [geplant, setGeplant] = useState(false);
  const [zeit, setZeit] = useState("");
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
      <fieldset className="au-sperrfrist-wahl au-zeitpunkt-wahl">
        <legend>Zeitpunkt</legend>
        <label>
          <input type="radio" name="zeitpunkt" value="jetzt" checked={!geplant} onChange={() => setGeplant(false)} />
          Jetzt senden
        </label>
        <label>
          <input type="radio" name="zeitpunkt" value="geplant" checked={geplant} onChange={() => setGeplant(true)} />
          Planen für
          <input
            type="datetime-local"
            name="geplant_fuer"
            className="au-input"
            value={zeit}
            required={geplant}
            disabled={!geplant}
            onChange={(e) => setZeit(e.target.value)}
            style={{ margin: 0, width: "auto" }}
          />
        </label>
        {geplant && <span className="au-klein">Deutsche Zeit. Versand innerhalb von 15 Minuten nach dem Zeitpunkt; die Empfänger werden dann neu bestimmt.</span>}
      </fieldset>
      <Absenden zuSenden={zuSenden} geplant={geplant} zeit={zeit} hinweis={!trotz && inSperrfrist > 0 ? inSperrfrist : 0} />
    </>
  );
}

function Absenden({ zuSenden, geplant, zeit, hinweis }: { zuSenden: number; geplant: boolean; zeit: string; hinweis: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="au-btn au-btn-danger-solid"
      disabled={pending || zuSenden === 0 || (geplant && !zeit)}
      onClick={(e) => {
        const zusatz = hinweis ? `\n${hinweis} Empfänger:innen innerhalb der Sperrfrist werden ausgelassen.` : "";
        const frage = geplant
          ? `Kampagne für ${new Date(zeit).toLocaleString("de-DE")} einplanen?${zusatz}`
          : `Wirklich ${zuSenden} E-Mail(s) jetzt endgültig verschicken?${zusatz}\n\nDieser Schritt kann nicht rückgängig gemacht werden.`;
        if (!window.confirm(frage)) e.preventDefault();
      }}
    >
      {pending ? "Wird verschickt …" : geplant ? "Versand einplanen" : `Ja, ${zuSenden} E-Mail(s) jetzt endgültig verschicken`}
    </button>
  );
}
