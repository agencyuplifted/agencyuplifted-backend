"use client";

import { useState } from "react";
import UrgencyTextFeld from "./UrgencyTextFeld";

export type UrgencyStufeZeileDaten = {
  id: string;
  schwellenwert_typ: "prozent" | "belegt" | "frei" | null;
  schwellenwert_prozent: number | string | null;
  schwellenwert_anzahl: number | null;
  text_vorlage: string;
  // vom Server vorberechnet (lib/verfuegbarkeit.ts), damit Tabelle und
  // Website garantiert dieselbe Auswertung nutzen
  beschreibung: string;
  greiftAktuell: boolean;
  textVorschau: string;
};

export function UrgencySchwellenwertFelder({
  initialTyp = "frei",
  initialWert,
}: {
  initialTyp?: "prozent" | "belegt" | "frei";
  initialWert?: number | null;
}) {
  const [typ, setTyp] = useState(initialTyp);
  return (
    <>
      <div>
        <label className="au-label">Bedingung</label>
        <select className="au-select" name="schwellenwert_typ" value={typ} onChange={(e) => setTyp(e.target.value as typeof typ)}>
          <option value="frei">höchstens X Plätze frei</option>
          <option value="belegt">ab X Plätzen belegt</option>
          <option value="prozent">ab X % belegt</option>
        </select>
      </div>
      <div>
        <label className="au-label">{typ === "prozent" ? "X (% belegt)" : typ === "belegt" ? "X (belegte Plätze)" : "X (freie Plätze)"}</label>
        <input
          className="au-input"
          name="schwellenwert"
          type="number"
          min={0}
          max={typ === "prozent" ? 100 : undefined}
          step={typ === "prozent" ? "any" : 1}
          defaultValue={initialWert ?? ""}
          required
        />
      </div>
    </>
  );
}

export default function UrgencyStufeZeile({
  stufe,
  seminarterminId,
  freiePlaetze,
  kapazitaet,
  updateAction,
  deleteAction,
}: {
  stufe: UrgencyStufeZeileDaten;
  seminarterminId: string;
  freiePlaetze: number;
  kapazitaet: number;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const typ = stufe.schwellenwert_typ || "prozent";
  const wert = typ === "prozent" ? Number(stufe.schwellenwert_prozent) : stufe.schwellenwert_anzahl;

  return (
    <>
      <tr style={stufe.greiftAktuell ? { background: "rgba(46, 160, 67, 0.08)" } : undefined}>
        <td style={{ whiteSpace: "nowrap" }}>{stufe.beschreibung}</td>
        <td>
          {stufe.text_vorlage}
          {stufe.textVorschau !== stufe.text_vorlage && (
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>aktuell: „{stufe.textVorschau}“</div>
          )}
        </td>
        <td>{stufe.greiftAktuell && <span className="au-badge au-badge-success">wird angezeigt</span>}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          <button type="button" className="au-link" onClick={() => setBearbeiten((b) => !b)}>
            {bearbeiten ? "schließen" : "bearbeiten"}
          </button>
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!window.confirm(`Urgency-Stufe „${stufe.text_vorlage}“ wirklich löschen?`)) e.preventDefault();
            }}
            style={{ display: "inline", marginLeft: "0.75rem" }}
          >
            <input type="hidden" name="urgency_stufe_id" value={stufe.id} />
            <input type="hidden" name="seminartermin_id" value={seminarterminId} />
            <button type="submit" className="au-link-danger">entfernen</button>
          </form>
        </td>
      </tr>
      {bearbeiten && (
        <tr>
          <td colSpan={4} style={{ background: "#f7f8fa" }}>
            <form
              action={async (fd) => {
                await updateAction(fd);
                setBearbeiten(false);
              }}
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", alignItems: "start", padding: "0.25rem 0" }}
            >
              <input type="hidden" name="urgency_stufe_id" value={stufe.id} />
              <input type="hidden" name="seminartermin_id" value={seminarterminId} />
              <UrgencySchwellenwertFelder initialTyp={typ} initialWert={wert} />
              <UrgencyTextFeld
                name="text_vorlage"
                label="Text"
                defaultValue={stufe.text_vorlage}
                freiePlaetze={freiePlaetze}
                kapazitaet={kapazitaet}
                required
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
