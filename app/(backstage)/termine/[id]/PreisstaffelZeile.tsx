"use client";

import { useState } from "react";
import { formatEUR, formatEURBrutto } from "@/lib/format";
import PreisstaffelStichtagFelder, { formatTagMitWochentag } from "./PreisstaffelStichtagFelder";

export type PreisstaffelZeileDaten = {
  id: string;
  name: string;
  preis: number | string;
  waehrung: string | null;
  sortierung: number | null;
  stichtag_tage_vor_start: number | null;
  // YYYY-MM-DD in Berliner Zeit, nur bei festem Datum
  stichtag_kalendertag: string | null;
  // vom Server vorberechnet (lib/preisstaffeln.ts), damit Tabelle und
  // oeffentliche Preisauswahl garantiert dieselbe Logik nutzen
  gilt_ab: string | null;
  gilt_bis: string;
  status: "aktuell" | "abgelaufen" | "kommend";
};

// Eine Zeile der Preisstaffel-Tabelle plus aufklappbare Bearbeiten-Zeile ueber
// die volle Tabellenbreite. Vorher steckte das Formular in einem <details>
// in der schmalen Aktionsspalte, mit "Stichtag", Waehrung und Sortierung --
// Waehrung ist immer EUR und die Sortierung ergibt sich ohnehin aus dem
// Gueltigkeitsdatum (sortierteStaffeln), beide bleiben nur als Hidden-Felder.
export default function PreisstaffelZeile({
  staffel,
  terminStart,
  seminarterminId,
  updateAction,
  deleteAction,
}: {
  staffel: PreisstaffelZeileDaten;
  terminStart: string;
  seminarterminId: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const abgelaufen = staffel.status === "abgelaufen";

  return (
    <>
      <tr style={abgelaufen ? { color: "var(--color-text-faint)" } : staffel.status === "aktuell" ? { background: "rgba(46, 160, 67, 0.08)" } : undefined}>
        <td>
          {staffel.name}
          {staffel.status === "aktuell" && <span className="au-badge au-badge-success" style={{ marginLeft: "0.4rem" }}>gilt aktuell</span>}
          {abgelaufen && <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.4rem" }}>abgelaufen</span>}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {staffel.gilt_ab ? formatTagMitWochentag(staffel.gilt_ab) : "—"}
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {formatTagMitWochentag(staffel.gilt_bis)}
          {staffel.stichtag_tage_vor_start != null && (
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
              {staffel.stichtag_tage_vor_start === 0 ? "bis Seminarstart" : `${staffel.stichtag_tage_vor_start} Tage vor Start`}
            </div>
          )}
        </td>
        <td>{formatEUR(Number(staffel.preis))}</td>
        <td style={{ color: "var(--color-text-muted)" }}>{formatEURBrutto(Number(staffel.preis))}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          <button type="button" className="au-link" onClick={() => setBearbeiten((b) => !b)}>
            {bearbeiten ? "schließen" : "bearbeiten"}
          </button>
          <form action={deleteAction} style={{ display: "inline", marginLeft: "0.75rem" }}>
            <input type="hidden" name="preisstaffel_id" value={staffel.id} />
            <input type="hidden" name="seminartermin_id" value={seminarterminId} />
            <button type="submit" className="au-link-danger">entfernen</button>
          </form>
        </td>
      </tr>
      {bearbeiten && (
        <tr>
          <td colSpan={6} style={{ background: "#f7f8fa" }}>
            <form
              action={async (fd) => {
                await updateAction(fd);
                setBearbeiten(false);
              }}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", alignItems: "start", padding: "0.25rem 0" }}
            >
              <input type="hidden" name="preisstaffel_id" value={staffel.id} />
              <input type="hidden" name="seminartermin_id" value={seminarterminId} />
              <input type="hidden" name="waehrung" value={staffel.waehrung || "EUR"} />
              <input type="hidden" name="sortierung" value={staffel.sortierung ?? 0} />
              <div>
                <label className="au-label">Name der Preisstufe</label>
                <input className="au-input" name="name" defaultValue={staffel.name} required />
              </div>
              <div>
                <label className="au-label">Preis (€, netto zzgl. USt.)</label>
                <input className="au-input" name="preis" type="number" step="0.01" defaultValue={Number(staffel.preis)} required />
              </div>
              <PreisstaffelStichtagFelder
                terminStart={terminStart}
                initialModus={staffel.stichtag_tage_vor_start != null ? "tage" : "datum"}
                initialTageVorStart={staffel.stichtag_tage_vor_start}
                initialDatum={staffel.stichtag_kalendertag}
              />
              <div style={{ display: "flex", gap: "0.5rem", alignSelf: "end" }}>
                <button type="submit" className="au-btn au-btn-primary au-btn-sm">Speichern</button>
                <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setBearbeiten(false)}>Abbrechen</button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
