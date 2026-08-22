"use client";

import { useRef } from "react";
import {
  aktualisiereThemenRadarStatus,
  toggleThemenRadarLinkedin,
  loescheThemenRadarIdee,
  uebernehmeThemenRadarIdeeInInsights,
} from "@/lib/actions";
import { STATUS, STATUS_LABEL } from "@/lib/themen-radar";

export default function ThemenRadarZeile({
  id,
  thema,
  status,
  fuerLinkedin,
}: {
  id: string;
  thema: string;
  status: string;
  fuerLinkedin: boolean;
}) {
  const statusFormRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <td>
        <form ref={statusFormRef} action={aktualisiereThemenRadarStatus}>
          <input type="hidden" name="id" value={id} />
          <select
            className="au-select"
            name="status"
            defaultValue={status}
            onChange={() => statusFormRef.current?.requestSubmit()}
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </form>
      </td>
      <td>
        <form action={toggleThemenRadarLinkedin}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="neuer_wert" value={(!fuerLinkedin).toString()} />
          <button
            type="submit"
            className={`au-btn au-btn-sm ${fuerLinkedin ? "au-btn-primary" : "au-btn-secondary"}`}
            title="Für LinkedIn-Zweitverwertung vormerken"
          >
            {fuerLinkedin ? "★ LinkedIn" : "☆ LinkedIn"}
          </button>
        </form>
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <form action={uebernehmeThemenRadarIdeeInInsights}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="au-btn au-btn-primary au-btn-sm">
              In Insights-Entwurf übernehmen
            </button>
          </form>
          <form
            action={loescheThemenRadarIdee}
            onSubmit={(e) => {
              const ok = window.confirm(`Idee "${thema}" wirklich löschen?`);
              if (!ok) e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="au-btn au-btn-danger au-btn-sm">
              Löschen
            </button>
          </form>
        </div>
      </td>
    </>
  );
}
