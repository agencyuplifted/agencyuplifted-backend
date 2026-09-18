"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// <details>, das sich seinen Auf-/Zu-Zustand pro Browser-Tab merkt
// (sessionStorage). Nach dem Speichern eines Formulars leiten viele Actions
// auf dieselbe Seite um -- ohne das waeren gerade bearbeitete Bereiche danach
// wieder zugeklappt.
export default function AufklappBereich({
  merkSchluessel,
  zusammenfassung,
  children,
  className,
  style,
  standardOffen = false,
  oeffnenBeiHash,
}: {
  merkSchluessel: string;
  zusammenfassung: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  standardOffen?: boolean;
  /** Klappt auf, wenn die URL auf #<wert> zeigt (z. B. Button "+ Neu" mit href="#neu"). */
  oeffnenBeiHash?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const schluessel = `au-offen-${merkSchluessel}`;

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(schluessel);
      if (s !== null && ref.current) ref.current.open = s === "1";
    } catch {}
  }, [schluessel]);

  useEffect(() => {
    if (!oeffnenBeiHash) return;
    const pruefe = () => {
      if (window.location.hash === `#${oeffnenBeiHash}` && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    pruefe();
    window.addEventListener("hashchange", pruefe);
    return () => window.removeEventListener("hashchange", pruefe);
  }, [oeffnenBeiHash]);

  return (
    <details
      ref={ref}
      className={className}
      style={style}
      open={standardOffen}
      onToggle={(e) => {
        try { sessionStorage.setItem(schluessel, (e.currentTarget as HTMLDetailsElement).open ? "1" : "0"); } catch {}
      }}
    >
      <summary>{zusammenfassung}</summary>
      {children}
    </details>
  );
}
