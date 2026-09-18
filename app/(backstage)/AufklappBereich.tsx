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
}: {
  merkSchluessel: string;
  zusammenfassung: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  standardOffen?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const schluessel = `au-offen-${merkSchluessel}`;

  useEffect(() => {
    try {
      const s = sessionStorage.getItem(schluessel);
      if (s !== null && ref.current) ref.current.open = s === "1";
    } catch {}
  }, [schluessel]);

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
