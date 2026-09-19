"use client";

import { useState } from "react";

// Textliste der "in Prüfung"-Termine zum Einfuegen in die Hotelanfrage
export default function KopierText({ text }: { text: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div className="au-tp-export">
      <textarea className="au-textarea" readOnly value={text} rows={Math.min(12, text.split("\n").length + 1)} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="au-btn au-btn-secondary au-btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setKopiert(true);
            setTimeout(() => setKopiert(false), 2000);
          } catch {}
        }}
      >
        {kopiert ? "Kopiert ✓" : "Text kopieren"}
      </button>
    </div>
  );
}
