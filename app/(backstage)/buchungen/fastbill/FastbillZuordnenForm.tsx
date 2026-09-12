"use client";

import { useMemo, useState } from "react";
import { bestaetigeFastbillZuordnung } from "@/lib/actions";

type Termin = { id: string; kennung: string | null; titel: string; datum_start: string };
type Option = { id: string; seminartermin_id: string; titel: string };
type Teilnehmer = { id: string; vorname: string; nachname: string; email: string | null };
type BestehendePosition = {
  teilnehmerId: string;
  optionId: string | null;
  vorname?: string | null;
  nachname?: string | null;
  email?: string | null;
};

const MAX_TEILNEHMER = 4;
const DATALIST_ID = "fastbill-teilnehmer-vorschlaege";

const anzeigeText = (tn: { vorname: string; nachname: string; email?: string | null }) =>
  `${tn.nachname}, ${tn.vorname}${tn.email ? ` (${tn.email})` : ""}`;

// Zwei voneinander abhaengige Dropdowns (Termin -> nur dessen Optionen)
// brauchen Client-State, da die Optionsliste sich je nach Terminwahl aendert
// -- reines Server-Component-Formular kaeme hier nicht ohne Neuladen aus.
// Bis zu 4 Teilnehmer-Zeilen, da eine FastBill-Gesamtrechnung haeufig eine
// ganze Gruppe abdeckt, nicht nur eine Person. Die Teilnehmer-Auswahl ist
// ein Text-Feld mit HTML-<datalist>-Autovervollstaendigung statt eines
// langen <select> -- bei vielen hundert Teilnehmern x 4 Zeilen war das
// bisherige Dropdown unhandlich. Tippen matcht gegen die bekannten Namen;
// bei exaktem Treffer wird die Teilnehmer-ID im Hintergrund gesetzt, sonst
// bleibt sie leer (dann zaehlt ggf. "neuer Teilnehmer" darunter).
export default function FastbillZuordnenForm({
  rechnungId,
  termine,
  optionen,
  teilnehmer,
  defaultSeminarterminId,
  defaultOptionId,
  defaultPositionen = [],
}: {
  rechnungId: string;
  termine: Termin[];
  optionen: Option[];
  teilnehmer: Teilnehmer[];
  defaultSeminarterminId: string | null;
  defaultOptionId: string | null;
  defaultPositionen?: BestehendePosition[];
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
  const idByAnzeigeText = useMemo(() => {
    const map = new Map<string, string>();
    teilnehmerSortiert.forEach((tn) => map.set(anzeigeText(tn), tn.id));
    return map;
  }, [teilnehmerSortiert]);

  const [sichtbareZeilen, setSichtbareZeilen] = useState(() => Math.min(MAX_TEILNEHMER, Math.max(1, defaultPositionen.length)));

  const initialeZeilen = Array.from({ length: MAX_TEILNEHMER }).map((_, i) => {
    const bestehende = defaultPositionen[i];
    if (bestehende?.teilnehmerId && bestehende.nachname && bestehende.vorname) {
      return { eingabe: anzeigeText({ vorname: bestehende.vorname, nachname: bestehende.nachname, email: bestehende.email }), teilnehmerId: bestehende.teilnehmerId };
    }
    return { eingabe: "", teilnehmerId: "" };
  });
  const [zeilen, setZeilen] = useState(initialeZeilen);

  const aendereEingabe = (i: number, wert: string) => {
    setZeilen((prev) => {
      const kopie = [...prev];
      kopie[i] = { eingabe: wert, teilnehmerId: idByAnzeigeText.get(wert) || "" };
      return kopie;
    });
  };

  return (
    <form
      action={bestaetigeFastbillZuordnung}
      style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minWidth: 300 }}
    >
      <input type="hidden" name="id" value={rechnungId} />

      <datalist id={DATALIST_ID}>
        {teilnehmerSortiert.map((tn) => (
          <option key={tn.id} value={anzeigeText(tn)} />
        ))}
      </datalist>

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

      {Array.from({ length: sichtbareZeilen }).map((_, i) => {
        const bestehende = defaultPositionen[i];
        return (
          <div
            key={i}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "0.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
              Teilnehmer {i + 1}
              {i === 0 ? "" : " (optional)"}
            </div>
            <select
              className="au-select"
              name={`seminartermin_option_id_${i}`}
              defaultValue={bestehende?.optionId || (i === 0 ? defaultOptionId || "" : "")}
              required={i === 0}
            >
              <option value="">Option wählen …</option>
              {passendeOptionen.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.titel}
                </option>
              ))}
            </select>

            <input type="hidden" name={`teilnehmer_id_${i}`} value={zeilen[i].teilnehmerId} />
            <input
              className="au-input"
              list={DATALIST_ID}
              placeholder="Namen tippen … (bestehenden Teilnehmer wählen)"
              value={zeilen[i].eingabe}
              onChange={(e) => aendereEingabe(i, e.target.value)}
            />
            {zeilen[i].eingabe && !zeilen[i].teilnehmerId && (
              <div style={{ fontSize: "0.72rem", color: "var(--color-warning, #b8860b)" }}>
                Kein bestehender Teilnehmer mit diesem Namen — entweder exakt aus der Liste wählen oder unten neu anlegen.
              </div>
            )}

            <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)" }}>oder neuer Teilnehmer:</div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input className="au-input" name={`neu_vorname_${i}`} placeholder="Vorname" style={{ flex: 1 }} />
              <input className="au-input" name={`neu_nachname_${i}`} placeholder="Nachname" style={{ flex: 1 }} />
            </div>
            <input className="au-input" name={`neu_email_${i}`} placeholder="E-Mail (optional)" />
          </div>
        );
      })}

      {sichtbareZeilen < MAX_TEILNEHMER && (
        <button
          type="button"
          className="au-btn au-btn-secondary au-btn-sm"
          onClick={() => setSichtbareZeilen((n) => Math.min(MAX_TEILNEHMER, n + 1))}
        >
          + weiterer Teilnehmer
        </button>
      )}

      <button type="submit" className="au-btn au-btn-primary au-btn-sm">
        Zuordnen &amp; übernehmen
      </button>
    </form>
  );
}
