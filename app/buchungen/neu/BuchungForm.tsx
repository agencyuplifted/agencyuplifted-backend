"use client";

import { useState } from "react";
import { createBuchung } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };

type Teilnehmer = { id: string; vorname: string; nachname: string; email: string };
type Organisation = { id: string; name: string };
type Termin = { id: string; datum_start: string; seminartypen?: { name: string } | null };

export default function BuchungForm({
  teilnehmer,
  organisationen,
  termine,
}: {
  teilnehmer: Teilnehmer[];
  organisationen: Organisation[];
  termine: Termin[];
}) {
  const [modus, setModus] = useState<"seminar" | "individuell">("seminar");

  return (
    <form action={createBuchung} style={{ maxWidth: 560 }}>
      <input type="hidden" name="modus" value={modus} />

      <label style={labelStyle}>Art der Buchung</label>
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
          <input type="radio" checked={modus === "seminar"} onChange={() => setModus("seminar")} />
          Seminartermin
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
          <input type="radio" checked={modus === "individuell"} onChange={() => setModus("individuell")} />
          Individuelle Leistung (Begleitung / Coaching / Inhouse)
        </label>
      </div>

      <label style={labelStyle}>Rechnungsempfänger — Organisation (leer lassen, wenn Selbständige/r ohne Firma)</label>
      <select style={inputStyle} name="organisation_id">
        <option value="">— keine Organisation, direkt an Teilnehmer —</option>
        {organisationen?.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>

      <label style={labelStyle}>Teilnehmer</label>
      <select style={inputStyle} name="teilnehmer_id" required>
        {teilnehmer?.map((t) => (
          <option key={t.id} value={t.id}>{t.vorname} {t.nachname} ({t.email})</option>
        ))}
      </select>

      {modus === "seminar" ? (
        <>
          <label style={labelStyle}>Seminartermin</label>
          <select style={inputStyle} name="seminartermin_id" required={modus === "seminar"}>
            {termine?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.seminartypen?.name} – {formatDatum(t.datum_start)}
              </option>
            ))}
          </select>

          <div style={row}>
            <div>
              <label style={labelStyle}>Listenpreis (€)</label>
              <input style={inputStyle} name="listenpreis" type="number" step="0.01" required={modus === "seminar"} />
            </div>
            <div>
              <label style={labelStyle}>Rabatt (€, optional)</label>
              <input style={inputStyle} name="rabatt_betrag" type="number" step="0.01" defaultValue={0} />
            </div>
          </div>
        </>
      ) : (
        <>
          <label style={labelStyle}>Beschreibung der Leistung</label>
          <input style={inputStyle} name="il_beschreibung" placeholder="z. B. Begleitung 3 Monate vor Ort + Erreichbarkeit" required={modus === "individuell"} />

          <div style={row}>
            <div>
              <label style={labelStyle}>Start (optional)</label>
              <input style={inputStyle} name="il_startdatum" type="date" />
            </div>
            <div>
              <label style={labelStyle}>Ende (optional)</label>
              <input style={inputStyle} name="il_enddatum" type="date" />
            </div>
          </div>

          <div style={row}>
            <div>
              <label style={labelStyle}>Listenpreis (€)</label>
              <input style={inputStyle} name="il_listenpreis" type="number" step="0.01" required={modus === "individuell"} />
            </div>
            <div>
              <label style={labelStyle}>Rabatt (€, optional)</label>
              <input style={inputStyle} name="il_rabatt_betrag" type="number" step="0.01" defaultValue={0} />
            </div>
          </div>
        </>
      )}

      <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
        Buchung anlegen
      </button>
    </form>
  );
}
