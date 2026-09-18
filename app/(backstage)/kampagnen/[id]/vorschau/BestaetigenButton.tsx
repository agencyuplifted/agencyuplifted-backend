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
  const [zeitTest, setZeitTest] = useState(false);
  const [zeitB, setZeitB] = useState("");
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
        {geplant && (
          <>
            <label className="au-zeittest">
              <input type="checkbox" name="zeit_test" checked={zeitTest} onChange={(e) => setZeitTest(e.target.checked)} />
              <span>
                <strong>Versandzeit testen (A/B)</strong> – die Hälfte der Empfänger bekommt die Mail zu einer zweiten Uhrzeit
              </span>
            </label>
            {zeitTest && (
              <label className="au-zeittest-b">
                Hälfte B um
                <input
                  type="datetime-local"
                  name="geplant_fuer_b"
                  className="au-input"
                  value={zeitB}
                  required
                  onChange={(e) => setZeitB(e.target.value)}
                  style={{ margin: 0, width: "auto" }}
                />
                <span className="au-klein">(Hälfte A zum Zeitpunkt oben)</span>
              </label>
            )}
            <span className="au-klein">Deutsche Zeit. Versand innerhalb von 15 Minuten nach dem Zeitpunkt; die Empfänger werden dann neu bestimmt.</span>
          </>
        )}
      </fieldset>
      <Absenden zuSenden={zuSenden} geplant={geplant} zeit={zeit} zeitB={zeitTest ? zeitB : ""} hinweis={!trotz && inSperrfrist > 0 ? inSperrfrist : 0} />
    </>
  );
}

function Absenden({ zuSenden, geplant, zeit, zeitB, hinweis }: { zuSenden: number; geplant: boolean; zeit: string; zeitB: string; hinweis: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="au-btn au-btn-danger-solid"
      disabled={pending || zuSenden === 0 || (geplant && !zeit)}
      onClick={(e) => {
        const zusatz = hinweis ? `\n${hinweis} Empfänger:innen innerhalb der Sperrfrist werden ausgelassen.` : "";
        const frage = geplant
          ? zeitB
            ? `Zeit-Test einplanen?\nHälfte A: ${new Date(zeit).toLocaleString("de-DE")}\nHälfte B: ${new Date(zeitB).toLocaleString("de-DE")}${zusatz}`
            : `Kampagne für ${new Date(zeit).toLocaleString("de-DE")} einplanen?${zusatz}`
          : `Wirklich ${zuSenden} E-Mail(s) jetzt endgültig verschicken?${zusatz}\n\nDieser Schritt kann nicht rückgängig gemacht werden.`;
        if (!window.confirm(frage)) e.preventDefault();
      }}
    >
      {pending ? "Wird verschickt …" : geplant ? "Versand einplanen" : `Ja, ${zuSenden} E-Mail(s) jetzt endgültig verschicken`}
    </button>
  );
}
