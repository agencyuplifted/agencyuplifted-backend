"use client";

import { useEffect } from "react";

// Die Kampagne ist gespeichert (sonst waere man nicht auf der Vorschau):
// Browser-Zwischenspeicher des Inhalt-Schritts wegraeumen.
export default function EntwurfAufraeumen({ id }: { id: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem("au-kampagne-entwurf-neu");
      localStorage.removeItem(`au-kampagne-entwurf-${id}`);
    } catch {}
  }, [id]);
  return null;
}
