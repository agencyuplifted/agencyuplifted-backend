"use client";

import { useMemo, useState } from "react";
import { bestaetigeFastbillZuordnung } from "@/lib/actions";

type Termin = { id: string; kennung: string | null; titel: string; datum_start: string };
type Option = { id: string; seminartermin_id: string; titel: string };
type Teilnehmer = { id: string; vorname: string; nachname: string; email: string | null };

// Zwei voneinander abhaengige Dropdowns (Termin -> nur dessen Optionen)
// brauchen Client-State, da die Optionsliste sich je nach Terminwahl aendert
// -- reines Server-Component-Formular kaeme hier nicht ohne Neuladen aus.
export default function FastbillZuordnenForm({
  rechnungId,
  termine,
  optionen,
  teilnehmer,
  defaultSeminarterminId,
  defaultOptionId,
}: {
  rechnungId: string;
  termine: Termin[];
  optionen: Option[];
  teilnehmer: Teilnehmer[];
  defaultSeminarterminId: string | null;
  defaultOptionId: string | null;
}) {
  const [seminarterminId, setSeminarterminId] = useState(defaultSeminarterminId || "");
  const passendeOptionen = useMemo(
    () => optionen.filter((o) => o.seminartermin_id === seminarterminId),
    [optionen, seminarterminId]
  );

  const terminLabel = (t: Termin) => `${t.kennung || t.titel} – ${t.datum_start}`;
  const teilnehmerSortiert = useMemo(
    () => [...teilnehmer].sort((a, b) => a.nachname.localeCompare(b.nachname) || a.vorname.localeCompare(b.vorname)),
    [teilnehmer]
  );

  return (
    <form action={bestaetigeFastbillZuordnung} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 280 }}>
      <input type="hidden" name="id" value={rechnungId} />

      <select
        className="au-select"
        name="seminartermin_id"
        value={seminarterminId}
        onChange={(e) => setSeminarterminId(e.target.value)}
        required
      >
        <option value="">Termin wählen …</option>
        {termine.map((t) => (
          <option key={t.id} value={t.id}>
            {terminLabel(t)}
          </option>
        ))}
      </select>

      <select className="au-select" name="seminartermin_option_id" defaultValue={defaultOptionId || ""} required>
        <option value="">Option wählen …</option>
        {passendeOptionen.map((o) => (
          <option key={o.id} value={o.id}>
            {o.titel}
          </option>
        ))}
      </select>

      <select className="au-select" name="teilnehmer_id" defaultValue="">
        <option value="">— bestehenden Teilnehmer wählen —</option>
        {teilnehmerSortiert.map((tn) => (
          <option key={tn.id} value={tn.id}>
            {tn.nachname}, {tn.vorname}
            {tn.email ? ` (${tn.email})` : ""}
          </option>
        ))}
      </select>

      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>oder neuer Teilnehmer:</div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <input className="au-input" name="neu_vorname" placeholder="Vorname" style={{ flex: 1 }} />
        <input className="au-input" name="neu_nachname" placeholder="Nachname" style={{ flex: 1 }} />
      </div>
      <input className="au-input" name="neu_email" placeholder="E-Mail (optional)" />

      <button type="submit" className="au-btn au-btn-primary au-btn-sm">
        Zuordnen &amp; übernehmen
      </button>
    </form>
  );
}
