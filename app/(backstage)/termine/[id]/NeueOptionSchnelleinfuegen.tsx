"use client";

import { useRef, useState } from "react";
import { parseSchnelleinfuegenText, GeparsteOption } from "@/lib/schnelleinfuegen";
import KopierePromptLink from "./KopierePromptLink";

// "Schnelleinfuegen" beim NEUEN Anlegen einer Option: die Option existiert
// hier noch nicht (keine ID), Features koennen also nicht sofort angelegt
// werden. Deshalb rein clientseitig: "Uebernehmen" schreibt Titel/
// Beschreibung direkt in die Nachbarfelder desselben <form> (per DOM-Zugriff,
// wie schon der Fett/Akzent-Toggle in BoldEditor.tsx) und die Feature-Zeilen
// in ein verstecktes features_text-Feld -- alles wird erst beim eigentlichen
// "Option anlegen"-Submit gespeichert (createSeminarOption liest
// features_text und legt die Features direkt mit an).
export default function NeueOptionSchnelleinfuegen() {
  const [text, setText] = useState("");
  const [uebernommeneFeatures, setUebernommeneFeatures] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Ausstehende Ersetzung, die noch bestaetigt werden muss -- statt
  // window.confirm(), das manche Browser (v.a. Chrome) nach ein paar
  // Dialogen auf derselben Seite stillschweigend unterdruecken (der Aufruf
  // gibt dann sofort "false" zurueck, ohne ueberhaupt einen Dialog zu
  // zeigen -- "Uebernehmen" wirkt dann so, als wuerde es gar nichts tun).
  // Eine im Seitenlayout sichtbare Bestaetigung kann so nicht unterdrueckt
  // werden.
  const [ausstehend, setAusstehend] = useState<GeparsteOption | null>(null);

  function starteUebernahme() {
    const geparst = parseSchnelleinfuegenText(text);
    if (!geparst) {
      window.alert(
        'Der eingefügte Text entspricht nicht dem erwarteten Format: erste Zeile = Titel, danach ein Beschreibungsabsatz, danach mindestens eine Zeile mit "-" als Feature.'
      );
      return;
    }

    const form = wrapperRef.current?.closest("form");
    const titelInput = form?.elements.namedItem("titel") as HTMLInputElement | null;
    const beschreibungInput = form?.elements.namedItem("beschreibung") as HTMLTextAreaElement | null;
    const featuresInput = form?.elements.namedItem("features_text") as HTMLInputElement | null;

    const hatBestehendenInhalt = !!(titelInput?.value || beschreibungInput?.value || featuresInput?.value);
    if (hatBestehendenInhalt) {
      setAusstehend(geparst);
      return;
    }
    wendeAn(geparst);
  }

  function wendeAn(geparst: GeparsteOption) {
    const form = wrapperRef.current?.closest("form");
    if (!form) return;
    const titelInput = form.elements.namedItem("titel") as HTMLInputElement | null;
    const beschreibungInput = form.elements.namedItem("beschreibung") as HTMLTextAreaElement | null;
    const featuresInput = form.elements.namedItem("features_text") as HTMLInputElement | null;
    const vorspannTextInput = form.elements.namedItem("vorspann_text") as HTMLInputElement | null;
    const vorspannAnzeigenInput = form.elements.namedItem("vorspann_anzeigen") as HTMLInputElement | null;

    if (titelInput) titelInput.value = geparst.titel;
    if (beschreibungInput) beschreibungInput.value = geparst.beschreibung;
    if (featuresInput) featuresInput.value = JSON.stringify(geparst.features);
    // Vorspann-Zeile ist optional -- fehlt sie im eingefuegten Text, bleiben
    // die (bei einer neuen Option ohnehin noch leeren) Vorspann-Felder unangetastet.
    if (geparst.introLabel) {
      if (vorspannTextInput) vorspannTextInput.value = geparst.introLabel;
      if (vorspannAnzeigenInput) vorspannAnzeigenInput.checked = true;
    }
    setUebernommeneFeatures(geparst.features.length);
    setText("");
    setAusstehend(null);
  }

  return (
    <div ref={wrapperRef} style={{ background: "#f7f7f7", borderRadius: "var(--radius-sm)", padding: "0.6rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
        <label className="au-label" style={{ margin: 0 }}>Schnelleinfügen (füllt Titel/Beschreibung/Features unten aus)</label>
        <KopierePromptLink />
      </div>
      <textarea
        className="au-textarea"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Business\nDer gewinnwirksame Weg zu wert- und gewinnorientierter Preisfindung ...\n- Seminar inklusive drei **Übernachtungen** im Einzelzimmer mit Frühstück\n- ..."}
      />
      {ausstehend ? (
        <div style={{ background: "#fdf3e2", border: "1px solid #f2ddb0", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.65rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
            Bestehender Inhalt in den Feldern unten wird durch „{ausstehend.titel}“ ({ausstehend.features.length} Feature(s)) ersetzt.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={() => wendeAn(ausstehend)}>
              Ja, ersetzen
            </button>
            <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setAusstehend(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={starteUebernahme}>
          Übernehmen
        </button>
      )}
      {uebernommeneFeatures !== null && (
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
          Titel/Beschreibung oben befüllt · {uebernommeneFeatures} Feature(s) werden beim Anlegen dieser Option mit übernommen.
        </p>
      )}
    </div>
  );
}
