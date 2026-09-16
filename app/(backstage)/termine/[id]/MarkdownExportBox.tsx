"use client";

import { useRef, useState } from "react";

// Schreibgeschuetzte Textbox fuer den Schnelleinfuegen-Export (einzelne Option
// oder alle Optionen) mit Kopieren-Knopf. Klick ins Feld markiert alles, damit
// auch ohne Zwischenablage-Berechtigung Cmd/Strg+C sofort funktioniert.
// hinweise: Abweichungen aus pruefeSchnelleinfuegenRoundTrip -- werden
// angezeigt, damit niemand sich auf einen Round-Trip verlaesst, der bei
// genau dieser Option nicht exakt ist.
export default function MarkdownExportBox({
  text,
  hinweise = [],
  fusszeile,
}: {
  text: string;
  hinweise?: { titel?: string; texte: string[] }[];
  fusszeile?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [kopiert, setKopiert] = useState<"ok" | "fehler" | null>(null);
  const zeilen = text.split("\n").length;
  const relevanteHinweise = hinweise.filter((h) => h.texte.length);

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert("ok");
    } catch {
      // Zwischenablage blockiert (z.B. fehlende Berechtigung) -- Text markieren,
      // damit Cmd/Strg+C als Ausweg direkt funktioniert.
      ref.current?.select();
      setKopiert("fehler");
    }
    setTimeout(() => setKopiert(null), 2000);
  }

  return (
    <div>
      <textarea
        ref={ref}
        className="au-textarea"
        readOnly
        value={text}
        rows={Math.min(Math.max(zeilen, 4), 18)}
        onFocus={(e) => e.currentTarget.select()}
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.82rem", background: "#fff", marginBottom: "0.5rem" }}
        aria-label="Export-Text"
      />
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={kopieren}>
          {kopiert === "ok" ? "Kopiert!" : "Kopieren"}
        </button>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
          {kopiert === "fehler" ? "Zwischenablage blockiert – Text ist markiert, bitte mit Cmd/Strg+C kopieren." : fusszeile}
        </span>
      </div>
      {relevanteHinweise.length > 0 && (
        <div className="au-banner au-banner-warning" style={{ margin: "0.6rem 0 0", padding: "0.5rem 0.75rem", fontSize: "0.82rem" }}>
          <strong>Nicht 1:1 wieder einfügbar:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem" }}>
            {relevanteHinweise.flatMap((h, i) =>
              h.texte.map((t, j) => (
                <li key={`${i}-${j}`}>
                  {h.titel ? <>„{h.titel}“: </> : null}
                  {t}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
