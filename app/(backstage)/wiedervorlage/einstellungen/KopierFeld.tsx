"use client";

import { useState } from "react";

export default function KopierFeld({ wert }: { wert: string }) {
  const [kopiert, setKopiert] = useState(false);
  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
      <input className="au-input" style={{ marginBottom: 0, fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }} readOnly value={wert} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="au-btn au-btn-secondary au-btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(wert);
            setKopiert(true);
            setTimeout(() => setKopiert(false), 1500);
          } catch {}
        }}
      >
        {kopiert ? "✓" : "Kopieren"}
      </button>
    </div>
  );
}
