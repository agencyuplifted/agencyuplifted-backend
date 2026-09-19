"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pruefeKandidat, legeKandidatAn, pruefeVerschiebung, verschiebeKandidat } from "@/lib/terminplaner-actions";
import type { Bewertung } from "@/lib/terminplaner";
import BewertungAnzeige from "./BewertungAnzeige";
import KategorieWahl from "./KategorieWahl";

// Jahreskalender des Terminplaners -- gleiches Raster wie der Kalender auf
// /termine (au-planer-*), zusaetzlich mit den Planungsdaten im Hintergrund
// (Bayern-Ferien, Feiertage, Konferenzen, Blocker) und den Kandidaten bzw.
// besten Vorschlaegen als eigene Balken-Arten.
// Interaktiv: Klick auf einen Tag/Vorschlag bewertet diesen Start und bietet
// Merken/Anfragen an; Kandidaten lassen sich per Drag & Drop verschieben
// (erst Vorschau, dann ausdruecklich speichern). Echte Seminartermine sind
// bewusst nicht verschiebbar -- daran haengen Buchungen, Website und Hotel.

const MONATSKURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const iso = (j: number, m: number, t: number) => `${j}-${String(m + 1).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const tageZwischen = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const lesbar = (d: string) => `${WT[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;

export type KalenderBalken = {
  key: string;
  von: string;
  bis: string;
  art: "termin" | "pruefung" | "gemerkt" | "vorschlag";
  label: string;
  titel: string;
  farbe?: string | null;
  href?: string;
  /** erster Seminartag (von kann die Anreise sein) */
  start?: string;
  kandidatId?: string;
  formatId?: string;
  kategorieId?: string | null;
};

type Auswahl =
  | { modus: "neu"; start: string; formatId: string }
  | { modus: "verschieben"; start: string; kandidatId: string; label: string; kategorieId?: string | null };

type TagInfo = { klassen: Set<string>; hinweise: string[] };

export default function PlanerKalender({
  jahr,
  heute,
  balken,
  ferien,
  konferenzen,
  blocker,
  formate,
  orte,
  typen,
  standardFormatId,
  standardOrtId,
}: {
  jahr: number;
  heute: string;
  balken: KalenderBalken[];
  ferien: { land: string; region: string | null; typ: string; bezeichnung: string; von: string; bis: string }[];
  konferenzen: { name: string; von: string; bis: string; gewicht: number }[];
  blocker: { bezeichnung: string; monat: number; tag: number; puffer_vorher: number; puffer_nachher: number; hart: boolean }[];
  formate: { id: string; name: string; mitHotel: boolean }[];
  orte: { id: string; name: string }[];
  typen: { id: string; name: string; farbe?: string | null }[];
  standardFormatId: string;
  standardOrtId: string;
}) {
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [ziel, setZiel] = useState<string | null>(null);
  const zug = useRef<{ kandidatId: string; label: string; kategorieId?: string | null; versatz: number; startVersatz: number } | null>(null);

  // Hintergrund pro Tag vorberechnen
  const tage = new Map<string, TagInfo>();
  const markiere = (von: string, bis: string, klasse: string, hinweis: string) => {
    for (let d = von; d <= bis; d = plus(d, 1)) {
      if (!d.startsWith(String(jahr))) continue;
      const t = tage.get(d) || { klassen: new Set<string>(), hinweise: [] };
      t.klassen.add(klasse);
      if (!t.hinweise.includes(hinweis)) t.hinweise.push(hinweis);
      tage.set(d, t);
    }
  };
  for (const f of ferien) {
    if (f.typ === "feiertag") {
      if (f.land === "DE" && (!f.region || f.region === "BY")) markiere(f.von, f.bis, "feiertag", f.bezeichnung);
    } else if (f.land === "DE" && f.region === "BY") {
      markiere(f.von, f.bis, "ferien", `Bayern: ${f.bezeichnung}`);
    }
  }
  for (const k of konferenzen) markiere(k.von, k.bis, k.gewicht >= 4 ? "konferenz-hart" : "konferenz", `${k.name} (Gewicht ${k.gewicht})`);
  for (const b of blocker) {
    const tag = iso(jahr, b.monat - 1, b.tag);
    markiere(plus(tag, -b.puffer_vorher), plus(tag, b.puffer_nachher), b.hart ? "blocker" : "konferenz", b.bezeichnung);
  }

  // Tag aus der Mausposition in einer Monatszeile (Spalte 1 = Monatsname, dann 31 Tage)
  const tagAusPosition = (e: React.MouseEvent | React.DragEvent, zeile: HTMLElement, monatIndex: number) => {
    const r = zeile.getBoundingClientRect();
    const spalte = (r.width - 64) / 31;
    const tag = Math.floor((e.clientX - r.left - 64) / spalte) + 1;
    const anzahlTage = new Date(jahr, monatIndex + 1, 0).getDate();
    if (tag < 1 || tag > anzahlTage) return null;
    return iso(jahr, monatIndex, tag);
  };

  return (
    <div>
      <div className="au-planer au-tp-kalender" role="table" aria-label={`Terminplanung ${jahr}`}>
        <div className="au-planer-zeile au-planer-kopfzeile" role="row">
          <span className="au-planer-monat" />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="au-planer-tagnr" style={{ gridColumn: i + 2 }}>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</span>
          ))}
        </div>
        {Array.from({ length: 12 }, (_, monatIndex) => {
          const anzahlTage = new Date(jahr, monatIndex + 1, 0).getDate();
          const monatStart = iso(jahr, monatIndex, 1);
          const monatEnde = iso(jahr, monatIndex, anzahlTage);
          const rang = { termin: 0, pruefung: 1, gemerkt: 2, vorschlag: 3 };
          const imMonat = balken
            .filter((b) => b.von <= monatEnde && b.bis >= monatStart)
            .sort((a, b) => rang[a.art] - rang[b.art] || a.von.localeCompare(b.von));
          const spurEnde: number[] = [];
          const gelegt = imMonat.map((b) => {
            const von = b.von < monatStart ? 1 : Number(b.von.slice(8, 10));
            const bis = b.bis > monatEnde ? anzahlTage : Number(b.bis.slice(8, 10));
            let spur = spurEnde.findIndex((e) => e < von);
            if (spur === -1) {
              spur = spurEnde.length;
              spurEnde.push(bis);
            } else spurEnde[spur] = bis;
            return { b, von, bis, spur };
          });
          const spuren = Math.max(1, spurEnde.length);
          return (
            <div
              key={monatStart}
              className={`au-planer-zeile au-tp-zeile-klickbar${heute.slice(0, 7) === monatStart.slice(0, 7) ? " aktuell" : ""}`}
              role="row"
              style={{ gridTemplateRows: `repeat(${spuren}, 22px)` }}
              onClick={(e) => {
                const d = tagAusPosition(e, e.currentTarget, monatIndex);
                if (d) setAuswahl({ modus: "neu", start: d, formatId: auswahl?.modus === "neu" ? auswahl.formatId : standardFormatId });
              }}
              onDragOver={(e) => {
                if (!zug.current) return;
                e.preventDefault();
                const d = tagAusPosition(e, e.currentTarget, monatIndex);
                setZiel(d ? plus(d, -zug.current.versatz) : null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const z = zug.current;
                const d = tagAusPosition(e, e.currentTarget, monatIndex);
                zug.current = null;
                setZiel(null);
                if (!z || !d) return;
                // Balken-Anfang (ggf. Anreise) folgt der Maus, der Seminarstart liegt startVersatz dahinter
                setAuswahl({ modus: "verschieben", kandidatId: z.kandidatId, label: z.label, kategorieId: z.kategorieId, start: plus(d, z.startVersatz - z.versatz) });
              }}
            >
              <span className="au-planer-monat" role="rowheader" style={{ gridRow: `1 / span ${spuren}` }}>
                {MONATSKURZ[monatIndex]} <span>{String(jahr).slice(2)}</span>
              </span>
              {Array.from({ length: 31 }, (_, i) => {
                const tag = i + 1;
                if (tag > anzahlTage) return <span key={i} className="au-planer-tag leer" style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }} />;
                const d = iso(jahr, monatIndex, tag);
                const wt = new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay();
                const info = tage.get(d);
                const gewaehlt = auswahl && d === auswahl.start;
                return (
                  <span
                    key={i}
                    className={`au-planer-tag${wt === 0 || wt === 6 ? " wochenende" : ""}${d === heute ? " heute" : ""}${info ? ` ${[...info.klassen].join(" ")}` : ""}${gewaehlt ? " gewaehlt" : ""}${ziel === d ? " ziel" : ""}`}
                    style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }}
                    title={`${lesbar(d)}${info ? `: ${info.hinweise.join(" · ")}` : ""} – klicken zum Prüfen`}
                  />
                );
              })}
              {gelegt.map(({ b, von, bis, spur }) => {
                // Kandidaten in der Farbe ihrer Kategorie (ueber --kat), feste Termine vollflaechig
                const stil = {
                  gridColumn: `${von + 1} / ${bis + 2}`,
                  gridRow: spur + 1,
                  ...(b.art === "termin" ? { background: b.farbe || "var(--color-accent)" } : b.farbe ? ({ "--kat": b.farbe } as React.CSSProperties) : {}),
                };
                const klasse = `au-planer-balken au-tp-balken-${b.art}${b.kandidatId ? " ziehbar" : ""}`;
                if (b.art === "termin") {
                  return (
                    <a key={b.key} href={b.href} className={klasse} style={stil} title={`${b.titel}\n(fester Termin – Änderungen in der Terminmaske)`} onClick={(e) => e.stopPropagation()}>
                      {b.label}
                    </a>
                  );
                }
                return (
                  <span
                    key={b.key}
                    className={klasse}
                    style={stil}
                    title={b.kandidatId ? `${b.titel}\nZiehen zum Verschieben · Klick zum Prüfen` : `${b.titel}\nKlick zum Prüfen & Merken`}
                    draggable={!!b.kandidatId}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (b.kandidatId && b.start) setAuswahl({ modus: "verschieben", kandidatId: b.kandidatId, label: b.label, kategorieId: b.kategorieId, start: b.start });
                      else if (b.start) setAuswahl({ modus: "neu", start: b.start, formatId: b.formatId || standardFormatId });
                    }}
                    onDragStart={(e) => {
                      if (!b.kandidatId || !b.start) return;
                      const zeile = (e.currentTarget.parentElement as HTMLElement);
                      const gegriffen = tagAusPosition(e, zeile, monatIndex) || b.von;
                      zug.current = {
                        kandidatId: b.kandidatId,
                        label: b.label,
                        kategorieId: b.kategorieId,
                        versatz: Math.max(0, tageZwischen(b.von, gegriffen)),
                        startVersatz: tageZwischen(b.von, b.start),
                      };
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", b.kandidatId);
                    }}
                    onDragEnd={() => {
                      zug.current = null;
                      setZiel(null);
                    }}
                  >
                    {b.label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      {auswahl && (
        <AuswahlKarte
          key={JSON.stringify(auswahl)}
          auswahl={auswahl}
          formate={formate}
          orte={orte}
          typen={typen}
          standardOrtId={standardOrtId}
          onFormat={(formatId) => auswahl.modus === "neu" && setAuswahl({ ...auswahl, formatId })}
          onSchliessen={() => setAuswahl(null)}
        />
      )}
    </div>
  );
}

function AuswahlKarte({
  auswahl,
  formate,
  orte,
  typen,
  standardOrtId,
  onFormat,
  onSchliessen,
}: {
  auswahl: Auswahl;
  formate: { id: string; name: string; mitHotel: boolean }[];
  orte: { id: string; name: string }[];
  typen: { id: string; name: string; farbe?: string | null }[];
  standardOrtId: string;
  onFormat: (id: string) => void;
  onSchliessen: () => void;
}) {
  const router = useRouter();
  const [bewertung, setBewertung] = useState<Bewertung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kollisionOk, setKollisionOk] = useState(false);
  const [laeuft, starte] = useTransition();
  const [ortId, setOrtId] = useState(standardOrtId);
  const [typId, setTypId] = useState("");
  const format = auswahl.modus === "neu" ? formate.find((f) => f.id === auswahl.formatId) : null;

  useEffect(() => {
    let aktuell = true;
    (async () => {
      const r = auswahl.modus === "neu" ? await pruefeKandidat(auswahl.start, auswahl.formatId) : await pruefeVerschiebung(auswahl.kandidatId, auswahl.start);
      if (!aktuell) return;
      if (r.fehler) setFehler(r.fehler);
      else setBewertung(r.bewertung || null);
    })();
    return () => {
      aktuell = false;
    };
  }, [auswahl]);

  const speichern = (status?: "vorgeschlagen" | "in_pruefung") =>
    starte(async () => {
      setFehler(null);
      const fd = new FormData();
      fd.set("datum_start", auswahl.start);
      if (kollisionOk) fd.set("kollision_bestaetigt", "on");
      let r;
      if (auswahl.modus === "neu") {
        fd.set("format_id", auswahl.formatId);
        fd.set("herkunft", "manuell");
        fd.set("status", status || "vorgeschlagen");
        if (ortId) fd.set("veranstaltungsort_id", ortId);
        if (typId) fd.set("seminartyp_id", typId);
        r = await legeKandidatAn(fd);
      } else {
        fd.set("id", auswahl.kandidatId);
        r = await verschiebeKandidat(fd);
      }
      if (r.fehler) setFehler(r.fehler);
      else {
        onSchliessen();
        router.refresh();
      }
    });

  const gesperrt = !!bewertung?.kollision && !kollisionOk;

  return (
    <div className="au-tp-auswahl" role="dialog" aria-label="Termin prüfen">
      <div className="au-tp-auswahl-kopf">
        <strong>
          {auswahl.modus === "verschieben" ? `Kandidat „${auswahl.label}“ verschieben auf ` : "Start am "}
          {bewertung ? `${lesbar(bewertung.anreise_datum || bewertung.datum_start)}${bewertung.datum_ende !== (bewertung.anreise_datum || bewertung.datum_start) ? ` – ${lesbar(bewertung.datum_ende)}` : ""}` : lesbar(auswahl.start)}
        </strong>
        <button type="button" className="au-regel-weg" onClick={onSchliessen} aria-label="Schließen">×</button>
      </div>

      {auswahl.modus === "neu" && (
        <div className="au-tp-form" style={{ marginTop: 0 }}>
          <select className="au-select" value={auswahl.formatId} onChange={(e) => onFormat(e.target.value)} aria-label="Format">
            {formate.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select className="au-select" value={ortId} onChange={(e) => setOrtId(e.target.value)} aria-label="Ort">
            <option value="">Ort offen</option>
            {orte.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <select className="au-select" value={typId} onChange={(e) => setTypId(e.target.value)} aria-label="Kategorie">
            <option value="">Kategorie ?</option>
            {typen.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}
      {auswahl.modus === "verschieben" && (
        <div className="au-tp-form" style={{ marginTop: 0 }}>
          <span className="au-klein">Kategorie:</span>
          <KategorieWahl kandidatId={auswahl.kandidatId} wert={auswahl.kategorieId || null} typen={typen} />
        </div>
      )}

      {bewertung ? <BewertungAnzeige b={bewertung} /> : !fehler && <p className="au-klein">bewertet …</p>}
      {bewertung && !bewertung.kollision && bewertung.gesperrt && (
        <p className="au-klein" style={{ margin: "0.4rem 0 0" }}>Hinweis: Den würde der Planer nicht vorschlagen ({bewertung.gesperrt}). Speichern geht trotzdem.</p>
      )}
      {bewertung?.kollision && (
        <label className="au-tp-kollision" style={{ marginTop: "0.5rem" }}>
          <input type="checkbox" checked={kollisionOk} onChange={(e) => setKollisionOk(e.target.checked)} />
          <span><strong>Überschneidung bewusst in Kauf nehmen</strong> – {bewertung.kollision}</span>
        </label>
      )}
      {fehler && <p className="au-klein" style={{ color: "var(--color-danger)" }}>{fehler}</p>}

      <div className="au-tp-manuell-fuss">
        {auswahl.modus === "neu" ? (
          <>
            <button type="button" className="au-btn au-btn-secondary au-btn-sm" disabled={laeuft || !bewertung || gesperrt} onClick={() => speichern("vorgeschlagen")}>Merken</button>
            <button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={laeuft || !bewertung || gesperrt} onClick={() => speichern("in_pruefung")}>
              {format?.mitHotel === false ? "Location anfragen" : "Hotel anfragen"}
            </button>
          </>
        ) : (
          <button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={laeuft || !bewertung || gesperrt} onClick={() => speichern()}>Hierhin verschieben</button>
        )}
        <button type="button" className="au-link" onClick={onSchliessen}>Abbrechen</button>
      </div>
    </div>
  );
}

export function KalenderLegende() {
  return (
    <span className="au-planer-legende au-tp-legende">
      <span><i className="au-tp-leg termin" />Seminar</span>
      <span><i className="au-tp-leg pruefung" />vorgeplant: in Prüfung</span>
      <span><i className="au-tp-leg gemerkt" />vorgeplant: gemerkt</span>
      <span><i className="au-tp-leg vorschlag" />Vorschlag (gepunktet)</span>
      <span><i className="au-tp-leg ferien" />Ferien Bayern</span>
      <span><i className="au-tp-leg feiertag" />Feiertag</span>
      <span><i className="au-tp-leg konferenz" />Konferenz</span>
      <span><i className="au-tp-leg blocker" />Blocker</span>
    </span>
  );
}
