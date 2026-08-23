"use client";

import { useRef, useState } from "react";
import { aktualisiereOffsitePlatzierungStatus, aktualisiereOffsitePlatzierungZielUrl } from "@/lib/actions";

const OFFSITE_STATUS = ["idee", "angefragt", "geplant", "veroeffentlicht", "abgelehnt"] as const;
export const OFFSITE_STATUS_LABEL: Record<string, string> = {
  idee: "Idee",
  angefragt: "Angefragt",
  geplant: "Geplant",
  veroeffentlicht: "Veröffentlicht",
  abgelehnt: "Abgelehnt",
};
export const OFFSITE_STATUS_BADGE: Record<string, string> = {
  idee: "au-badge-neutral",
  angefragt: "au-badge-gold",
  geplant: "au-badge-gold",
  veroeffentlicht: "au-badge-success",
  abgelehnt: "au-badge-danger",
};

export default function OffsiteZeile({
  id,
  status,
  zielUrl,
}: {
  id: string;
  status: string;
  zielUrl: string | null;
}) {
  const statusFormRef = useRef<HTMLFormElement>(null);
  const [url, setUrl] = useState(zielUrl || "");

  return (
    <>
      <td>
        <form ref={statusFormRef} action={aktualisiereOffsitePlatzierungStatus}>
          <input type="hidden" name="id" value={id} />
          <select
            className="au-select"
            name="status"
            defaultValue={status}
            onChange={() => statusFormRef.current?.requestSubmit()}
          >
            {OFFSITE_STATUS.map((s) => (
              <option key={s} value={s}>
                {OFFSITE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </form>
        <span className={`au-badge ${OFFSITE_STATUS_BADGE[status]}`} style={{ marginTop: "0.35rem", display: "inline-block" }}>
          {OFFSITE_STATUS_LABEL[status]}
        </span>
      </td>
      <td>
        <form action={aktualisiereOffsitePlatzierungZielUrl} onSubmit={(e) => { if (url === (zielUrl || "")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={id} />
          <input
            type="text"
            name="ziel_url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            placeholder="Link zum Ergebnis, sobald online"
            style={{ minWidth: 240 }}
          />
        </form>
      </td>
    </>
  );
}
