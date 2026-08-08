"use client";

import { useState } from "react";
import { createBuchung } from "@/lib/actions";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";

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

const teilnehmerRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr auto", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.5rem" };

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
  initialTeilnehmerId,
}: {
  teilnehmer: Teilnehmer[];
  organisationen: Organisation[];
  termine: Termin[];
  initialTeilnehmerId?: string;
}) {
  const [modus, setModus] = useState<"seminar" | "individuell">("seminar");
  const [seminarterminId, setSeminarterminId] = useState("");
  const [teilnehmerZeilen, setTeilnehmerZeilen] = useState([
    { key: 0, teilnehmerId: initialTeilnehmerId || "", optionId: "", listenpreis: "", rabatt: "0" },
  ]);
  const [einzelTeilnehmerId, setEinzelTeilnehmerId] = useState(initialTeilnehmerId || "");
  const vorausgewaehlt = teilnehmer.find((t) => t.id === initialTeilnehmerId);

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

      <p className="au-banner" style={{ background: "#f7f7f7", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
        Hinweis: Alle Preise werden netto (zzgl. gesetzlicher USt.) erfasst.
      </p>

      {vorausgewaehlt && (
        <p className="au-banner au-card-tint" style={{ fontSize: "0.85rem" }}>
          Vorausgewählt: {vorausgewaehlt.vorname} {vorausgewaehlt.nachname} ({vorausgewaehlt.email})
        </p>
      )}

      <label className="au-label">Art der Buchung</label>
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

      <label className="au-label">Rechnungsempfänger — Organisation (leer lassen, wenn Selbständige/r ohne Firma)</label>
      <select className="au-input" name="organisation_id">
        <option value="">— keine Organisation, direkt an Teilnehmer —</option>
        {organisationen?.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>

      {modus === "seminar" ? (
        <>
          <label className="au-label">Seminartermin</label>
          <select
            className="au-input"
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
            <p style={{ color: "var(--color-warning)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Für diesen Termin sind noch keine Optionen/Preisstaffeln angelegt — Preis unten bitte manuell eintragen.
            </p>
          )}
          {(gewaehlterTermin?.zusatzteilnehmer_preis || gewaehlterTermin?.zusatzteilnehmer_rabatt_prozent) && (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "-0.5rem" }}>
              Preis für weitere Teilnehmer dieser Firma:{" "}
              {gewaehlterTermin.zusatzteilnehmer_preis
                ? formatEUR(Number(gewaehlterTermin.zusatzteilnehmer_preis))
                : `${gewaehlterTermin.zusatzteilnehmer_rabatt_prozent}% Rabatt`} (wird unten vorausgefüllt)
            </p>
          )}

          <div className="au-card">
            <strong>Teilnehmer</strong>
            <div style={{ ...teilnehmerRowStyle, marginTop: "0.75rem", fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>
              <span>Teilnehmer</span>
              <span>Option</span>
              <span>Listenpreis (€, netto)</span>
              <span>Rabatt (€)</span>
              <span></span>
            </div>
            {teilnehmerZeilen.map((z, idx) => (
              <div key={z.key} style={teilnehmerRowStyle}>
                <select
                  className="au-input" style={{ marginBottom: 0 }}
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
                  className="au-input" style={{ marginBottom: 0 }}
                  name={`seminartermin_option_id_${idx}`}
                  value={z.optionId}
                  onChange={(e) => zeileAendern(z.key, "optionId", e.target.value)}
                >
                  <option value="">— ohne Option —</option>
                  {optionenDesTermins.map((o) => (
                    <option key={o.id} value={o.id}>{o.titel}</option>
                  ))}
                </select>
                <div>
                  <input
                    className="au-input" style={{ marginBottom: "0.15rem" }}
                    name={`listenpreis_${idx}`}
                    type="number"
                    step="0.01"
                    required
                    value={z.listenpreis}
                    onChange={(e) => zeileAendern(z.key, "listenpreis", e.target.value)}
                  />
                  {!!Number(z.listenpreis) && (
                    <span style={{ fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
                      brutto: {formatEURBrutto(Number(z.listenpreis))}
                    </span>
                  )}
                </div>
                <input
                  className="au-input" style={{ marginBottom: 0 }}
                  name={`rabatt_betrag_${idx}`}
                  type="number"
                  step="0.01"
                  value={z.rabatt}
                  onChange={(e) => zeileAendern(z.key, "rabatt", e.target.value)}
                />
                {teilnehmerZeilen.length > 1 ? (
                  <button type="button" onClick={() => zeileEntfernen(z.key)} className="au-btn au-btn-danger au-btn-sm">
                    ✕
                  </button>
                ) : <span />}
              </div>
            ))}
            <button
              type="button"
              onClick={zeileHinzufuegen}
              className="au-btn au-btn-secondary" style={{ marginTop: "0.5rem" }}
            >
              + weiteren Teilnehmer hinzufügen
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="au-label">Teilnehmer</label>
          <select
            className="au-input"
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

          <label className="au-label">Beschreibung der Leistung</label>
          <input className="au-input" name="il_beschreibung" placeholder="z. B. Begleitung 3 Monate vor Ort + Erreichbarkeit" required />

          <div className="au-row-2">
            <div>
              <label className="au-label">Start (optional)</label>
              <input className="au-input" name="il_startdatum" type="date" />
            </div>
            <div>
              <label className="au-label">Ende (optional)</label>
              <input className="au-input" name="il_enddatum" type="date" />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Listenpreis (€, netto)</label>
              <input className="au-input" name="il_listenpreis" type="number" step="0.01" required />
            </div>
            <div>
              <label className="au-label">Rabatt (€, optional)</label>
              <input className="au-input" name="il_rabatt_betrag" type="number" step="0.01" defaultValue={0} />
            </div>
          </div>
        </>
      )}

      <button type="submit" className="au-btn au-btn-primary">
        Buchung anlegen
      </button>
    </form>
  );
}
