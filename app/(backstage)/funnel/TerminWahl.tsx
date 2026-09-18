"use client";

import { useRouter } from "next/navigation";

// Beispieltermin fuer den Zeitstrahl: bestimmt Seminardauer (Abstand
// Start → Ende) und wo "heute" liegt. Aendert nichts am Versand.
export default function TerminWahl({
  termine,
  gewaehlt,
  mailParam,
}: {
  termine: { id: string; label: string }[];
  gewaehlt: string | null;
  mailParam: string | null;
}) {
  const router = useRouter();
  if (!termine.length) return null;
  return (
    <label className="au-zs-termin">
      <span className="au-klein">Beispieltermin</span>
      <select
        className="au-select"
        value={gewaehlt || ""}
        onChange={(e) => {
          const p = new URLSearchParams();
          if (mailParam) p.set("mail", mailParam);
          p.set("termin", e.target.value);
          router.push(`/funnel?${p}`, { scroll: false });
        }}
      >
        {termine.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    </label>
  );
}
