import { berechneDeckungsbeitraege, type Deckungsbeitrag } from "@/lib/deckungsbeitrag";
import { formatEURGanz, formatDatum } from "@/lib/format";

// "Grosses Bild" im Dashboard-Reiter Seminare. Bewusst KEIN Jahresziel/Soll:
// eingeordnet wird relativ zu den eigenen letzten Terminen und zum Vorjahr
// (Beyond-Budgeting-Ansatz, Vorgabe Markus 10/2026). Die DB-Rechnung selbst
// kommt unveraendert aus lib/deckungsbeitrag.ts.
//
// Charts als serverseitiges SVG -- das Projekt hat keine Chart-Library, und
// fuer ein Balken- und ein Liniendiagramm lohnt keine neue Abhaengigkeit.

type Termin = {
  id: string;
  kennung: string | null;
  titel: string | null;
  datum_start: string;
  datum_ende: string | null;
  kapazitaet: number | null;
  sondereffekt_notiz: string | null;
  seminartyp_id: string | null;
  seminartypen: { name: string } | null;
};
type Zeile = Termin & Deckungsbeitrag & { vergangen: boolean; istKonferenz: boolean };

const FARBE_VERGANGEN = "#2a78d6";
const FARBE_ANSTEHEND = "#b5d4f4";
const FARBE_SONDER = "#d3d1c7";
const FARBE_AUSLASTUNG = "#1baf7a";
const FARBE_SPARK = "#898781";

const istKonferenz = (t: Termin) => (t.seminartypen?.name || "").toLowerCase().includes("konferenz");
const tagMinus = (iso: string, tage: number) => new Date(Date.parse(iso) - tage * 86400000).toISOString().slice(0, 10);
const kurz = (t: Termin) => t.kennung || t.titel || "Termin";

export default async function SeminarCockpit({
  supabase,
  heute,
  jahr,
  seminartypFilter,
}: {
  supabase: any;
  heute: string;
  jahr: number;
  seminartypFilter?: string;
}) {
  // Ein Abruf fuer alles: rollierende 12 Monate + gleicher Zeitraum im Vorjahr,
  // gewaehltes Jahr und Vorjahr (Kategorie-Karten).
  const von = [tagMinus(heute, 730), `${jahr - 1}-01-01`].sort()[0];
  const bis = [heute, `${jahr}-12-31`].sort()[1];
  let q = supabase
    .from("seminartermine")
    .select("id, kennung, titel, datum_start, datum_ende, kapazitaet, sondereffekt_notiz, seminartyp_id, seminartypen(name)")
    .gte("datum_start", von)
    .lte("datum_start", bis)
    .neq("status", "abgesagt")
    .order("datum_start", { ascending: true });
  if (seminartypFilter) q = q.eq("seminartyp_id", seminartypFilter);
  const { data } = await q;
  const termine: Termin[] = data || [];
  const db = await berechneDeckungsbeitraege(supabase, termine.map((t) => t.id));
  const zeilen: Zeile[] = termine.map((t) => ({
    ...t,
    ...db.get(t.id)!,
    vergangen: (t.datum_ende || t.datum_start) < heute,
    istKonferenz: istKonferenz(t),
  }));

  // 1. Rollierend 12 Monate (alle Termine inkl. Konferenz) + Vorjahresvergleich
  const summe = (liste: Zeile[]) => ({
    db: liste.reduce((s, z) => s + z.db, 0),
    umsatz: liste.reduce((s, z) => s + z.umsatz, 0),
    kosten: liste.reduce((s, z) => s + z.fremdkosten, 0),
  });
  const vor365 = tagMinus(heute, 365);
  const vor730 = tagMinus(heute, 730);
  const rollierend = summe(zeilen.filter((z) => z.datum_start > vor365 && z.datum_start <= heute));
  const vorjahrZeilen = zeilen.filter((z) => z.datum_start > vor730 && z.datum_start <= vor365);
  // Vergleich erst, wenn es im Vorjahreszeitraum echte Buchungen gibt
  // (legacy_buchungen haben keine Betraege und zaehlen hier nicht).
  const vorjahrAktiv = vorjahrZeilen.some((z) => z.umsatz > 0);
  const vorjahr = summe(vorjahrZeilen);
  const veraenderung = vorjahrAktiv && vorjahr.db !== 0 ? (rollierend.db - vorjahr.db) / Math.abs(vorjahr.db) : null;

  const imJahr = zeilen.filter((z) => z.datum_start.startsWith(String(jahr)));

  // Kalenderjahr (Jahresfilter): durchgefuehrt + was die anstehenden Termine
  // nach heutigem Buchungsstand bringen. Vorjahresvergleich "bis heute" =
  // gleicher Kalendertag im Vorjahr, nur wenn dort echte Buchungen existieren.
  const jahrDurchgefuehrt = summe(imJahr.filter((z) => z.vergangen));
  const jahrAnstehend = summe(imJahr.filter((z) => !z.vergangen));
  const stichtagVorjahr = `${jahr - 1}${heute.slice(4)}`;
  const vorjahrBisHeute = zeilen.filter((z) => z.datum_start.startsWith(String(jahr - 1)) && (z.datum_ende || z.datum_start) < stichtagVorjahr);
  const jahrVergleichAktiv = jahr === Number(heute.slice(0, 4)) && vorjahrBisHeute.some((z) => z.umsatz > 0);
  const jahrVeraenderung =
    jahrVergleichAktiv && summe(vorjahrBisHeute).db !== 0
      ? (jahrDurchgefuehrt.db - summe(vorjahrBisHeute).db) / Math.abs(summe(vorjahrBisHeute).db)
      : null;
  const konferenzen = imJahr.filter((z) => z.istKonferenz);
  const seminare = imJahr.filter((z) => !z.istKonferenz);

  return (
    <div className="au-cockpit">
      {/* 1. Hero: rollierend und Kalenderjahr nebeneinander */}
      <div className="au-cockpit-hero-raster">
      <section className="au-cockpit-hero">
        <div className="au-cockpit-label">
          Deckungsbeitrag · letzte 12 Monate · <strong>{formatDatum(tagMinus(heute, 364))} – {formatDatum(heute)}</strong>
        </div>
        <div className="au-cockpit-zahl">{formatEURGanz(rollierend.db)}</div>
        <div className="au-cockpit-kontext">
          Umsatz {formatEURGanz(rollierend.umsatz)} · Fremdkosten {formatEURGanz(rollierend.kosten)} · Termine mit Beginn im Zeitraum, inkl. Konferenz
        </div>
        <div className="au-cockpit-vergleich">
          {veraenderung === null ? (
            <>Vergleich mit den 12 Monaten davor ({formatDatum(tagMinus(heute, 729))} – {formatDatum(tagMinus(heute, 365))}): noch keine Daten – erscheint automatisch, sobald diese Termine mit Buchungen im System sind.</>
          ) : (
            <>
              <span className={veraenderung >= 0 ? "au-cockpit-plus" : "au-cockpit-minus"} aria-hidden="true">
                {veraenderung >= 0 ? "▲" : "▼"}
              </span>{" "}
              {veraenderung >= 0 ? "+" : "−"}
              {Math.abs(Math.round(veraenderung * 100))} % ggü. den 12 Monaten davor ({formatEURGanz(vorjahr.db)})
            </>
          )}
        </div>
      </section>

      <section className="au-cockpit-hero">
        <div className="au-cockpit-label">
          Deckungsbeitrag · Kalenderjahr {jahr} · <strong>01.01. – 31.12.{jahr}</strong>
        </div>
        <div className="au-cockpit-zahl">{formatEURGanz(jahrDurchgefuehrt.db)}</div>
        <div className="au-cockpit-kontext">
          bereits durchgeführte Termine · Umsatz {formatEURGanz(jahrDurchgefuehrt.umsatz)} · Fremdkosten {formatEURGanz(jahrDurchgefuehrt.kosten)}
        </div>
        {jahrAnstehend.umsatz !== 0 || jahrAnstehend.kosten !== 0 ? (
          <div className="au-cockpit-kontext" style={{ marginTop: "0.35rem" }}>
            {jahrAnstehend.db >= 0 ? "+" : "−"} {formatEURGanz(Math.abs(jahrAnstehend.db))} aus anstehenden Terminen (Stand Buchungen) ={" "}
            <strong>{formatEURGanz(jahrDurchgefuehrt.db + jahrAnstehend.db)} erwartet</strong>
          </div>
        ) : null}
        <div className="au-cockpit-vergleich">
          {jahr !== Number(heute.slice(0, 4)) ? (
            <>{jahr < Number(heute.slice(0, 4)) ? "Abgeschlossenes Jahr." : "Noch kein Termin durchgeführt."}</>
          ) : jahrVeraenderung === null ? (
            <>Vergleich mit {jahr - 1} bis zum {formatDatum(stichtagVorjahr)}: noch keine Daten – erscheint automatisch, sobald {jahr - 1} mit Buchungen im System ist.</>
          ) : (
            <>
              <span className={jahrVeraenderung >= 0 ? "au-cockpit-plus" : "au-cockpit-minus"} aria-hidden="true">
                {jahrVeraenderung >= 0 ? "▲" : "▼"}
              </span>{" "}
              {jahrVeraenderung >= 0 ? "+" : "−"}
              {Math.abs(Math.round(jahrVeraenderung * 100))} % ggü. {jahr - 1} bis zum gleichen Tag ({formatEURGanz(summe(vorjahrBisHeute).db)})
            </>
          )}
        </div>
      </section>
      </div>

      {/* 2. Konferenz separat */}
      {konferenzen.map((k) => (
        <section key={k.id} className="au-cockpit-konferenz">
          <div className="au-cockpit-label">Konferenz (separat) · {kurz(k)}</div>
          <div className="au-cockpit-konferenz-werte">
            <strong>{formatEURGanz(k.db)}</strong>
            <span>Umsatz {formatEURGanz(k.umsatz)} · Fremdkosten {formatEURGanz(k.fremdkosten)}{k.vergangen ? "" : " · anstehend"}</span>
          </div>
        </section>
      ))}

      {/* 3. + 5. Charts pro Termin (ohne Konferenz) */}
      <section className="au-cockpit-chart">
        <h3>Deckungsbeitrag pro Termin {jahr}</h3>
        {seminare.length ? <div className="au-cockpit-scroll"><DbBalken zeilen={seminare} /></div> : <p className="au-leer">Keine Seminartermine in {jahr}.</p>}
        <p className="au-cockpit-schluessel">
          <span style={{ background: FARBE_VERGANGEN }} /> durchgeführt <span style={{ background: FARBE_ANSTEHEND }} /> anstehend{" "}
          <span style={{ background: FARBE_SONDER }} /> mit Sondereffekt
        </p>
        {seminare.some((z) => z.sondereffekt_notiz) && (
          <p className="au-cockpit-fussnote">
            {seminare
              .filter((z) => z.sondereffekt_notiz)
              .map((z) => `${kurz(z)}: ${z.sondereffekt_notiz}`)
              .join(" · ")}
          </p>
        )}
      </section>

      {seminare.length > 0 && (
        <section className="au-cockpit-chart">
          <h3>Auslastung pro Termin {jahr}</h3>
          <div className="au-cockpit-scroll"><AuslastungLinie zeilen={seminare} /></div>
        </section>
      )}

      {/* 6. Kategorie-Karten */}
      <KategorieKarten zeilen={zeilen.filter((z) => !z.istKonferenz && (z.datum_start.startsWith(String(jahr)) || z.datum_start.startsWith(String(jahr - 1))))} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balken: DB pro Termin, chronologisch. Negative Werte unter die Nulllinie.

const B = 720; // viewBox-Breite
const PAD = { links: 64, rechts: 12, oben: 12, unten: 40 };

function skala(min: number, max: number) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max) || 1;
  const roh = (hi - lo) / 4;
  const potenz = Math.pow(10, Math.floor(Math.log10(roh)));
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * potenz).find((s) => s >= roh) || roh;
  const unten = Math.floor(lo / schritt) * schritt;
  const oben = Math.ceil(hi / schritt) * schritt;
  const ticks: number[] = [];
  for (let v = unten; v <= oben + 1e-6; v += schritt) ticks.push(Math.round(v));
  return { unten, oben, ticks };
}

const kEuro = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} T€` : `${Math.round(v)} €`);

function DbBalken({ zeilen }: { zeilen: Zeile[] }) {
  const H = 260;
  const { unten, oben, ticks } = skala(Math.min(...zeilen.map((z) => z.db)), Math.max(...zeilen.map((z) => z.db)));
  const innenB = B - PAD.links - PAD.rechts;
  const innenH = H - PAD.oben - PAD.unten;
  const y = (v: number) => PAD.oben + innenH - ((v - unten) / (oben - unten)) * innenH;
  const slot = innenB / zeilen.length;
  const breite = Math.min(48, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="au-cockpit-svg" role="img" aria-label="Deckungsbeitrag pro Termin, chronologisch">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.links} x2={B - PAD.rechts} y1={y(t)} y2={y(t)} className={t === 0 ? "au-achse-null" : "au-raster"} />
          <text x={PAD.links - 8} y={y(t) + 4} textAnchor="end" className="au-achse-text">{kEuro(t)}</text>
        </g>
      ))}
      {zeilen.map((z, i) => {
        const x = PAD.links + slot * i + (slot - breite) / 2;
        const y0 = y(0);
        const y1 = y(z.db);
        const farbe = z.sondereffekt_notiz ? FARBE_SONDER : z.vergangen ? FARBE_VERGANGEN : FARBE_ANSTEHEND;
        const h = Math.max(1, Math.abs(y1 - y0));
        const r = Math.min(4, h / 2, breite / 2);
        const top = Math.min(y0, y1);
        // nur das Datenende rund, die Basis an der Nulllinie bleibt eckig
        const pfad =
          z.db >= 0
            ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + breite - r} Q${x + breite},${top} ${x + breite},${top + r} V${top + h} Z`
            : `M${x},${top} V${top + h - r} Q${x},${top + h} ${x + r},${top + h} H${x + breite - r} Q${x + breite},${top + h} ${x + breite},${top + h - r} V${top} Z`;
        return (
          <g key={z.id} className="au-balken">
            <title>
              {`${kurz(z)} · ${formatDatum(z.datum_start)}\nDB ${formatEURGanz(z.db)} · Umsatz ${formatEURGanz(z.umsatz)} · Fremdkosten ${formatEURGanz(z.fremdkosten)}${z.kostenQuelle === "beleg" ? " (Beleg)" : ""}${z.sondereffekt_notiz ? `\nSondereffekt: ${z.sondereffekt_notiz}` : ""}`}
            </title>
            {/* grosse Trefferflaeche fuer den Tooltip */}
            <rect x={PAD.links + slot * i} y={PAD.oben} width={slot} height={innenH} fill="transparent" />
            <path d={pfad} fill={farbe} />
            <text x={x + breite / 2} y={H - PAD.unten + 16} textAnchor="middle" className="au-achse-text">{kurz(z)}</text>
            <text x={x + breite / 2} y={H - PAD.unten + 30} textAnchor="middle" className="au-achse-text au-achse-klein">
              {formatDatum(z.datum_start).slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Linie: Auslastung (Teilnehmer / Kapazitaet), vergangen durchgezogen,
// anstehend gestrichelt. Eigener Chart, keine zweite Achse.

function AuslastungLinie({ zeilen }: { zeilen: Zeile[] }) {
  const H = 180;
  const innenB = B - PAD.links - PAD.rechts;
  const innenH = H - PAD.oben - PAD.unten;
  const slot = innenB / zeilen.length;
  const punkte = zeilen.map((z, i) => ({
    z,
    x: PAD.links + slot * i + slot / 2,
    wert: z.kapazitaet ? Math.min(1, z.teilnehmer / z.kapazitaet) : 0,
  }));
  const y = (v: number) => PAD.oben + innenH - v * innenH;
  const letzteVergangen = punkte.map((p) => p.z.vergangen).lastIndexOf(true);
  const pfad = (liste: typeof punkte) => liste.map((p, i) => `${i ? "L" : "M"}${p.x},${y(p.wert)}`).join(" ");
  const durchgezogen = letzteVergangen >= 0 ? punkte.slice(0, letzteVergangen + 1) : [];
  const gestrichelt = punkte.slice(Math.max(0, letzteVergangen));
  return (
    <svg viewBox={`0 0 ${B} ${H}`} className="au-cockpit-svg" role="img" aria-label="Auslastung pro Termin in Prozent">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={PAD.links} x2={B - PAD.rechts} y1={y(t)} y2={y(t)} className={t === 0 ? "au-achse-null" : "au-raster"} />
          <text x={PAD.links - 8} y={y(t) + 4} textAnchor="end" className="au-achse-text">{Math.round(t * 100)} %</text>
        </g>
      ))}
      {durchgezogen.length > 1 && <path d={pfad(durchgezogen)} fill="none" stroke={FARBE_AUSLASTUNG} strokeWidth={2} strokeLinejoin="round" />}
      {gestrichelt.length > 1 && <path d={pfad(gestrichelt)} fill="none" stroke={FARBE_AUSLASTUNG} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />}
      {punkte.map((p) => (
        <g key={p.z.id}>
          <title>{`${kurz(p.z)} · ${p.z.teilnehmer} von ${p.z.kapazitaet ?? "?"} Plätzen (${Math.round(p.wert * 100)} %)`}</title>
          <rect x={p.x - slot / 2} y={PAD.oben} width={slot} height={innenH} fill="transparent" />
          <circle cx={p.x} cy={y(p.wert)} r={4} fill={p.z.vergangen ? FARBE_AUSLASTUNG : "var(--color-surface, #fff)"} stroke={FARBE_AUSLASTUNG} strokeWidth={2} />
          <text x={p.x} y={H - PAD.unten + 16} textAnchor="middle" className="au-achse-text">{kurz(p.z)}</text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Kategorie-Karten mit Sparkline der letzten echten Termine.

function KategorieKarten({ zeilen }: { zeilen: Zeile[] }) {
  const gruppen = new Map<string, { name: string; zeilen: Zeile[] }>();
  zeilen.forEach((z) => {
    const key = z.seminartyp_id || "ohne";
    if (!gruppen.has(key)) gruppen.set(key, { name: z.seminartypen?.name || "Ohne Kategorie", zeilen: [] });
    gruppen.get(key)!.zeilen.push(z);
  });
  if (!gruppen.size) return null;
  return (
    <section>
      <h3 className="au-cockpit-zwischentitel">Nach Kategorie, zum Nachschauen</h3>
      <div className="au-cockpit-kategorien">
        {[...gruppen.values()]
          .sort((a, b) => a.name.localeCompare(b.name, "de"))
          .map((g) => {
            // "echt" = durchgefuehrt und mit Buchungen (Umsatz oder Personen)
            const echt = g.zeilen.filter((z) => z.vergangen && (z.umsatz > 0 || z.personen > 0));
            const letzter = echt[echt.length - 1];
            const werte = echt.map((z) => z.db);
            return (
              <div key={g.name} className="au-cockpit-kategorie">
                <div className="au-cockpit-label">{g.name}</div>
                <div className="au-cockpit-kategorie-zahl">{letzter ? formatEURGanz(letzter.db) : "—"}</div>
                {letzter && <div className="au-klein">letzter Termin: {kurz(letzter)}</div>}
                {werte.length >= 2 && <Sparkline werte={werte} />}
                <div className="au-klein">
                  {werte.length >= 2
                    ? `Spanne letzte ${werte.length}: ${formatEURGanz(Math.min(...werte))} – ${formatEURGanz(Math.max(...werte))}`
                    : werte.length === 1
                      ? "einziger Termin bisher"
                      : "noch offen"}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

export function Sparkline({ werte, farbe = FARBE_VERGANGEN }: { werte: number[]; farbe?: string }) {
  const W = 160;
  const H = 36;
  const lo = Math.min(...werte);
  const hi = Math.max(...werte);
  const spanne = hi - lo || 1;
  const pts = werte.map((v, i) => ({ x: 4 + (i * (W - 8)) / (werte.length - 1), y: 4 + (1 - (v - lo) / spanne) * (H - 8) }));
  const letzter = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="au-sparkline" aria-hidden="true">
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={FARBE_SPARK} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={letzter.x} cy={letzter.y} r={4} fill={farbe} />
    </svg>
  );
}
