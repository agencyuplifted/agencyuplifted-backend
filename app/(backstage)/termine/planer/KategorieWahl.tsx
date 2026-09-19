"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setzeKandidatKategorie } from "@/lib/terminplaner-actions";

// Kategorie eines Kandidaten direkt waehlen -- speichert sofort, ohne Aufklappen
export default function KategorieWahl({
  kandidatId,
  wert,
  typen,
}: {
  kandidatId: string;
  wert: string | null;
  typen: { id: string; name: string; farbe?: string | null }[];
}) {
  const router = useRouter();
  const [aktuell, setAktuell] = useState(wert || "");
  const [laeuft, starte] = useTransition();
  const farbe = typen.find((t) => t.id === aktuell)?.farbe;
  return (
    <select
      className="au-select au-tp-kategorie"
      value={aktuell}
      disabled={laeuft}
      aria-label="Seminarkategorie"
      style={farbe ? { borderColor: farbe, boxShadow: `inset 4px 0 0 ${farbe}` } : undefined}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const neu = e.target.value;
        setAktuell(neu);
        starte(async () => {
          const r = await setzeKandidatKategorie(kandidatId, neu || null);
          if (!r.fehler) router.refresh();
        });
      }}
    >
      <option value="">Kategorie ?</option>
      {typen.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
