import React from "react";
import { formatDatumsspanne } from "@/lib/format";

// Jahreskalender (eine Zeile pro Monat, Termine als Balken) -- gemeinsam fuer
// die Terminuebersicht (/termine) und die Programm-Kalender (/programme/*).
// Eintraege: Seminartermine (Standard), vorgeplante Kandidaten ({ vorgeplant })
// und im Terminplaner fest eingeplante Online-/Praesenz-Termine ({ fest }).

// "Foundation-Sparring" -> "Sparring", "Uplift-Day" -> "Day"
function kurzname(name?: string | null): string {
  if (!name) return "";
  return name.split(/[-\s]/).pop()!.slice(0, 7);
}

export const MONATSKURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function isoDatum(jahr: number, monatIndex: number, tag: number) {
  return `${jahr}-${String(monatIndex + 1).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

// Rollierender Jahresplaner: eine Zeile pro Monat (Vormonat bis +10), Tage
// 1-31 als Spalten, Seminare als Balken ueber ihre ganze Dauer. Ersetzt die
// frueheren Monatskaertchen zum Seitwaertsscrollen -- gerade am Jahreswechsel
// (2026/2027 parallel in Arbeit) sieht man so alles auf einen Blick.
export default function Jahresplaner({
  monate,
  termine,
  gebuchtProTermin,
  heuteISO,
  mitKopf = true,
}: {
  monate: { jahr: number; monatIndex: number }[];
  termine: any[];
  /** optional: fuer die Programm-Kalender ohne Belegungszahlen */
  gebuchtProTermin?: Map<string, number>;
  heuteISO: string;
  mitKopf?: boolean;
}) {
  return (
    <div className="au-planer" role="table" aria-label="Seminarkalender">
      {mitKopf && (
        <div className="au-planer-zeile au-planer-kopfzeile" role="row">
          <span className="au-planer-monat" />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="au-planer-tagnr" style={{ gridColumn: i + 2 }}>{(i + 1) % 5 === 0 || i === 0 ? i + 1 : ""}</span>
          ))}
        </div>
      )}
      {monate.map(({ jahr, monatIndex }) => {
        const anzahlTage = new Date(jahr, monatIndex + 1, 0).getDate();
        const monatStart = isoDatum(jahr, monatIndex, 1);
        const monatEnde = isoDatum(jahr, monatIndex, anzahlTage);
        const imMonat = termine
          .filter((t: any) => t.datum_start <= monatEnde && (t.datum_ende || t.datum_start) >= monatStart)
          .sort((a: any, b: any) => a.datum_start.localeCompare(b.datum_start));
        // Ueberlappende Termine auf eigene Spuren verteilen
        const spurEnde: number[] = [];
        const balken = imMonat.map((t: any) => {
          const von = t.datum_start < monatStart ? 1 : Number(t.datum_start.slice(8, 10));
          const bis = (t.datum_ende || t.datum_start) > monatEnde ? anzahlTage : Number((t.datum_ende || t.datum_start).slice(8, 10));
          let spur = spurEnde.findIndex((e) => e < von);
          if (spur === -1) { spur = spurEnde.length; spurEnde.push(bis); } else spurEnde[spur] = bis;
          return { t, von, bis, spur };
        });
        const spuren = Math.max(1, spurEnde.length);
        const istAktuell = heuteISO.slice(0, 7) === monatStart.slice(0, 7);
        return (
          <div key={monatStart} className={`au-planer-zeile${istAktuell ? " aktuell" : ""}`} role="row" style={{ gridTemplateRows: `repeat(${spuren}, 22px)` }}>
            <span className="au-planer-monat" role="rowheader" style={{ gridRow: `1 / span ${spuren}` }}>
              {MONATSKURZ[monatIndex]} <span>{String(jahr).slice(2)}</span>
            </span>
            {Array.from({ length: 31 }, (_, i) => {
              const tag = i + 1;
              if (tag > anzahlTage) return <span key={i} className="au-planer-tag leer" style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }} />;
              const wt = new Date(jahr, monatIndex, tag).getDay();
              const iso = isoDatum(jahr, monatIndex, tag);
              return (
                <span
                  key={i}
                  className={`au-planer-tag${wt === 0 || wt === 6 ? " wochenende" : ""}${iso === heuteISO ? " heute" : ""}`}
                  style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }}
                />
              );
            })}
            {balken.map(({ t, von, bis, spur }) => {
              // Im Terminplaner fest eingeplante Online-/Praesenz-Termine (kein
              // Seminartermin): vollflaechig in Formatfarbe, heller Innenrand
              if (t.fest) {
                return (
                  <a
                    key={t.id}
                    href="/termine/planer#kandidaten"
                    className="au-planer-balken au-planer-fest"
                    style={{ gridColumn: `${von + 1} / ${bis + 2}`, gridRow: spur + 1, background: t.termin_formate?.farbe || "var(--color-accent)" }}
                    title={`Fest eingeplant: ${t.termin_formate?.name || ""} · ${formatDatumsspanne(t.datum_start, t.datum_ende)}${t.start_uhrzeit ? `, ${t.start_uhrzeit.slice(0, 5)} Uhr` : ""}`}
                  >
                    {kurzname(t.termin_formate?.name)}
                  </a>
                );
              }
              // Vorgeplante Kandidaten aus dem Terminplaner: gestrichelt mit "?"
              if (t.vorgeplant) {
                const farbe = t.seminartypen?.farbe || t.termin_formate?.farbe;
                const name = t.seminartypen?.name || (t.termin_formate?.terminart && t.termin_formate.terminart !== "seminar" ? t.termin_formate.name : "");
                return (
                  <a
                    key={t.id}
                    href="/termine/planer#kandidaten"
                    className={`au-planer-balken au-planer-vorgeplant${t.status === "in_pruefung" ? " pruefung" : ""}`}
                    style={{ gridColumn: `${von + 1} / ${bis + 2}`, gridRow: spur + 1, ...(farbe ? ({ "--kat": farbe } as React.CSSProperties) : {}) }}
                    title={`Vorgeplant (${t.status === "in_pruefung" ? "in Prüfung" : "Kandidat"}): ${name || "Kategorie offen"} · ${formatDatumsspanne(t.datum_start, t.datum_ende)}`}
                  >
                    {t.seminartypen?.name ? t.seminartypen.name.slice(0, 4) : kurzname(name)}?
                  </a>
                );
              }
              const gebucht = gebuchtProTermin?.get(t.id) || 0;
              return (
                <a
                  key={t.id}
                  href={`/termine/${t.id}`}
                  className="au-planer-balken"
                  style={{ gridColumn: `${von + 1} / ${bis + 2}`, gridRow: spur + 1, background: t.seminartypen?.farbe || "var(--color-accent)" }}
                  title={`${t.titel || t.seminartypen?.name || ""} · ${formatDatumsspanne(t.datum_start, t.datum_ende)}${gebuchtProTermin ? ` · ${gebucht} von ${t.kapazitaet} TN` : ""}`}
                >
                  {t.kennung || (t.seminartypen?.name || "").slice(0, 4)}
                </a>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

