"use client";

import { useState } from "react";
import { createBuchung } from "@/lib/actions";
import { formatDatum, formatEUR } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" };
const teilnehmerRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr auto", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.5rem" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1rem 1.25rem", marginBottom: "1.25rem" };

type Teilnehmer = { id: string; vorname: string; nachname: string; email: string };
type Organisation = { id: string; name: string };
type Preisstaffel = { id: string; name: string; stichtag_tage_vor_start: number; preis: number };
type Option = { id: string; titel: string; preisstaffeln?: Preisstaffel[] };
type Termin = {
  id: string;
  datum_start: string;
  seminartypen?: { name: string } | null;
  zusatzteilnehmer_preis?: number | null;
  zusatzteilnehmer_rabatt_prozent?: number | null;
  seminartermin_optionen?: Option[];
};

let rowIdCounter = 1;

function aktuellerPreis(preisstaffeln: Preisstaffel[] | undefined, datumStart: string): number | null {
  if (!preisstaffeln?.length) return null;
  const heute = new Date();
  const start = new Date(datumStart);
  const tageBisStart = Math.ceil((start.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  const sortiert = [...preisstaffeln].sort((a, b) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start);
  const aktiv = sortiert.find((p) => tageBisStart >= p.stichtag_tage_vor_start);
  if (aktiv) return Number(aktiv.preis);
  const letzte = sortiert[sortiert.length - 1];
  return letzte ? Number(letzte.preis) : null;
}

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
  const [seminarterminId, setSeminarterminId] = useState("");
  const [teilnehmerZeilen, setTeilnehmerZeilen] = useState([
    { key: 0, teilnehmerId: "", optionId: "", listenpreis: "", rabatt: "0" },
  ]);
  const [einzelTeilnehmerId, setEinzelTeilnehmerId] = useState("");

  const gewaehlterTermin = termine.find((t) => t.id === seminarterminId);
  const optionenDesTermins = gewaehlterTermin?.seminartermin_optionen || [];

  function preisVorschlagFuer(optionId: string, istZusatzteilnehmer: boolean, ersteZeilePreis?: string): string {
    if (!gewaehlterTermin) return "";
    const option = optionenDesTermins.find((o) => o.id === optionId);
    let basis = aktuellerPreis(option?.preisstaffeln, gewaehlterTermin.datum_start);

    if (istZusatzteilnehmer) {
      if (gewaehlterTermin.zusatzteilnehmer_preis) return String(gewaehlterTermin.zusatzteilnehmer_preis);
      if (gewaehlterTermin.zusatzteilnehmer_rabatt_prozent) {
        const grundlage = basis ?? Number(ersteZeilePreis || 0);
        if (grundlage) return (grundlage * (1 - Number(gewaehlterTermin.zusatzteilnehmer_rabatt_prozent) / 100)).toFixed(2);
      }
    }
    return basis !== null ? String(basis) : "";
  }

  function zeileHinzufuegen() {
    const erste = teilnehmerZeilen[0];
    setTeilnehmerZeilen([
      ...teilnehmerZeilen,
      { key: rowIdCounter++, teilnehmerId: "", optionId: erste?.optionId || "", listenpreis: preisVorschlagFuer(erste?.optionId || "", true, erste?.listenpreis), rabatt: "0" },
    ]);
  }

  function zeileEntfernen(key: number) {
    setTeilnehmerZeilen(teilnehmerZeilen.filter((z) => z.key !== key));
  }

  function zeileAendern(key: number, feld: "teilnehmerId" | "optionId" | "listenpreis" | "rabatt", wert: string) {
    setTeilnehmerZeilen(
      teilnehmerZeilen.map((z) => {
        if (z.key !== key) return z;
        if (feld === "optionId") {
          const idx = teilnehmerZeilen.findIndex((zz) => zz.key === key);
          const vorschlag = preisVorschlagFuer(wert, idx > 0, teilnehmerZeilen[0]?.listenpreis);
          return { ...z, optionId: wert, listenpreis: vorschlag || z.listenpreis };
        }
        return { ...z, [feld]: wert };
      })
    );
  }

  return (
    <form action={createBuchung} style={{ maxWidth: 720 }}>
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

      {modus === "seminar" ? (
        <>
          <label style={labelStyle}>Seminartermin</label>
          <select
            style={inputStyle}
            name="seminartermin_id"
            required
            value={seminarterminId}
            onChange={(e) => {
              setSeminarterminId(e.target.value);
              setTeilnehmerZeilen([{ key: rowIdCounter++, teilnehmerId: "", optionId: "", listenpreis: "", rabatt: "0" }]);
            }}
          >
            <option value="">— bitte wählen —</option>
            {termine?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.seminartypen?.name} – {formatDatum(t.datum_start)}
              </option>
            ))}
          </select>
          {gewaehlterTermin && !optionenDesTermins.length && (
            <p style={{ color: "#a15c00", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Für diesen Termin sind noch keine Optionen/Preisstaffeln angelegt — Preis unten bitte manuell eintragen.
            </p>
          )}
          {(gewaehlterTermin?.zusatzteilnehmer_preis || gewaehlterTermin?.zusatzteilnehmer_rabatt_prozent) && (
            <p style={{ color: "#666", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Preis für weitere Teilnehmer dieser Firma:{" "}
              {gewaehlterTermin.zusatzteilnehmer_preis
                ? formatEUR(Number(gewaehlterTermin.zusatzteilnehmer_preis))
                : `${gewaehlterTermin.zusatzteilnehmer_rabatt_prozent}% Rabatt`} (wird unten vorausgefüllt)
            </p>
          )}

          <div style={card}>
            <strong>Teilnehmer</strong>
            <div style={{ ...teilnehmerRow, marginTop: "0.75rem", fontSize: "0.8rem", fontWeight: 600, color: "#666" }}>
              <span>Teilnehmer</span>
              <span>Option</span>
              <span>Listenpreis (€)</span>
              <span>Rabatt (€)</span>
              <span></span>
            </div>
            {teilnehmerZeilen.map((z, idx) => (
              <div key={z.key} style={teilnehmerRow}>
                <select
                  style={{ ...inputStyle, marginBottom: 0 }}
                  name={`teilnehmer_id_${idx}`}
                  required
                  value={z.teilnehmerId}
                  onChange={(e) => zeileAendern(z.key, "teilnehmerId", e.target.value)}
                >
                  <option value="">— wählen —</option>
                  {teilnehmer?.map((t) => (
                    <option key={t.id} value={t.id}>{t.vorname} {t.nachname} ({t.email})</option>
                  ))}
                </select>
                <select
                  style={{ ...inputStyle, marginBottom: 0 }}
                  name={`seminartermin_option_id_${idx}`}
                  value={z.optionId}
                  onChange={(e) => zeileAendern(z.key, "optionId", e.target.value)}
                >
                  <option value="">— ohne Option —</option>
                  {optionenDesTermins.map((o) => (
                    <option key={o.id} value={o.id}>{o.titel}</option>
                  ))}
                </select>
                <input
                  style={{ ...inputStyle, marginBottom: 0 }}
                  name={`listenpreis_${idx}`}
                  type="number"
                  step="0.01"
                  required
                  value={z.listenpreis}
                  onChange={(e) => zeileAendern(z.key, "listenpreis", e.target.value)}
                />
                <input
                  style={{ ...inputStyle, marginBottom: 0 }}
                  name={`rabatt_betrag_${idx}`}
                  type="number"
                  step="0.01"
                  value={z.rabatt}
                  onChange={(e) => zeileAendern(z.key, "rabatt", e.target.value)}
                />
                {teilnehmerZeilen.length > 1 ? (
                  <button type="button" onClick={() => zeileEntfernen(z.key)} style={{ padding: "0.5rem 0.7rem", cursor: "pointer" }}>
                    ✕
                  </button>
                ) : <span />}
              </div>
            ))}
            <button
              type="button"
              onClick={zeileHinzufuegen}
              style={{ marginTop: "0.5rem", background: "transparent", color: "#102A4C", border: "1px solid #102A4C", padding: "0.4rem 0.8rem", cursor: "pointer" }}
            >
              + weiteren Teilnehmer hinzufügen
            </button>
          </div>
        </>
      ) : (
        <>
          <label style={labelStyle}>Teilnehmer</label>
          <select
            style={inputStyle}
            name="teilnehmer_id"
            required
            value={einzelTeilnehmerId}
            onChange={(e) => setEinzelTeilnehmerId(e.target.value)}
          >
            <option value="">— wählen —</option>
            {teilnehmer?.map((t) => (
              <option key={t.id} value={t.id}>{t.vorname} {t.nachname} ({t.email})</option>
            ))}
          </select>

          <label style={labelStyle}>Beschreibung der Leistung</label>
          <input style={inputStyle} name="il_beschreibung" placeholder="z. B. Begleitung 3 Monate vor Ort + Erreichbarkeit" required />

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
              <input style={inputStyle} name="il_listenpreis" type="number" step="0.01" required />
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
