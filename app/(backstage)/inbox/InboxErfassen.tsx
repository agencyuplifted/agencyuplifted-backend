"use client";

import { useRef, useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";

type Aktion = (formData: FormData) => Promise<VorlagenAktionsErgebnis>;

// Schnellerfassung direkt in der Backstage (Quelle "backstage"). Enter
// speichert, Shift+Enter macht eine neue Zeile -- wie in einem Chat.
export function InboxErfassen({ erfassenAction }: { erfassenAction: Aktion }) {
  const [text, setText] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const feld = useRef<HTMLTextAreaElement>(null);

  function absenden() {
    if (!text.trim()) return;
    const fd = new FormData();
    fd.set("text", text);
    starte(async () => {
      setFehler(null);
      const r = await erfassenAction(fd);
      if (r.fehler) setFehler(r.fehler);
      else {
        setText("");
        feld.current?.focus();
      }
    });
  }

  return (
    <div className="au-inbox-erfassen">
      <textarea
        ref={feld}
        className="au-textarea"
        rows={2}
        placeholder="Was ist dir eingefallen? (Enter = speichern)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            absenden();
          }
        }}
        disabled={laeuft}
      />
      <button type="button" className="au-btn au-btn-primary" onClick={absenden} disabled={laeuft || !text.trim()}>
        {laeuft ? "…" : "Erfassen"}
      </button>
      {fehler && <p className="au-inbox-fehler" style={{ gridColumn: "1 / -1" }}>{fehler}</p>}
    </div>
  );
}

export function ClusterAnlegen({ anlegenAction }: { anlegenAction: Aktion }) {
  const [name, setName] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  function anlegen() {
    const fd = new FormData();
    fd.set("name", name);
    starte(async () => {
      setFehler(null);
      const r = await anlegenAction(fd);
      if (r.fehler) setFehler(r.fehler);
      else setName("");
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          className="au-input"
          style={{ marginBottom: 0 }}
          placeholder="Neuer Cluster, z. B. Positionierung"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (name.trim()) anlegen();
            }
          }}
        />
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={anlegen} disabled={laeuft || !name.trim()}>
          Anlegen
        </button>
      </div>
      {fehler && <p className="au-inbox-fehler">{fehler}</p>}
    </div>
  );
}
