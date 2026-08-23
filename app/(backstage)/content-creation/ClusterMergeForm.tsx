"use client";

import { fuehreTriageClusterZusammen } from "@/lib/actions";

export default function ClusterMergeForm({ label, anzahl }: { label: string; anzahl: number }) {
  return (
    <form
      action={fuehreTriageClusterZusammen}
      className="au-row-2"
      style={{ maxWidth: 640 }}
      onSubmit={(e) => {
        const ok = window.confirm(
          `${anzahl} Entwürfe zu einem neuen Pillar-Entwurf zusammenführen? Die Quellen werden danach archiviert.`
        );
        if (!ok) e.preventDefault();
      }}
    >
      <input type="hidden" name="triage_cluster_label" value={label} />
      <input type="text" name="neuer_titel" required placeholder="Titel des neuen Pillar-Entwurfs" defaultValue={label} />
      <button type="submit" className="au-btn au-btn-primary">
        Zusammenführen →
      </button>
    </form>
  );
}
