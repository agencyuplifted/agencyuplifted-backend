// Jahreskalender des Terminplaners -- gleiches Raster wie der Kalender auf
// /termine (au-planer-*), zusaetzlich mit den Planungsdaten im Hintergrund
// (Bayern-Ferien, Feiertage, Konferenzen, Blocker) und den Kandidaten bzw.
// besten Vorschlaegen als eigene Balken-Arten. So sieht man auf einen Blick,
// warum eine Woche gut oder schlecht ist.

const MONATSKURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const iso = (j: number, m: number, t: number) => `${j}-${String(m + 1).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type KalenderBalken = {
  key: string;
  von: string;
  bis: string;
  art: "termin" | "pruefung" | "gemerkt" | "vorschlag";
  label: string;
  titel: string;
  farbe?: string | null;
  href?: string;
};

type TagInfo = { klassen: Set<string>; hinweise: string[] };

export default function PlanerKalender({
  jahr,
  heute,
  balken,
  ferien,
  konferenzen,
  blocker,
}: {
  jahr: number;
  heute: string;
  balken: KalenderBalken[];
  ferien: { land: string; region: string | null; typ: string; bezeichnung: string; von: string; bis: string }[];
  konferenzen: { name: string; von: string; bis: string; gewicht: number }[];
  blocker: { bezeichnung: string; monat: number; tag: number; puffer_vorher: number; puffer_nachher: number; hart: boolean }[];
}) {
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

  return (
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
        // Feste Termine zuerst, damit sie oben liegen; dann Kandidaten, dann Vorschlaege
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
          <div key={monatStart} className={`au-planer-zeile${heute.slice(0, 7) === monatStart.slice(0, 7) ? " aktuell" : ""}`} role="row" style={{ gridTemplateRows: `repeat(${spuren}, 22px)` }}>
            <span className="au-planer-monat" role="rowheader" style={{ gridRow: `1 / span ${spuren}` }}>
              {MONATSKURZ[monatIndex]} <span>{String(jahr).slice(2)}</span>
            </span>
            {Array.from({ length: 31 }, (_, i) => {
              const tag = i + 1;
              if (tag > anzahlTage) return <span key={i} className="au-planer-tag leer" style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }} />;
              const d = iso(jahr, monatIndex, tag);
              const wt = new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay();
              const info = tage.get(d);
              return (
                <span
                  key={i}
                  className={`au-planer-tag${wt === 0 || wt === 6 ? " wochenende" : ""}${d === heute ? " heute" : ""}${info ? ` ${[...info.klassen].join(" ")}` : ""}`}
                  style={{ gridColumn: i + 2, gridRow: `1 / span ${spuren}` }}
                  title={info ? `${tag}.${monatIndex + 1}.: ${info.hinweise.join(" · ")}` : undefined}
                />
              );
            })}
            {gelegt.map(({ b, von, bis, spur }) => {
              const stil = { gridColumn: `${von + 1} / ${bis + 2}`, gridRow: spur + 1, ...(b.art === "termin" ? { background: b.farbe || "var(--color-accent)" } : {}) };
              const klasse = `au-planer-balken au-tp-balken-${b.art}`;
              return b.href ? (
                <a key={b.key} href={b.href} className={klasse} style={stil} title={b.titel}>{b.label}</a>
              ) : (
                <span key={b.key} className={klasse} style={stil} title={b.titel}>{b.label}</span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function KalenderLegende() {
  return (
    <span className="au-planer-legende au-tp-legende">
      <span><i className="au-tp-leg termin" />Seminar</span>
      <span><i className="au-tp-leg pruefung" />in Prüfung</span>
      <span><i className="au-tp-leg gemerkt" />gemerkt</span>
      <span><i className="au-tp-leg vorschlag" />Vorschlag</span>
      <span><i className="au-tp-leg ferien" />Ferien Bayern</span>
      <span><i className="au-tp-leg feiertag" />Feiertag</span>
      <span><i className="au-tp-leg konferenz" />Konferenz</span>
      <span><i className="au-tp-leg blocker" />Blocker</span>
    </span>
  );
}
