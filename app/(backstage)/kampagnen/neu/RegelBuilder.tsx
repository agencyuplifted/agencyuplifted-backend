"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FELDER,
  LEERE_GRUPPE,
  standardBedingung,
  wirksameRegeln,
  type Bedingung,
  type RegelFeld,
  type RegelGruppe,
  type Regeln,
  type Verknuepfung,
} from "@/lib/kampagnen-regeln";

// Regel-Baukasten: Gruppen von Bedingungen, jeweils mit "allen" (und) oder
// "mindestens einer" (oder) verknuepft -- innerhalb der Gruppe und zwischen
// den Gruppen. Die Trefferzahl wird live gezaehlt; "Übernehmen" laedt die
// Seite mit den Regeln neu (Empfaengerliste, Inhalt-Formular).
export default function RegelBuilder({
  start,
  seminartypen,
  tags,
  termine,
  kampagnen,
  optionen: optionsTitel,
  zaehlen,
  angewendetAnzahl,
}: {
  start: Regeln;
  seminartypen: string[];
  tags: { id: string; label: string }[];
  termine: { id: string; label: string }[];
  kampagnen: { id: string; label: string }[];
  optionen: string[];
  zaehlen: (regelnJson: string) => Promise<{ fehler: string | null; anzahl?: number }>;
  angewendetAnzahl: number;
}) {
  const router = useRouter();
  const [regeln, setRegeln] = useState<Regeln>(start.gruppen.length ? start : { verknuepfung: "oder", gruppen: [LEERE_GRUPPE] });
  const [anzahl, setAnzahl] = useState<number | null>(angewendetAnzahl);
  const [zaehlt, setZaehlt] = useState(false);
  const json = JSON.stringify(wirksameRegeln(regeln));
  const startJson = useRef(JSON.stringify(wirksameRegeln(start)));
  const geaendert = json !== startJson.current;

  // Live zaehlen, leicht verzoegert, damit nicht jeder Klick eine Abfrage ausloest
  useEffect(() => {
    if (!geaendert) {
      setAnzahl(angewendetAnzahl);
      return;
    }
    setZaehlt(true);
    const t = setTimeout(async () => {
      const r = await zaehlen(json);
      setAnzahl(r.fehler ? null : r.anzahl ?? null);
      setZaehlt(false);
    }, 400);
    return () => clearTimeout(t);
  }, [json, geaendert, zaehlen, angewendetAnzahl]);

  const optionen = (feld: RegelFeld) => {
    const def = FELDER[feld];
    if (def.quelle === "seminartypen") return seminartypen.map((s) => ({ key: s, label: s }));
    if (def.quelle === "tags") return tags.map((t) => ({ key: t.id, label: `#${t.label}` }));
    if (def.quelle === "termine") return termine.map((t) => ({ key: t.id, label: t.label }));
    if (def.quelle === "kampagnen") return kampagnen.map((k) => ({ key: k.id, label: k.label }));
    if (def.quelle === "optionen") return optionsTitel.map((o) => ({ key: o, label: o }));
    return def.werte || [];
  };

  const setzeGruppe = (gi: number, g: RegelGruppe) => setRegeln({ ...regeln, gruppen: regeln.gruppen.map((x, n) => (n === gi ? g : x)) });
  const setzeBedingung = (gi: number, bi: number, b: Bedingung) =>
    setzeGruppe(gi, { ...regeln.gruppen[gi], bedingungen: regeln.gruppen[gi].bedingungen.map((x, n) => (n === bi ? b : x)) });
  const entferneBedingung = (gi: number, bi: number) =>
    setzeGruppe(gi, { ...regeln.gruppen[gi], bedingungen: regeln.gruppen[gi].bedingungen.filter((_, n) => n !== bi) });
  const entferneGruppe = (gi: number) => {
    const rest = regeln.gruppen.filter((_, n) => n !== gi);
    setRegeln({ ...regeln, gruppen: rest.length ? rest : [LEERE_GRUPPE] });
  };

  const feldAuswahl = (wert: string, onChange: (f: RegelFeld) => void, platzhalter?: string) => (
    <select className={`au-select${platzhalter ? " au-regeln-neu" : ""}`} value={wert} onChange={(e) => e.target.value && onChange(e.target.value as RegelFeld)} aria-label={platzhalter || "Merkmal"}>
      {platzhalter && <option value="">{platzhalter}</option>}
      {(Object.keys(FELDER) as RegelFeld[]).map((f) => (
        <option key={f} value={f} disabled={(f === "tag" && !tags.length) || (f.startsWith("kampagne_") && !kampagnen.length)}>
          {FELDER[f].label}
          {f === "tag" && !tags.length ? " (noch keine Tags)" : ""}
          {f.startsWith("kampagne_") && !kampagnen.length ? " (noch keine versendet)" : ""}
        </option>
      ))}
    </select>
  );

  const verknAuswahl = (wert: Verknuepfung, onChange: (v: Verknuepfung) => void) => (
    <select className="au-select au-regeln-verkn" value={wert} onChange={(e) => onChange(e.target.value as Verknuepfung)}>
      <option value="und">allen</option>
      <option value="oder">mindestens einer</option>
    </select>
  );

  const mehrereGruppen = regeln.gruppen.length > 1;

  return (
    <div className="au-regeln">
      {mehrereGruppen && (
        <div className="au-regeln-kopf">
          Empfänger:innen, die {verknAuswahl(regeln.verknuepfung, (v) => setRegeln({ ...regeln, verknuepfung: v }))} der folgenden Gruppen entsprechen
        </div>
      )}

      {regeln.gruppen.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="au-regeln-gruppenverbinder">{regeln.verknuepfung === "oder" ? "ODER" : "UND"}</div>}
          <div className={mehrereGruppen ? "au-regelgruppe" : undefined}>
            <div className="au-regeln-kopf">
              {mehrereGruppen ? <strong>Gruppe {gi + 1}:</strong> : "Empfänger:innen, die"}
              {verknAuswahl(g.verknuepfung, (v) => setzeGruppe(gi, { ...g, verknuepfung: v }))}
              {g.bedingungen.length === 1 ? "folgenden Bedingung entsprechen" : "folgenden Bedingungen entsprechen"}
              {mehrereGruppen && (
                <button type="button" className="au-regel-weg" onClick={() => entferneGruppe(gi)} title="Gruppe entfernen" aria-label="Gruppe entfernen">×</button>
              )}
            </div>

            {g.bedingungen.length === 0 && (
              <p className="au-klein" style={{ margin: "0.25rem 0" }}>
                {mehrereGruppen ? "Leere Gruppe – wird ignoriert." : "Keine Bedingung = alle Personen mit Marketing-Einwilligung."}
              </p>
            )}

            <ol className="au-regeln-liste">
              {g.bedingungen.map((b, bi) => {
                const def = FELDER[b.feld];
                return (
                  <li key={bi} className="au-regel">
                    {bi > 0 && <span className="au-regel-verbinder">{g.verknuepfung === "und" ? "und" : "oder"}</span>}
                    <div className="au-regel-zeile">
                      {feldAuswahl(b.feld, (f) => setzeBedingung(gi, bi, standardBedingung(f)))}
                      {def.operatoren.length > 1 ? (
                        <select
                          className="au-select"
                          value={b.operator}
                          onChange={(e) => setzeBedingung(gi, bi, { ...b, operator: e.target.value as Bedingung["operator"] })}
                          aria-label="Bedingung"
                        >
                          {def.operatoren.map((o) => (
                            <option key={o.key} value={o.key}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="au-regel-op">{def.operatoren[0].label}</span>
                      )}
                      <button type="button" className="au-regel-weg" onClick={() => entferneBedingung(gi, bi)} aria-label="Bedingung entfernen" title="Bedingung entfernen">×</button>
                    </div>
                    {def.art === "zahl" ? (
                      <input
                        className="au-input au-regel-zahl"
                        type="number"
                        min={0}
                        max={b.feld === "letztes_seminar_monate" ? 240 : 50}
                        value={b.werte[0] || ""}
                        onChange={(e) => setzeBedingung(gi, bi, { ...b, werte: [e.target.value] })}
                        aria-label="Anzahl"
                      />
                    ) : optionen(b.feld).length > 14 ? (
                      <MehrfachListe optionen={optionen(b.feld)} werte={b.werte} onChange={(werte) => setzeBedingung(gi, bi, { ...b, werte })} />
                    ) : (
                      <div className="au-chips">
                        {optionen(b.feld).map((o) => {
                          const an = b.werte.includes(o.key);
                          const einzeln = def.art === "ja_nein";
                          return (
                            <button
                              key={o.key}
                              type="button"
                              className={`au-chip${an ? " aktiv" : ""}`}
                              aria-pressed={an}
                              onClick={() =>
                                setzeBedingung(gi, bi, { ...b, werte: einzeln ? [o.key] : an ? b.werte.filter((w) => w !== o.key) : [...b.werte, o.key] })
                              }
                            >
                              {o.label}
                            </button>
                          );
                        })}
                        {!b.werte.length && <span className="au-klein">← Werte wählen (mehrere möglich)</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            {feldAuswahl("", (f) => setzeGruppe(gi, { ...g, bedingungen: [...g.bedingungen, standardBedingung(f)] }), "+ Bedingung hinzufügen …")}
          </div>
        </div>
      ))}

      <div className="au-regeln-fuss">
        <button
          type="button"
          className="au-link"
          onClick={() => setRegeln({ ...regeln, gruppen: [...regeln.gruppen, LEERE_GRUPPE] })}
          title="Für Kombinationen wie (Preisfindung und #X) oder (Fokussierung ohne #Y)"
        >
          + Gruppe hinzufügen
        </button>
        <span className="au-regeln-treffer">{zaehlt ? "zählt …" : anzahl === null ? "—" : <><strong>{anzahl}</strong> Treffer</>}</span>
        <button
          type="button"
          className={`au-btn au-btn-sm ${geaendert ? "au-btn-primary" : "au-btn-secondary"}`}
          onClick={() => router.push(`/kampagnen/neu?regeln=${encodeURIComponent(json)}`, { scroll: false })}
          disabled={!geaendert}
        >
          {geaendert ? "Übernehmen" : "Übernommen"}
        </button>
      </div>
    </div>
  );
}

// Lange Listen (Termine, Kampagnen): Suchfeld + gewaehlte oben als Chips
function MehrfachListe({ optionen, werte, onChange }: { optionen: { key: string; label: string }[]; werte: string[]; onChange: (w: string[]) => void }) {
  const [suche, setSuche] = useState("");
  const gewaehlt = optionen.filter((o) => werte.includes(o.key));
  const treffer = optionen.filter((o) => !werte.includes(o.key) && o.label.toLowerCase().includes(suche.toLowerCase())).slice(0, 12);
  return (
    <div className="au-regel-mehrfach">
      <div className="au-chips">
        {gewaehlt.map((o) => (
          <button key={o.key} type="button" className="au-chip aktiv" onClick={() => onChange(werte.filter((w) => w !== o.key))} title="Entfernen">
            {o.label} ×
          </button>
        ))}
      </div>
      <input className="au-input" placeholder="Suchen und hinzufügen …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      {suche && (
        <div className="au-chips">
          {treffer.map((o) => (
            <button key={o.key} type="button" className="au-chip" onClick={() => { onChange([...werte, o.key]); setSuche(""); }}>
              + {o.label}
            </button>
          ))}
          {!treffer.length && <span className="au-klein">Nichts gefunden.</span>}
        </div>
      )}
    </div>
  );
}
