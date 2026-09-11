"use client";

import { useRef, useState } from "react";
import { parseSchnelleinfuegenText } from "@/lib/schnelleinfuegen";
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

  function uebernehmen() {
    const geparst = parseSchnelleinfuegenText(text);
    if (!geparst) {
      window.alert(
        'Der eingefügte Text entspricht nicht dem erwarteten Format: erste Zeile = Titel, danach ein Beschreibungsabsatz, danach mindestens eine Zeile mit "-" als Feature.'
      );
      return;
    }

    const form = wrapperRef.current?.closest("form");
    if (!form) return;
    const titelInput = form.elements.namedItem("titel") as HTMLInputElement | null;
    const beschreibungInput = form.elements.namedItem("beschreibung") as HTMLTextAreaElement | null;
    const featuresInput = form.elements.namedItem("features_text") as HTMLInputElement | null;

    const hatBestehendenInhalt = !!(titelInput?.value || beschreibungInput?.value || featuresInput?.value);
    if (hatBestehendenInhalt) {
      const ok = window.confirm("Bestehender Inhalt wird ersetzt – fortfahren?");
      if (!ok) return;
    }

    if (titelInput) titelInput.value = geparst.titel;
    if (beschreibungInput) beschreibungInput.value = geparst.beschreibung;
    if (featuresInput) featuresInput.value = geparst.features.join("\n");
    setUebernommeneFeatures(geparst.features.length);
    setText("");
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
      <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={uebernehmen}>
        Übernehmen
      </button>
      {uebernommeneFeatures !== null && (
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>
          Titel/Beschreibung oben befüllt · {uebernommeneFeatures} Feature(s) werden beim Anlegen dieser Option mit übernommen.
        </p>
      )}
    </div>
  );
}
