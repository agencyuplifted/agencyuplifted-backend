"use client";

import { useState } from "react";
import type { Block } from "@/lib/insights";

const LEER: Record<Block["typ"], Block> = {
  absatz: { typ: "absatz", text: "" },
  ueberschrift: { typ: "ueberschrift", ebene: 2, text: "" },
  liste: { typ: "liste", stil: "ungeordnet", punkte: [""] },
  zitat: { typ: "zitat", text: "", quelle: "" },
  bild: { typ: "bild", url: "", alt: "", bildunterschrift: "" },
  faq: { typ: "faq", frage: "", antwort: "" },
};

const TYP_LABEL: Record<Block["typ"], string> = {
  absatz: "Absatz",
  ueberschrift: "Überschrift",
  liste: "Liste",
  zitat: "Zitat",
  bild: "Bild",
  faq: "FAQ",
};

export default function BlockEditor({ name, initial }: { name: string; initial: Block[] }) {
  const [bloecke, setBloecke] = useState<Block[]>(initial.length ? initial : []);

  function aendere(i: number, patch: Partial<Block>) {
    setBloecke((b) => b.map((block, idx) => (idx === i ? ({ ...block, ...patch } as Block) : block)));
  }

  function entferne(i: number) {
    setBloecke((b) => b.filter((_, idx) => idx !== i));
  }

  function verschiebe(i: number, richtung: -1 | 1) {
    setBloecke((b) => {
      const ziel = i + richtung;
      if (ziel < 0 || ziel >= b.length) return b;
      const kopie = [...b];
      [kopie[i], kopie[ziel]] = [kopie[ziel], kopie[i]];
      return kopie;
    });
  }

  function fuegeHinzu(typ: Block["typ"]) {
    setBloecke((b) => [...b, { ...LEER[typ] }]);
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(bloecke)} />

      {bloecke.map((block, i) => (
        <div key={i} className="au-subcard" style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <strong style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{TYP_LABEL[block.typ]}</strong>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => verschiebe(i, -1)} disabled={i === 0}>↑</button>
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => verschiebe(i, 1)} disabled={i === bloecke.length - 1}>↓</button>
              <button type="button" className="au-btn au-btn-danger au-btn-sm" onClick={() => entferne(i)}>Entfernen</button>
            </div>
          </div>

          {block.typ === "absatz" && (
            <textarea
              className="au-textarea"
              rows={4}
              placeholder="Text des Absatzes..."
              value={block.text}
              onChange={(e) => aendere(i, { text: e.target.value })}
            />
          )}

          {block.typ === "ueberschrift" && (
            <div className="au-row-2">
              <select
                className="au-select"
                value={block.ebene}
                onChange={(e) => aendere(i, { ebene: Number(e.target.value) as 2 | 3 | 4 })}
              >
                <option value={2}>H2</option>
                <option value={3}>H3</option>
                <option value={4}>H4</option>
              </select>
              <input
                className="au-input"
                placeholder="Überschriftentext"
                value={block.text}
                onChange={(e) => aendere(i, { text: e.target.value })}
              />
            </div>
          )}

          {block.typ === "liste" && (
            <div>
              <select
                className="au-select"
                value={block.stil}
                onChange={(e) => aendere(i, { stil: e.target.value as "ungeordnet" | "geordnet" })}
                style={{ marginBottom: "0.5rem" }}
              >
                <option value="ungeordnet">Ungeordnet (Punkte)</option>
                <option value="geordnet">Geordnet (Nummeriert)</option>
              </select>
              <textarea
                className="au-textarea"
                rows={4}
                placeholder={"Ein Punkt pro Zeile"}
                value={block.punkte.join("\n")}
                onChange={(e) => aendere(i, { punkte: e.target.value.split("\n") })}
              />
            </div>
          )}

          {block.typ === "zitat" && (
            <div>
              <textarea
                className="au-textarea"
                rows={3}
                placeholder="Zitattext"
                value={block.text}
                onChange={(e) => aendere(i, { text: e.target.value })}
              />
              <input
                className="au-input"
                placeholder="Quelle (optional)"
                value={block.quelle || ""}
                onChange={(e) => aendere(i, { quelle: e.target.value })}
                style={{ marginTop: "0.5rem" }}
              />
            </div>
          )}

          {block.typ === "bild" && (
            <div className="au-row-2">
              <input
                className="au-input"
                placeholder="Bild-URL"
                value={block.url}
                onChange={(e) => aendere(i, { url: e.target.value })}
              />
              <input
                className="au-input"
                placeholder="Alt-Text (Pflicht für SEO/GEO)"
                value={block.alt}
                onChange={(e) => aendere(i, { alt: e.target.value })}
              />
              <input
                className="au-input"
                placeholder="Bildunterschrift (optional)"
                value={block.bildunterschrift || ""}
                onChange={(e) => aendere(i, { bildunterschrift: e.target.value })}
              />
            </div>
          )}

          {block.typ === "faq" && (
            <div>
              <input
                className="au-input"
                placeholder="Frage"
                value={block.frage}
                onChange={(e) => aendere(i, { frage: e.target.value })}
                style={{ marginBottom: "0.5rem" }}
              />
              <textarea
                className="au-textarea"
                rows={3}
                placeholder="Antwort"
                value={block.antwort}
                onChange={(e) => aendere(i, { antwort: e.target.value })}
              />
            </div>
          )}
        </div>
      ))}

      <div className="au-toolbar" style={{ flexWrap: "wrap" }}>
        {(Object.keys(TYP_LABEL) as Block["typ"][]).map((typ) => (
          <button key={typ} type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => fuegeHinzu(typ)}>
            + {TYP_LABEL[typ]}
          </button>
        ))}
      </div>
    </div>
  );
}
