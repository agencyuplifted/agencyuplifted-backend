"use client";

import { useMemo, useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";

type Feld = { key: string; beschreibung: string };
type Zuordnung = { ziel: string; eigenerText: string };

const BEISPIEL: Record<string, string> = {
  vorname: "Anna",
  nachname: "Beispiel",
  firma: "Beispiel Agentur GmbH",
  seminartitel: "Wertorientierte Preisfindung in Agenturen",
  seminardatum: "07.10.2026",
  datum_start: "Mittwoch, 7. Oktober 2026",
  zeit_start: "09:00",
  ort: "Weißes Ross, Illschwang",
  veranstaltungsort: "Illschwang",
  teilnehmerliste: "Anna Beispiel\nMax Muster",
  teilnehmerliste_link: "https://backstage.agencyuplifted.com/seminar/…/teilnehmer",
  unterlagen_link: "https://backstage.agencyuplifted.com/seminar/…/unterlagen",
  freigabe_link: "https://backstage.agencyuplifted.com/seminar/…/freigabe",
};

// Erkennt [Vorname] bzw. {Vorname} -- aber nicht die echten {{vorname}}-Felder.
const PLATZHALTER_REGEX = /\[(\S[^\[\]\n]{0,49})\]|(?<!\{)\{(\S[^{}\n]{0,49})\}(?!\})/g;

function normalisiere(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
}

// Grobe Vorschlaege fuer die Zuordnung -- Markus bestaetigt bzw. korrigiert per Dropdown.
function vorschlag(roh: string, felder: Feld[]): string {
  const n = normalisiere(roh);
  const direkt = felder.find((f) => normalisiere(f.key) === n);
  if (direkt) return direkt.key;
  if (/vorname|firstname/.test(n)) return "vorname";
  if (/nachname|lastname/.test(n)) return "nachname";
  if (/teilnehmerliste|werwardabei/.test(n)) return "teilnehmerliste_link";
  if (/unterlagen|download|material/.test(n)) return "unterlagen_link";
  if (/freigabe|linkedin/.test(n)) return "freigabe_link";
  if (/uhrzeit|zeit|beginn/.test(n)) return "zeit_start";
  if (/datum|termin|tag/.test(n)) return "datum_start";
  if (/ort|adresse|location|hotel/.test(n)) return "ort";
  if (/seminar|titel|kurs|workshop/.test(n)) return "seminartitel";
  if (/firma|agentur|unternehmen/.test(n)) return "firma";
  return "__text__";
}

export default function FunnelImport({
  felder,
  trigger,
  importAction,
}: {
  felder: Feld[];
  trigger: { key: string; label: string }[];
  importAction: (fd: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [roh, setRoh] = useState("");
  const [name, setName] = useState("");
  const [betreff, setBetreff] = useState("");
  const [triggerTyp, setTriggerTyp] = useState("vor_seminarstart");
  const [versatz, setVersatz] = useState("3");
  const [zuordnung, setZuordnung] = useState<Record<string, Zuordnung>>({});
  const [meldung, setMeldung] = useState<{ fehler: string | null; info?: string } | null>(null);
  const [laeuft, starte] = useTransition();

  // "Betreff: ..." in der ersten Zeile wird automatisch uebernommen
  const { text, betreffAusText } = useMemo(() => {
    const zeilen = roh.replace(/\r\n/g, "\n").split("\n");
    const b = zeilen[0]?.match(/^\s*(betreff|subject)\s*:\s*(.+)$/i);
    return b ? { text: zeilen.slice(1).join("\n").replace(/^\n+/, ""), betreffAusText: b[2].trim() } : { text: roh, betreffAusText: "" };
  }, [roh]);
  const betreffWert = betreff || betreffAusText;

  const gefunden = useMemo(() => {
    const menge = new Set<string>();
    for (const quelle of [text, betreffWert]) {
      for (const m of quelle.matchAll(PLATZHALTER_REGEX)) menge.add(m[0]);
    }
    return [...menge];
  }, [text, betreffWert]);

  const zuordnungFuer = (p: string): Zuordnung => zuordnung[p] || { ziel: vorschlag(p.slice(1, -1), felder), eigenerText: "" };

  const ersetze = (quelle: string) =>
    quelle.replace(PLATZHALTER_REGEX, (m) => {
      const z = zuordnungFuer(m);
      if (z.ziel === "__text__") return m;
      if (z.ziel === "__eigen__") return z.eigenerText;
      return `{{${z.ziel}}}`;
    });

  const inhaltFinal = ersetze(text).trim();
  const betreffFinal = ersetze(betreffWert).trim();
  const vorschau = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in BEISPIEL ? BEISPIEL[k] : m));
  const offeneKlammern = gefunden.filter((p) => zuordnungFuer(p).ziel === "__text__");

  function speichern() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("betreff", betreffFinal);
    fd.set("inhalt", inhaltFinal);
    fd.set("trigger_typ", triggerTyp);
    fd.set("versatz_tage", versatz);
    starte(async () => {
      const r = await importAction(fd);
      setMeldung(r.fehler ? r : { fehler: null, info: `„${name}“ wurde als INAKTIVE Funnel-Mail angelegt. Bitte unten prüfen und bewusst aktivieren.` });
      if (!r.fehler) {
        setRoh("");
        setName("");
        setBetreff("");
        setZuordnung({});
      }
    });
  }

  return (
    <div className="au-import">
      <label className="au-label">1. Text einfügen (z. B. aus ChatGPT). Steht in der ersten Zeile „Betreff: …“, wird er übernommen.</label>
      <textarea className="au-textarea" rows={8} value={roh} onChange={(e) => setRoh(e.target.value)} placeholder={"Betreff: In 10 Tagen geht's los, [Vorname]!\n\nHallo [Vorname],\n\nam [Datum] um [Uhrzeit] startet [Seminarname] in [Ort] …"} />

      {gefunden.length > 0 && (
        <>
          <label className="au-label">2. Erkannte Platzhalter zuordnen</label>
          <div className="au-import-zuordnung">
            {gefunden.map((p) => {
              const z = zuordnungFuer(p);
              return (
                <div key={p} className="au-import-zeile">
                  <code>{p}</code>
                  <span aria-hidden="true">→</span>
                  <select
                    className="au-select"
                    value={z.ziel}
                    onChange={(e) => setZuordnung({ ...zuordnung, [p]: { ...z, ziel: e.target.value } })}
                    aria-label={`Zuordnung für ${p}`}
                  >
                    {felder.map((f) => (
                      <option key={f.key} value={f.key}>{`{{${f.key}}}`} – {f.beschreibung}</option>
                    ))}
                    <option value="__eigen__">Durch festen Text ersetzen …</option>
                    <option value="__text__">So lassen (kein Platzhalter)</option>
                  </select>
                  {z.ziel === "__eigen__" && (
                    <input className="au-input" value={z.eigenerText} placeholder="fester Text" onChange={(e) => setZuordnung({ ...zuordnung, [p]: { ...z, eigenerText: e.target.value } })} />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <label className="au-label">3. Einstellungen</label>
      <div className="au-formgrid">
        <div><label className="au-label">Name (intern)</label><input className="au-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Infos 10 Tage vorher" /></div>
        <div>
          <label className="au-label">Auslöser</label>
          <select className="au-select" value={triggerTyp} onChange={(e) => setTriggerTyp(e.target.value)}>
            {trigger.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div><label className="au-label">Anzahl Tage (X)</label><input className="au-input" type="number" min={0} value={versatz} onChange={(e) => setVersatz(e.target.value)} /></div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="au-label">Betreff</label>
          <input className="au-input" value={betreffWert} onChange={(e) => setBetreff(e.target.value)} placeholder="Betreff der Mail" />
        </div>
      </div>

      {(inhaltFinal || betreffFinal) && (
        <>
          <label className="au-label">4. Vorschau mit Beispieldaten</label>
          <div className="au-import-vorschau">
            <div className="au-klein">Betreff: <strong>{vorschau(betreffFinal) || "—"}</strong></div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: "0.6rem" }}>{vorschau(inhaltFinal)}</div>
          </div>
          {offeneKlammern.length > 0 && (
            <p className="au-text-warning" style={{ fontSize: "0.82rem" }}>
              Noch nicht zugeordnet: {offeneKlammern.join(", ")} – bleibt als Text in der Mail stehen.
            </p>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.75rem" }}>
        <button type="button" className="au-btn au-btn-primary" disabled={laeuft || !name.trim() || !betreffFinal || !inhaltFinal} onClick={speichern}>
          {laeuft ? "Speichert …" : "Als inaktive Funnel-Mail anlegen"}
        </button>
        <span className="au-klein">Wird nie automatisch aktiv.</span>
      </div>
      {meldung && <p style={{ fontSize: "0.85rem", color: meldung.fehler ? "var(--color-danger)" : "var(--color-success)" }}>{meldung.fehler || meldung.info}</p>}
    </div>
  );
}
