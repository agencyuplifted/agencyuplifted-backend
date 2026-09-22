"use client";

import { useEffect } from "react";

// Direktsprung aus den Programm-Kalendern bzw. /termine
// (/termine/planer?jahr=…&kandidat=ID#kandidaten): nachdem SeitenTabs den
// Reiter "Kandidaten" sichtbar gemacht hat, zur markierten Zeile scrollen.
// Kurz verzoegert, weil die Zeile bis dahin in einem versteckten Reiter liegt
// und scrollIntoView dort nichts bewirkt.
export default function KandidatFokus({ id }: { id: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      document.getElementById(`kandidat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  }, [id]);
  return null;
}
