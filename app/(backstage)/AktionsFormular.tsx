"use client";

import { useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";

// Generisches Formular fuer Server Actions, die { fehler } zurueckgeben statt
// zu werfen (in Production ersetzt Next.js geworfene Fehlertexte durch einen
// generischen Hinweis). Zeigt den Fehler direkt am Formular an und kann nach
// Erfolg zuruecksetzen. bestaetigung = sichtbare Ja/Nein-Rueckfrage statt
// window.confirm() (Chrome unterdrueckt native Dialoge nach ein paar Aufrufen).
export default function AktionsFormular({
  action,
  children,
  className,
  style,
  zuruecksetzen = false,
  bestaetigung,
}: {
  action: (formData: FormData) => Promise<VorlagenAktionsErgebnis>;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  zuruecksetzen?: boolean;
  bestaetigung?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fragt, setFragt] = useState<FormData | null>(null);
  const [laeuft, starte] = useTransition();

  function ausfuehren(fd: FormData) {
    starte(async () => {
      setFehler(null);
      try {
        const r = await action(fd);
        if (r.fehler) setFehler(r.fehler);
        else if (zuruecksetzen) formRef.current?.reset();
      } catch (e: any) {
        setFehler(`Fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
      }
    });
  }

  return (
    <form
      ref={formRef}
      className={className}
      style={{ ...style, opacity: laeuft ? 0.6 : undefined }}
      action={(fd) => (bestaetigung ? setFragt(fd) : ausfuehren(fd))}
    >
      {children}
      {fragt && (
        <div style={{ gridColumn: "1 / -1", flexBasis: "100%", background: "var(--color-warning-soft)", border: "1px solid var(--color-warning-border)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.65rem", marginTop: "0.4rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--color-text)" }}>{bestaetigung}</p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={() => { const fd = fragt; setFragt(null); ausfuehren(fd); }}>
              Ja
            </button>
            <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setFragt(null)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {fehler && <p style={{ gridColumn: "1 / -1", flexBasis: "100%", margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--color-danger)" }}>{fehler}</p>}
    </form>
  );
}
