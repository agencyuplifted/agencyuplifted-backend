"use client";

import { useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import { KONTAKT_STATUS, KONTAKT_STATUS_LABEL, type KontaktStatus } from "@/lib/events";

// Status-Auswahl, die sofort speichert -- fuer schnelles Nachhalten in Listen.
export default function KontaktStatusAuswahl({
  kontaktId,
  status,
  reiheId,
  action,
}: {
  kontaktId: string;
  status: string;
  reiheId?: string;
  action: (fd: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [wert, setWert] = useState(status);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  return (
    <span title={fehler || undefined}>
      <select
        className="au-select au-inbox-select"
        value={wert}
        disabled={laeuft}
        style={fehler ? { borderColor: "var(--color-danger)" } : undefined}
        onChange={(e) => {
          const neu = e.target.value;
          const alt = wert;
          setWert(neu);
          const fd = new FormData();
          fd.set("id", kontaktId);
          fd.set("status", neu);
          if (reiheId) fd.set("event_reihe_id", reiheId);
          starte(async () => {
            const r = await action(fd);
            setFehler(r.fehler);
            if (r.fehler) setWert(alt);
          });
        }}
        aria-label="Kontakt-Status"
      >
        {KONTAKT_STATUS.map((s) => <option key={s} value={s}>{KONTAKT_STATUS_LABEL[s as KontaktStatus]}</option>)}
      </select>
    </span>
  );
}
