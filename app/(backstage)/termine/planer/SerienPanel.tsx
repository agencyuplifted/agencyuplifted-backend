"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uebernehmeSerie } from "@/lib/terminplaner-actions";
import type { Bewertung } from "@/lib/terminplaner";
import BewertungAnzeige from "./BewertungAnzeige";

// Eine Serie (z. B. 12 Foundation-Sparrings) fuer ein Jahr: pro Periode der
// Termin laut Regel bzw. der Ausweichtag, mit Begruendung. Auswahl per
// Haekchen, dann gesammelt merken oder fest einplanen. Bei ausgewichenen
// Terminen laesst sich bewusst der Regeltag nehmen ("uebergehen").

export type SerienZeileDaten = {
  periode: string;
  regeltag: (Pick<Bewertung, "datum_start" | "score" | "gruende" | "gesperrt" | "kollision"> & { text: string }) | null;
  vorschlag: (Pick<Bewertung, "datum_start" | "score" | "gruende"> & { text: string }) | null;
  ausgewichen: boolean;
  vorhanden: { status: string; text: string } | null;
};

const STATUS_TEXT: Record<string, string> = { fest: "fest eingeplant", vorgeschlagen: "gemerkt", in_pruefung: "in Prüfung", bestaetigt: "übernommen" };

// Warum der Regeltag nicht passt -- der gewichtigste Grund reicht als Hinweis
function problemText(r: NonNullable<SerienZeileDaten["regeltag"]>): string {
  if (r.kollision) return r.kollision;
  if (r.gesperrt) return r.gesperrt;
  const g = [...r.gruende].sort((a, b) => a.punkte - b.punkte)[0];
  return g ? g.text : "";
}

export default function SerienPanel({
  formatId,
  titel,
  unterzeile,
  farbe,
  zeilen,
}: {
  formatId: string;
  titel: string;
  unterzeile: string;
  farbe: string | null;
  zeilen: SerienZeileDaten[];
}) {
  const router = useRouter();
  const offen = zeilen.map((z, i) => ({ z, i })).filter(({ z }) => !z.vorhanden && z.vorschlag);
  const [gewaehlt, setGewaehlt] = useState<Set<number>>(() => new Set(offen.map(({ i }) => i)));
  // Zeilen, bei denen statt des Ausweichtags bewusst der Regeltag genommen wird
  const [regeltagStatt, setRegeltagStatt] = useState<Set<number>>(new Set());
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const tage = useMemo(
    () =>
      offen
        .filter(({ i }) => gewaehlt.has(i))
        .map(({ z, i }) => (regeltagStatt.has(i) && z.regeltag ? z.regeltag.datum_start : z.vorschlag!.datum_start)),
    [offen, gewaehlt, regeltagStatt]
  );

  function umschalten(set: Set<number>, i: number) {
    const neu = new Set(set);
    if (neu.has(i)) neu.delete(i);
    else neu.add(i);
    return neu;
  }

  function uebernehmen(status: "vorgeschlagen" | "fest") {
    const fd = new FormData();
    fd.set("format_id", formatId);
    fd.set("status", status);
    fd.set("tage", tage.join(","));
    setMeldung(null);
    starte(async () => {
      try {
        const r = await uebernehmeSerie(fd);
        setMeldung(r.fehler ? { art: "fehler", text: r.fehler } : { art: "ok", text: r.info || "Gespeichert." });
        router.refresh();
      } catch (e: any) {
        setMeldung({ art: "fehler", text: `Fehlgeschlagen: ${e?.message || "unbekannter Fehler"}` });
      }
    });
  }

  const erledigt = zeilen.filter((z) => z.vorhanden).length;

  return (
    <section className="au-panel" style={{ opacity: laeuft ? 0.6 : undefined }}>
      <div className="au-panel-kopf">
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {farbe && <span className="au-tp-serie-punkt" style={{ background: farbe }} />}
            {titel}
          </h2>
          <span className="au-klein">{unterzeile}</span>
        </div>
        <span className={`au-badge ${erledigt >= zeilen.length ? "au-badge-success" : "au-badge-warning"}`}>
          {erledigt} / {zeilen.length} geplant
        </span>
      </div>

      <ul className="au-tp-liste au-tp-serie">
        {zeilen.map((z, i) => {
          const nimmtRegeltag = regeltagStatt.has(i) && z.regeltag;
          const anzeige = nimmtRegeltag ? z.regeltag! : z.vorschlag;
          return (
            <li key={i} className={`au-tp-zeile au-tp-serie-zeile${z.vorhanden ? " erledigt" : ""}`}>
              <div className="au-tp-zeile-kopf">
                <label className="au-tp-serie-wahl">
                  {z.vorhanden || !z.vorschlag ? (
                    <span className="au-tp-serie-platzhalter" />
                  ) : (
                    <input type="checkbox" checked={gewaehlt.has(i)} onChange={() => setGewaehlt((s) => umschalten(s, i))} aria-label={`${z.periode} auswählen`} />
                  )}
                  <span className="au-tp-serie-periode">{z.periode}</span>
                  {z.vorhanden ? (
                    <strong>{z.vorhanden.text}</strong>
                  ) : anzeige ? (
                    <strong>{anzeige.text}</strong>
                  ) : (
                    <span className="au-klein">kein passender Tag gefunden</span>
                  )}
                </label>
                <div className="au-tp-knoepfe">
                  {z.vorhanden && <span className={`au-badge ${z.vorhanden.status === "fest" ? "au-badge-success" : "au-badge-neutral"}`}>{STATUS_TEXT[z.vorhanden.status] || z.vorhanden.status}</span>}
                  {!z.vorhanden && z.ausgewichen && z.regeltag && (
                    <button type="button" className="au-link" onClick={() => setRegeltagStatt((s) => umschalten(s, i))}>
                      {nimmtRegeltag ? `doch Ausweichtag (${z.vorschlag?.text})` : `trotzdem Regeltermin (${z.regeltag.text})`}
                    </button>
                  )}
                </div>
              </div>
              {!z.vorhanden && z.ausgewichen && z.regeltag && !nimmtRegeltag && (
                <p className="au-klein au-tp-serie-grund">
                  Regeltermin {z.regeltag.text} passt nicht: {problemText(z.regeltag)} → ausgewichen
                </p>
              )}
              {!z.vorhanden && nimmtRegeltag && (z.regeltag!.kollision || z.regeltag!.gesperrt) && (
                <p className="au-klein au-tp-serie-grund warnung">
                  {z.regeltag!.kollision ? "Überschneidung – beim Einplanen wird dieser Termin übersprungen; einzeln unter „Kandidaten“ mit Bestätigung festlegen." : `Hinweis: ${z.regeltag!.gesperrt}`}
                </p>
              )}
              {!z.vorhanden && anzeige && <BewertungAnzeige b={anzeige} kompakt />}
            </li>
          );
        })}
      </ul>

      <div className="au-tp-serie-fuss">
        <button
          type="button"
          className="au-link"
          onClick={() => setGewaehlt(gewaehlt.size === offen.length ? new Set() : new Set(offen.map(({ i }) => i)))}
          disabled={!offen.length}
        >
          {gewaehlt.size === offen.length ? "keine auswählen" : "alle offenen auswählen"}
        </button>
        <span className="au-klein">{tage.length} ausgewählt</span>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" disabled={!tage.length || laeuft} onClick={() => uebernehmen("vorgeschlagen")}>
          Als Kandidaten merken
        </button>
        <button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={!tage.length || laeuft} onClick={() => uebernehmen("fest")}>
          Fest einplanen
        </button>
      </div>
      {meldung && (
        <div className={`au-banner ${meldung.art === "ok" ? "au-banner-success" : "au-banner-warning"}`} style={{ margin: "0 1.15rem 1rem", padding: "0.5rem 0.75rem" }}>
          {meldung.text}
        </div>
      )}
    </section>
  );
}
