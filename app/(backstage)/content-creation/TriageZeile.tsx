"use client";

import { useRef, useState } from "react";
import { aktualisiereTriageAktion, aktualisiereTriageClusterLabel } from "@/lib/actions";
import { TRIAGE_AKTION, TRIAGE_AKTION_LABEL, TRIAGE_AKTION_BADGE, type TriageAktion } from "@/lib/triage";

export default function TriageZeile({
  id,
  aktion,
  clusterLabel,
}: {
  id: string;
  aktion: TriageAktion;
  clusterLabel: string | null;
}) {
  const aktionFormRef = useRef<HTMLFormElement>(null);
  const [label, setLabel] = useState(clusterLabel || "");

  return (
    <>
      <td>
        <form ref={aktionFormRef} action={aktualisiereTriageAktion}>
          <input type="hidden" name="id" value={id} />
          <select
            className="au-select"
            name="triage_aktion"
            defaultValue={aktion}
            onChange={() => aktionFormRef.current?.requestSubmit()}
          >
            {TRIAGE_AKTION.map((a) => (
              <option key={a} value={a}>
                {TRIAGE_AKTION_LABEL[a]}
              </option>
            ))}
          </select>
        </form>
        <span className={`au-badge ${TRIAGE_AKTION_BADGE[aktion]}`} style={{ marginTop: "0.35rem", display: "inline-block" }}>
          {TRIAGE_AKTION_LABEL[aktion]}
        </span>
      </td>
      <td>
        <form action={aktualisiereTriageClusterLabel} onSubmit={(e) => { if (label === (clusterLabel || "")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={id} />
          <input
            type="text"
            name="triage_cluster_label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            placeholder="z.B. Preisfindung-Einkauf-Cluster"
            style={{ minWidth: 220 }}
          />
        </form>
      </td>
    </>
  );
}
