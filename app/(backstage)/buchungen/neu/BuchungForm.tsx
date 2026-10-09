"use client";

import { useMemo, useState } from "react";
import { createBuchung } from "@/lib/actions";
import SuchAuswahl, { type SuchOption } from "../../SuchAuswahl";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import { aktuellerPreisNetto, sortierteStaffeln, istPreisstaffelAktiv, letzterGueltigerTag, aktuellePreisstaffel, type Preisstaffel } from "@/lib/preisstaffeln";

type Teilnehmer = {
  id: string;
  vorname: string;
  rufname?: string | null;
  nachname: string;
  email: string;
  firma_freitext?: string | null;
  deaktiviert_am?: string | null;
  teilnehmer_organisationen?: { ist_hauptorganisation: boolean; organisation_id: string; organisationen?: { name: string } | null }[];
};
type Organisation = { id: string; name: string };
type Option = { id: string; titel: string; preisstaffeln?: (Preisstaffel & { name?: string | null })[] };
type Termin = {
  id: string;
  kennung?: string | null;
  seminartyp_id?: string | null;
  datum_start: string;
  seminartypen?: { name: string } | null;
  zusatzteilnehmer_preis?: number | null;
  zusatzteilnehmer_rabatt_prozent?: number | null;
  seminartermin_optionen?: Option[];
};

const teilnehmerRowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr auto", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.5rem" };

let rowIdCounter = 1;

function aktuellerPreis(preisstaffeln: Preisstaffel[] | undefined, datumStart: string): number | null {
  return aktuellerPreisNetto(preisstaffeln || [], datumStart);
}

export default function BuchungForm({
  teilnehmer,
  organisationen,
  termine,
  initialTeilnehmerId,
  initialSeminarterminId,
}: {
  teilnehmer: Teilnehmer[];
  organisationen: Organisation[];
  termine: Termin[];
  initialTeilnehmerId?: string;
  initialSeminarterminId?: string;
}) {
  const [modus, setModus] = useState<"seminar" | "individuell">("seminar");
  const [abrechnung, setAbrechnung] = useState<"rechnung" | "bezahlt" | "paket">("rechnung");
  const [seminarterminId, setSeminarterminId] = useState(initialSeminarterminId || "");
  const [teilnehmerZeilen, setTeilnehmerZeilen] = useState([
    { key: 0, teilnehmerId: initialTeilnehmerId || "", optionId: "", listenpreis: "", rabatt: "0", preisstufe: "" },
  ]);
  const [einzelTeilnehmerId, setEinzelTeilnehmerId] = useState(initialTeilnehmerId || "");
  const vorausgewaehlt = teilnehmer.find((t) => t.id === initialTeilnehmerId);

  // Rechnungsempfaenger: wird beim ersten Teilnehmer mit dessen Hauptfirma
  // vorbelegt, solange noch nichts gewaehlt ist.
  const hauptOrga = (tId: string) => {
    const t = teilnehmer.find((x) => x.id === tId);
    const z = t?.teilnehmer_organisationen || [];
    return (z.find((x) => x.ist_hauptorganisation) || z[0])?.organisation_id || "";
  };
  const [organisationId, setOrganisationId] = useState(initialTeilnehmerId ? hauptOrga(initialTeilnehmerId) : "");
  const personOptionen: SuchOption[] = useMemo(
    () =>
      teilnehmer
        .filter((t) => !t.deaktiviert_am)
        .map((t) => {
          const z = t.teilnehmer_organisationen || [];
          const firma = (z.find((x) => x.ist_hauptorganisation) || z[0])?.organisationen?.name || t.firma_freitext || "";
          return { value: t.id, label: `${t.vorname}${t.rufname ? ` „${t.rufname}“` : ""} ${t.nachname}`.trim(), sub: [t.email, firma].filter(Boolean).join(" · ") };
        }),
    [teilnehmer]
  );
  const orgaOptionen: SuchOption[] = useMemo(() => organisationen.map((o) => ({ value: o.id, label: o.name })), [organisationen]);
  const personGewaehlt = (tId: string, istErster: boolean) => {
    if (istErster && !organisationId && tId) setOrganisationId(hauptOrga(tId));
  };

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
      { key: rowIdCounter++, teilnehmerId: "", optionId: erste?.optionId || "", listenpreis: preisVorschlagFuer(erste?.optionId || "", true, erste?.listenpreis), rabatt: "0", preisstufe: "" },
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
          return { ...z, optionId: wert, listenpreis: vorschlag || z.listenpreis, preisstufe: "" };
        }
        // Preis von Hand geaendert -> gewaehlte Preisstufe gilt nicht mehr
        if (feld === "listenpreis") return { ...z, listenpreis: wert, preisstufe: "" };
        return { ...z, [feld]: wert };
      })
    );
  }

  function preisstufeWaehlen(key: number, preis: string, meta: string) {
    setTeilnehmerZeilen(teilnehmerZeilen.map((z) => (z.key === key ? { ...z, listenpreis: preis, preisstufe: meta } : z)));
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
      <div style={{ marginBottom: "1rem" }}>
        <SuchAuswahl
          name="organisation_id"
          optionen={orgaOptionen}
          value={organisationId}
          onChange={setOrganisationId}
          placeholder="Firma suchen …"
          leerText="— keine Organisation, direkt an Teilnehmer —"
        />
      </div>

      {modus === "seminar" ? (
        <>
          <input type="hidden" name="buchungsart" value={abrechnung} />
          <label className="au-label">Abrechnung</label>
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: abrechnung === "paket" ? "0.5rem" : "1rem", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
              <input type="radio" checked={abrechnung === "rechnung"} onChange={() => setAbrechnung("rechnung")} />
              Rechnung folgt (Zahlung offen)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
              <input type="radio" checked={abrechnung === "bezahlt"} onChange={() => setAbrechnung("bezahlt")} />
              Bereits bezahlt / anders abgerechnet
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 400 }}>
              <input type="radio" checked={abrechnung === "paket"} onChange={() => setAbrechnung("paket")} />
              Paket / ohne Kundeninfo (z. B. im Coaching-Paket enthalten)
            </label>
          </div>
          {abrechnung === "rechnung" && (
            <p className="au-banner au-card-tint" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Die Buchung wird als „Zahlung offen“ angelegt und der Rechnungsentwurf in FastBill gleich mit erstellt. Danach landest Du auf der Buchungsseite:
              Rechnung prüfen, „Freigeben &amp; Senden“. Geht die Zahlung in FastBill ein, wird die Buchung automatisch bestätigt (mit Zahlungsbestätigung).
            </p>
          )}
          {abrechnung === "bezahlt" && (
            <p className="au-banner au-card-tint" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Wie bisher: sofort bestätigt, keine Rechnung aus Backstage (z. B. schon in FastBill abgerechnet).
            </p>
          )}
          {abrechnung === "paket" && (
            <p className="au-banner au-card-tint" style={{ fontSize: "0.85rem", marginTop: 0 }}>
              Wird nur angelegt: keine Buchungs- oder Zahlungsmail an den Kunden, nie „unbezahlt“. Die Mails vor Seminarstart und nach Seminarende bekommt er wie alle.
              Der Preis unten (vorgeschlagen: offizieller Listenpreis) zählt für den Deckungsbeitrag des Termins, aber nicht im Gesamtumsatz der Übersicht – das Geld steckt in der Paket-/Coaching-Rechnung.
            </p>
          )}
          <label className="au-label">Seminartermin</label>
          <select
            className="au-input"
            name="seminartermin_id"
            required
            value={seminarterminId}
            onChange={(e) => {
              setSeminarterminId(e.target.value);
              setTeilnehmerZeilen([{ key: rowIdCounter++, teilnehmerId: "", optionId: "", listenpreis: "", rabatt: "0", preisstufe: "" }]);
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
                <SuchAuswahl
                  name={`teilnehmer_id_${idx}`}
                  optionen={personOptionen}
                  value={z.teilnehmerId}
                  onChange={(v) => {
                    zeileAendern(z.key, "teilnehmerId", v);
                    personGewaehlt(v, idx === 0);
                  }}
                  placeholder="Name, E-Mail oder Firma …"
                  required
                />
                <div>
                  <select
                    className="au-input" style={{ marginBottom: "0.35rem" }}
                    name={`seminartermin_option_id_${idx}`}
                    value={z.optionId}
                    onChange={(e) => zeileAendern(z.key, "optionId", e.target.value)}
                  >
                    <option value="">— ohne Option —</option>
                    {optionenDesTermins.map((o) => (
                      <option key={o.id} value={o.id}>{o.titel}</option>
                    ))}
                  </select>
                  <input type="hidden" name={`preisstufe_${idx}`} value={z.preisstufe} />
                  <PreisstufenWahl
                    termin={gewaehlterTermin}
                    alleTermine={termine}
                    option={optionenDesTermins.find((o) => o.id === z.optionId)}
                    gewaehlt={z.preisstufe}
                    onWahl={(preis, meta) => preisstufeWaehlen(z.key, preis, meta)}
                  />
                </div>
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
          <div style={{ marginBottom: "1rem" }}>
            <SuchAuswahl
              name="teilnehmer_id"
              optionen={personOptionen}
              value={einzelTeilnehmerId}
              onChange={(v) => {
                setEinzelTeilnehmerId(v);
                personGewaehlt(v, true);
              }}
              placeholder="Name, E-Mail oder Firma …"
              required
            />
          </div>

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

// Preisstufe bewusst waehlbar -- auch abgelaufene, und auch aus anderen
// Terminen derselben Kategorie mit gleicher Option (z. B. FOK126 hatte nur zwei
// Stufen, die lange Staffel mit 3.460 € stand bei FOK127; Markus 10/2026).
// Die Wahl wird als JSON an der Position gespeichert (metadata.preisstufe), die
// Rechnung schreibt daraus "Preisstufe 1 von 7 (Normalpreis …)".
type StufenEintrag = { wert: string; label: string; preis: number; meta: string };

function stufenFuer(t: Termin, option: Option, istEigener: boolean): StufenEintrag[] {
  const staffeln = option.preisstaffeln || [];
  if (!staffeln.length) return [];
  const sortiert = sortierteStaffeln(staffeln, t.datum_start);
  const aktuell = aktuellePreisstaffel(staffeln, t.datum_start);
  const preise = [...new Set(staffeln.map((s) => Number(s.preis)))].sort((a, b) => a - b);
  const normalpreis = preise[preise.length - 1];
  return sortiert.map((s, i) => {
    const preis = Number(s.preis);
    const bis = formatDatum(letzterGueltigerTag(s, t.datum_start));
    const zustand = s === aktuell ? "aktuell" : istPreisstaffelAktiv(s, t.datum_start) ? `bis ${bis}` : `abgelaufen ${bis}`;
    const name = s.name || `Stufe ${i + 1}`;
    return {
      wert: `${t.id}|${i}`,
      label: `${name} – ${formatEUR(preis)} · ${istEigener ? zustand : `aus ${t.kennung || formatDatum(t.datum_start)}`}`,
      preis,
      meta: JSON.stringify({ name, stufe: preise.indexOf(preis) + 1, stufen: preise.length, normalpreis, quelle: t.kennung || t.id }),
    };
  });
}

function PreisstufenWahl({
  termin,
  alleTermine,
  option,
  gewaehlt,
  onWahl,
}: {
  termin?: Termin;
  alleTermine: Termin[];
  option?: Option;
  gewaehlt: string;
  onWahl: (preis: string, meta: string) => void;
}) {
  if (!termin || !option) return null;
  const eigene = stufenFuer(termin, option, true);
  const andere = alleTermine
    .filter((t) => t.id !== termin.id && t.seminartyp_id && t.seminartyp_id === termin.seminartyp_id)
    .flatMap((t) => {
      const o = (t.seminartermin_optionen || []).find((x) => x.titel.trim().toLowerCase() === option.titel.trim().toLowerCase());
      return o ? [{ t, stufen: stufenFuer(t, o, false) }] : [];
    })
    .filter((g) => g.stufen.length);
  const alle = [...eigene, ...andere.flatMap((g) => g.stufen)];
  if (!alle.length) return null;
  const aktiv = alle.find((e) => e.meta === gewaehlt)?.wert || "";
  return (
    <select
      className="au-input"
      style={{ marginBottom: 0, fontSize: "0.8rem" }}
      value={aktiv}
      onChange={(e) => {
        const eintrag = alle.find((x) => x.wert === e.target.value);
        if (eintrag) onWahl(String(eintrag.preis), eintrag.meta);
      }}
      aria-label="Preisstufe"
    >
      <option value="">Preisstufe wählen (sonst Preis von Hand)</option>
      {eigene.length > 0 && (
        <optgroup label={`Dieser Termin${termin.kennung ? ` (${termin.kennung})` : ""}`}>
          {eigene.map((e) => <option key={e.wert} value={e.wert}>{e.label}</option>)}
        </optgroup>
      )}
      {andere.map((g) => (
        <optgroup key={g.t.id} label={`Staffel von ${g.t.kennung || formatDatum(g.t.datum_start)}`}>
          {g.stufen.map((e) => <option key={e.wert} value={e.wert}>{e.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
