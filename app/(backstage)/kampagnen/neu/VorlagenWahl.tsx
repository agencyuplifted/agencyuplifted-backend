"use client";

import { useState } from "react";

export type Vorlage = { id: string; art: "kampagne" | "funnel"; titel: string; untertitel: string; betreff: string; inhalt: string };

// "Aus Vorlage starten": fruehere Kampagnen, Funnel-Mails oder eingefuegter
// Text (z. B. eine eigene Mail aus Outlook/Gmail). Eingefuegter Text: erste
// Zeile "Betreff: …" wird Betreff, [Vorname]/{Vorname} werden zu {{vorname}}.
export default function VorlagenWahl({
  vorlagen,
  onUebernehmen,
}: {
  vorlagen: Vorlage[];
  onUebernehmen: (v: { betreff: string; inhalt: string; titel?: string }) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [reiter, setReiter] = useState<"kampagne" | "funnel" | "text">(vorlagen.some((v) => v.art === "kampagne") ? "kampagne" : "text");
  const [suche, setSuche] = useState("");
  const [text, setText] = useState("");

  const liste = vorlagen
    .filter((v) => v.art === reiter)
    .filter((v) => !suche || `${v.titel} ${v.betreff}`.toLowerCase().includes(suche.toLowerCase()));

  function textUebernehmen() {
    let zeilen = text.replace(/\r\n/g, "\n").split("\n");
    let betreff = "";
    const erste = zeilen.findIndex((z) => z.trim());
    const m = erste >= 0 ? zeilen[erste].match(/^\s*(betreff|subject)\s*:\s*(.+)$/i) : null;
    if (m) {
      betreff = m[2].trim();
      zeilen = zeilen.slice(erste + 1);
    }
    const ersetze = (t: string) =>
      t
        .replace(/[\[{]\s*(vorname|first ?name)\s*[\]}]/gi, "{{vorname}}")
        .replace(/[\[{]\s*(nachname|last ?name)\s*[\]}]/gi, "{{nachname}}");
    onUebernehmen({ betreff: ersetze(betreff), inhalt: ersetze(zeilen.join("\n").trim()) });
    setText("");
    setOffen(false);
  }

  if (!offen) {
    return (
      <button type="button" className="au-vorlagen-knopf" onClick={() => setOffen(true)}>
        <span>📄</span> Aus Vorlage starten <span className="au-klein">– frühere Kampagne, Funnel-Mail oder eigener Text</span>
      </button>
    );
  }

  return (
    <div className="au-vorlagen">
      <div className="au-vorlagen-kopf">
        <span className="au-segment">
          <button type="button" className={reiter === "kampagne" ? "aktiv" : ""} onClick={() => setReiter("kampagne")}>Frühere Kampagnen</button>
          <button type="button" className={reiter === "funnel" ? "aktiv" : ""} onClick={() => setReiter("funnel")}>Funnel-Mails</button>
          <button type="button" className={reiter === "text" ? "aktiv" : ""} onClick={() => setReiter("text")}>Text einfügen</button>
        </span>
        <button type="button" className="au-regel-weg" onClick={() => setOffen(false)} aria-label="Schließen">×</button>
      </div>

      {reiter === "text" ? (
        <div>
          <textarea
            className="au-textarea"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Mail hier einfügen, z. B. aus Outlook oder Gmail.\n\nBetreff: Einladung zum Herbst-Treffen\nHallo [Vorname],\n…"}
          />
          <p className="au-klein" style={{ marginTop: "-0.5rem" }}>
            Eine erste Zeile „Betreff: …“ wird zum Betreff. [Vorname] / {"{Vorname}"} und [Nachname] werden zu Platzhaltern.
          </p>
          <button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={!text.trim()} onClick={textUebernehmen}>Übernehmen</button>
        </div>
      ) : (
        <>
          <input className="au-input" placeholder="Suchen …" value={suche} onChange={(e) => setSuche(e.target.value)} style={{ marginBottom: "0.5rem" }} />
          <ul className="au-vorlagen-liste">
            {liste.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    onUebernehmen({ betreff: v.betreff, inhalt: v.inhalt, titel: v.titel });
                    setOffen(false);
                  }}
                >
                  <strong>{v.titel}</strong>
                  <span className="au-klein">{v.untertitel}</span>
                  <span className="au-vorlagen-betreff">{v.betreff}</span>
                  <span className="au-vorlagen-anriss">{v.inhalt.slice(0, 140)}{v.inhalt.length > 140 ? " …" : ""}</span>
                </button>
              </li>
            ))}
            {!liste.length && <li className="au-klein" style={{ padding: "0.5rem" }}>Nichts gefunden.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
