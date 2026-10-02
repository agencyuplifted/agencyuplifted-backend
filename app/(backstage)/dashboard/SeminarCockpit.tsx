import Link from "next/link";
import { berechneDeckungsbeitraege, ladeFremdkostenProPerson, type Deckungsbeitrag } from "@/lib/deckungsbeitrag";
import { formatEURGanz, formatDatum, MONATSNAMEN } from "@/lib/format";
import { vorperiode, zeitraumArt, zeitraumKey, zeitraumNachbar, type Zeitraum, type ZeitraumArt } from "@/lib/zeitraeume";

// Dashboard-Reiter "Seminare". Bewusst KEIN Jahresziel/Soll: eingeordnet
// wird relativ zur Vorperiode (Beyond-Budgeting-Ansatz, Vorgabe Markus 10/2026).
// Die DB-Rechnung selbst kommt unveraendert aus lib/deckungsbeitrag.ts.
//
// Aufbau nach Markus' Kritik "absolut unuebersichtlich" (10/2026): oben EINE
// Zeitraum-Leiste (Monat/Quartal/Jahr + Blaettern), dann vier Kennzahlen,
// dann EINE Terminliste, in der jede Zeile ihren DB-Balken und ihre
// Auslastung selbst traegt -- statt zwei Diagrammen plus zwei Tabellen, die
// man gegeneinander lesen musste.

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

const FARBE_SPARK = "#898781";
const FARBE_VERGANGEN = "#2a78d6";

const istKonferenz = (t: Termin) => (t.seminartypen?.name || "").toLowerCase().includes("konferenz");
const kurz = (t: Termin) => t.kennung || t.titel || "Termin";
const prozent = (teil: number, ganz: number) => (ganz > 0 ? Math.round((teil / ganz) * 100) : 0);

// ---------------------------------------------------------------------------
// Zeitraum-Leiste

const ARTEN: { art: ZeitraumArt; label: string }[] = [
  { art: "monat", label: "Monat" },
  { art: "quartal", label: "Quartal" },
  { art: "jahr", label: "Jahr" },
  { art: "frei", label: "Eigener Zeitraum" },
];

// Gemeinsam fuer die Reiter Uebersicht und Seminare; ohne seminartypen
// entfaellt die Chip-Zeile.
export function ZeitraumLeiste({
  ansicht = "seminare",
  zeitraum,
  heute,
  seminartypen,
  seminartypFilter,
}: {
  ansicht?: string;
  zeitraum: Zeitraum;
  heute: string;
  seminartypen?: { id: string; name: string }[];
  seminartypFilter?: string;
}) {
  const art = zeitraumArt(zeitraum);
  const typ = seminartypFilter ? `&seminartyp=${seminartypFilter}` : "";
  const link = (key: string, extra = typ) => `/dashboard?ansicht=${ansicht}&zeitraum=${key}${extra}`;
  // Beim Wechsel Monat/Quartal/Jahr bleibt man "in der Naehe": enthaelt der
  // Zeitraum heute, landet man in der Periode von heute, sonst an seinem Anfang.
  const enthaeltHeute = zeitraum.von <= heute && zeitraum.bis >= heute;
  const anker = enthaeltHeute ? heute : zeitraum.von;
  const artLink = (a: ZeitraumArt) =>
    a === "frei" ? `/dashboard?ansicht=${ansicht}&zeitraum=frei&von=${zeitraum.von}&bis=${zeitraum.bis}${typ}` : link(zeitraumKey(a, anker));
  const zustand = zeitraum.bis < heute ? "abgeschlossen" : zeitraum.von > heute ? "Vorschau" : "läuft";

  return (
    <div className="au-sz-leiste">
      <div className="au-sz-zeile-oben">
        <nav className="au-sz-raster" aria-label="Zeitraum-Raster">
          {ARTEN.map((a) => (
            <Link key={a.art} href={artLink(a.art)} className={a.art === art ? "aktiv" : ""} aria-current={a.art === art ? "true" : undefined} prefetch={false}>
              {a.label}
            </Link>
          ))}
        </nav>

        {art !== "frei" ? (
          <div className="au-sz-blaettern">
            <Link href={link(zeitraumNachbar(art, zeitraum.von, -1))} className="au-sz-pfeil" aria-label="Vorheriger Zeitraum" prefetch={false}>‹</Link>
            <div className="au-sz-titel">
              <strong>{art === "jahr" ? zeitraum.von.slice(0, 4) : zeitraum.titel}</strong>
              <span>{formatDatum(zeitraum.von)} – {formatDatum(zeitraum.bis)} · {zustand}</span>
            </div>
            <Link href={link(zeitraumNachbar(art, zeitraum.von, 1))} className="au-sz-pfeil" aria-label="Nächster Zeitraum" prefetch={false}>›</Link>
            {!enthaeltHeute && (
              <Link href={link(zeitraumKey(art, heute))} className="au-sz-heute" prefetch={false}>Heute</Link>
            )}
          </div>
        ) : (
          <form method="get" className="au-sz-frei">
            <input type="hidden" name="ansicht" value={ansicht} />
            <input type="hidden" name="zeitraum" value="frei" />
            {seminartypFilter && <input type="hidden" name="seminartyp" value={seminartypFilter} />}
            <input type="date" name="von" defaultValue={zeitraum.von} aria-label="von" className="au-input" />
            <span aria-hidden="true">–</span>
            <input type="date" name="bis" defaultValue={zeitraum.bis} aria-label="bis" className="au-input" />
            <button type="submit" className="au-btn au-btn-sm au-btn-primary">Anzeigen</button>
          </form>
        )}
      </div>

      {seminartypen && (
      <nav className="au-sz-filter" aria-label="Seminarart">
        {[{ id: "", name: "Alle Seminare" }, ...seminartypen].map((t) => {
          const aktiv = (seminartypFilter || "") === t.id;
          const mitTyp = t.id ? `&seminartyp=${t.id}` : "";
          const ziel = art === "frei" ? `/dashboard?ansicht=${ansicht}&zeitraum=frei&von=${zeitraum.von}&bis=${zeitraum.bis}${mitTyp}` : link(zeitraum.key, mitTyp);
          return (
            <Link key={t.id || "alle"} href={ziel} className={aktiv ? "aktiv" : ""} aria-current={aktiv ? "true" : undefined} prefetch={false}>
              {t.name}
            </Link>
          );
        })}
      </nav>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cockpit

export default async function SeminarCockpit({
  supabase,
  heute,
  zeitraum,
  seminartypFilter,
}: {
  supabase: any;
  heute: string;
  zeitraum: Zeitraum;
  seminartypFilter?: string;
}) {
  // Gewaehlter Zeitraum nach Termin-Beginn -- inkl. bereits gebuchter
  // kuenftiger Termine, plus Vorperiode fuer den Vergleich.
  const vp = vorperiode(zeitraum);
  let q = supabase
    .from("seminartermine")
    .select("id, kennung, titel, datum_start, datum_ende, kapazitaet, sondereffekt_notiz, seminartyp_id, seminartypen(name)")
    .gte("datum_start", vp.von)
    .lte("datum_start", zeitraum.bis)
    .neq("status", "abgesagt")
    .order("datum_start", { ascending: true });
  if (seminartypFilter) q = q.eq("seminartyp_id", seminartypFilter);
  const [{ data }, pauschale] = await Promise.all([q, ladeFremdkostenProPerson(supabase)]);
  const termine: Termin[] = data || [];
  const db = await berechneDeckungsbeitraege(supabase, termine.map((t) => t.id));
  const alle: Zeile[] = termine.map((t) => ({
    ...t,
    ...db.get(t.id)!,
    vergangen: (t.datum_ende || t.datum_start) < heute,
    istKonferenz: istKonferenz(t),
  }));
  const zeilen = alle.filter((z) => z.datum_start >= zeitraum.von && z.datum_start <= zeitraum.bis);
  const vorher = alle.filter((z) => z.datum_start >= vp.von && z.datum_start <= vp.bis);

  if (!zeilen.length) {
    return (
      <div className="au-sz-leer">
        <strong>Keine Termine in diesem Zeitraum.</strong>
        <span>Mit ‹ › weiterblättern oder ein anderes Raster wählen.</span>
      </div>
    );
  }

  const summe = (liste: Zeile[]) => ({
    db: liste.reduce((s, z) => s + z.db, 0),
    umsatz: liste.reduce((s, z) => s + z.umsatz, 0),
    unbezahlt: liste.reduce((s, z) => s + z.umsatzUnbezahlt, 0),
    kosten: liste.reduce((s, z) => s + z.fremdkosten, 0),
    anzahl: liste.length,
  });
  const gesamt = summe(zeilen);
  const durchgefuehrt = zeilen.filter((z) => z.vergangen);
  const anstehend = zeilen.filter((z) => !z.vergangen);
  const sDurch = summe(durchgefuehrt);
  const sAnst = summe(anstehend);
  const vorperiodeSumme = summe(vorher);
  const vorperiodeAktiv = vorher.some((z) => z.umsatz > 0);

  const seminare = zeilen.filter((z) => !z.istKonferenz);
  const konferenzen = zeilen.filter((z) => z.istKonferenz);
  const tn = seminare.reduce((s, z) => s + z.teilnehmer, 0);
  const plaetze = seminare.reduce((s, z) => s + (z.kapazitaet || 0), 0);
  const mitBeleg = zeilen.filter((z) => z.kostenQuelle === "beleg").length;

  const delta = vorperiodeAktiv && vorperiodeSumme.db !== 0 ? (gesamt.db - vorperiodeSumme.db) / Math.abs(vorperiodeSumme.db) : null;
  const pos = (v: number) => Math.max(0, v);
  const anteilDurch = pos(sDurch.db) + pos(sAnst.db) > 0 ? (pos(sDurch.db) / (pos(sDurch.db) + pos(sAnst.db))) * 100 : 0;

  return (
    <div className="au-sz">
      {/* Kennzahlen */}
      <div className="au-sz-kpis">
        <section className="au-sz-kpi au-sz-kpi-haupt">
          <div className="au-sz-kpi-kopf">
            <span>Deckungsbeitrag</span>
            {delta !== null ? (
              <span className={`au-sz-chip ${delta >= 0 ? "plus" : "minus"}`} title={`Vorperiode ${formatDatum(vp.von)} – ${formatDatum(vp.bis)}: ${formatEURGanz(vorperiodeSumme.db)}`}>
                {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))} % zur Vorperiode
              </span>
            ) : (
              <span className="au-sz-chip" title={`${formatDatum(vp.von)} – ${formatDatum(vp.bis)}`}>Vorperiode ohne Daten</span>
            )}
          </div>
          <div className="au-sz-kpi-wert gross">{formatEURGanz(gesamt.db)}</div>
          {pos(sDurch.db) + pos(sAnst.db) > 0 && (
            <div className="au-sz-stapel" aria-hidden="true">
              {anteilDurch > 0 && <span style={{ width: `${anteilDurch}%` }} className="durch" />}
              {anteilDurch < 100 && <span style={{ width: `${100 - anteilDurch}%` }} className="anst" />}
            </div>
          )}
          <div className="au-sz-legende">
            <span><i className="durch" />{formatEURGanz(sDurch.db)} durchgeführt <em>· {sDurch.anzahl}</em></span>
            <span><i className="anst" />{formatEURGanz(sAnst.db)} gebucht, steht aus <em>· {sAnst.anzahl}</em></span>
          </div>
        </section>

        <section className="au-sz-kpi">
          <div className="au-sz-kpi-kopf"><span>Umsatz</span></div>
          <div className="au-sz-kpi-wert">{formatEURGanz(gesamt.umsatz)}</div>
          <div className="au-sz-kpi-sub">{gesamt.unbezahlt > 0 ? `davon ${formatEURGanz(gesamt.unbezahlt)} noch unbezahlt` : "alles bezahlt"}</div>
          {konferenzen.length > 0 && <div className="au-sz-kpi-sub">inkl. Konferenz {formatEURGanz(konferenzen.reduce((s, z) => s + z.umsatz, 0))}</div>}
        </section>

        <section className="au-sz-kpi">
          <div className="au-sz-kpi-kopf"><span>Fremdkosten</span></div>
          <div className="au-sz-kpi-wert">{formatEURGanz(gesamt.kosten)}</div>
          <div className="au-sz-kpi-sub">
            {mitBeleg === zeilen.length ? "alle aus Hotelrechnungen" : mitBeleg ? `${mitBeleg} von ${zeilen.length} Terminen aus Hotelrechnung, Rest geschätzt` : "geschätzt (Pauschalen)"}
          </div>
        </section>

        <section className="au-sz-kpi">
          <div className="au-sz-kpi-kopf"><span>Teilnehmer Seminare</span></div>
          <div className="au-sz-kpi-wert">
            {tn}
            <small> / {plaetze} Plätze</small>
          </div>
          {plaetze > 0 && <div className="au-sz-mini breit" aria-hidden="true"><span style={{ width: `${Math.min(100, prozent(tn, plaetze))}%` }} /></div>}
          <div className="au-sz-kpi-sub">
            {prozent(tn, plaetze)} % ausgelastet · ohne Konferenz
            {konferenzen.length > 0 && ` (+${konferenzen.reduce((s, z) => s + z.teilnehmer, 0)})`}
          </div>
        </section>
      </div>

      {/* Terminliste */}
      <section className="au-sz-karte">
        <header className="au-sz-karte-kopf">
          <h3>Termine</h3>
          <span>{zeilen.length} im Zeitraum · Klick öffnet den Termin</span>
        </header>
        <TerminListe
          gruppen={[
            { titel: "Durchgeführt", zeilen: durchgefuehrt, summe: sDurch },
            { titel: "Gebucht, Termin steht aus", zeilen: anstehend, summe: sAnst },
          ]}
        />
      </section>

      {!seminartypFilter && <NachArt zeilen={zeilen} zeitraum={zeitraum} />}

      <details className="au-sz-erklaerung">
        <summary>Wie wird gerechnet?</summary>
        <p>
          Zeitraum nach Termin-Beginn; künftige Termine mit dem heutigen Buchungsstand. Deckungsbeitrag = Umsatz − Fremdkosten pro Person vor Ort: Teilnehmer
          (inkl. Freiplätze) nach ihrer Option, Referenten/Mitarbeiter nach dem Personal-Satz des Termins, sonst Pauschale {formatEURGanz(pauschale)} netto (
          <Link href="/einstellungen" prefetch={false}>einstellbar</Link>). Liegt eine Hotelrechnung vor (✓), zählen deren echte Kosten. Ein Termin ohne gebuchte
          Teilnehmer hat keine Kosten. Personen nur aus den Pipedrive-Altdaten zählen nicht; Stornos ausgeschlossen, unbezahlte Buchungen enthalten. Vorperiode:{" "}
          {formatDatum(vp.von)} – {formatDatum(vp.bis)}. Alle Beträge netto.
        </p>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminliste: eine Zeile pro Termin mit Auslastung und DB-Balken.

function TerminListe({ gruppen }: { gruppen: { titel: string; zeilen: Zeile[]; summe: { db: number; anzahl: number } }[] }) {
  const maxAbs = Math.max(1, ...gruppen.flatMap((g) => g.zeilen).map((z) => Math.abs(z.db)));
  return (
    <div className="au-sz-liste">
      <div className="au-sz-spalten" aria-hidden="true">
        <span>Termin</span>
        <span>Auslastung</span>
        <span className="r">Umsatz</span>
        <span className="r">Fremdkosten</span>
        <span>Deckungsbeitrag</span>
      </div>
      {gruppen.map((g) =>
        g.zeilen.length ? (
          <div key={g.titel}>
            <div className="au-sz-gruppe">
              <span>{g.titel} <em>· {g.summe.anzahl}</em></span>
              <span>DB {formatEURGanz(g.summe.db)}</span>
            </div>
            {g.zeilen.map((z) => <TerminZeile key={z.id} z={z} maxAbs={maxAbs} />)}
          </div>
        ) : null
      )}
    </div>
  );
}

function TerminZeile({ z, maxAbs }: { z: Zeile; maxAbs: number }) {
  const d = new Date(z.datum_start + "T00:00:00Z");
  const quote = z.kapazitaet ? Math.min(100, prozent(z.teilnehmer, z.kapazitaet)) : 0;
  const leer = !z.vergangen && z.teilnehmer === 0 && z.umsatz === 0;
  const klasse = z.sondereffekt_notiz ? "sonder" : z.db < 0 ? "minus" : z.vergangen ? "durch" : "anst";
  return (
    <Link href={`/termine/${z.id}`} className={`au-sz-zeile${leer ? " leer" : ""}`} prefetch={false}>
      <span className="au-sz-termin">
        <span className="au-sz-datum">
          <b>{d.getUTCDate()}</b>
          <small>{MONATSNAMEN[d.getUTCMonth()].slice(0, 3)} {String(d.getUTCFullYear()).slice(2)}</small>
        </span>
        <span className="au-sz-name">
          <b>
            {kurz(z)}
            {z.istKonferenz && <em className="au-sz-tag">Konferenz</em>}
          </b>
          <small>{z.seminartypen?.name || z.titel}</small>
          {z.sondereffekt_notiz && <small className="au-sz-sonder">⚑ {z.sondereffekt_notiz}</small>}
        </span>
      </span>
      <span className="au-sz-ausl">
        <span className="au-sz-mini"><span style={{ width: `${quote}%` }} /></span>
        <small>{z.teilnehmer}{z.kapazitaet ? ` / ${z.kapazitaet}` : ""} TN</small>
      </span>
      <span className="au-sz-betrag">
        <span className="au-sz-mlabel">Umsatz</span>
        <b>{formatEURGanz(z.umsatz)}</b>
        {z.umsatzUnbezahlt > 0 && <small className="offen">{formatEURGanz(z.umsatzUnbezahlt)} offen</small>}
      </span>
      <span className="au-sz-betrag gedimmt">
        <span className="au-sz-mlabel">Fremdkosten</span>
        <b>{formatEURGanz(z.fremdkosten)}</b>
        {!leer && <small>{z.kostenQuelle === "beleg" ? "✓ Hotelrechnung" : "geschätzt"}</small>}
      </span>
      <span className="au-sz-db">
        {leer ? (
          <span className="au-sz-db-leer">noch keine Buchung</span>
        ) : (
          <>
            <span className="au-sz-db-spur"><span className={klasse} style={{ width: `${Math.max(2, (Math.abs(z.db) / maxAbs) * 100)}%` }} /></span>
            <b className={z.db < 0 ? "minus" : ""}>{formatEURGanz(z.db)}</b>
          </>
        )}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Verdichtung nach Seminarart; Klick filtert.

function NachArt({ zeilen, zeitraum }: { zeilen: Zeile[]; zeitraum: Zeitraum }) {
  const gruppen = new Map<string, { id: string; name: string; zeilen: Zeile[] }>();
  zeilen.forEach((z) => {
    const id = z.seminartyp_id || "";
    if (!gruppen.has(id)) gruppen.set(id, { id, name: z.seminartypen?.name || "Ohne Seminarart", zeilen: [] });
    gruppen.get(id)!.zeilen.push(z);
  });
  if (gruppen.size < 2) return null;
  const liste = [...gruppen.values()]
    .map((g) => ({
      ...g,
      db: g.zeilen.reduce((s, z) => s + z.db, 0),
      umsatz: g.zeilen.reduce((s, z) => s + z.umsatz, 0),
      tn: g.zeilen.reduce((s, z) => s + z.teilnehmer, 0),
      plaetze: g.zeilen.reduce((s, z) => s + (z.kapazitaet || 0), 0),
    }))
    .sort((a, b) => b.db - a.db);
  const max = Math.max(1, ...liste.map((g) => Math.abs(g.db)));
  const basis = zeitraum.key === "frei" ? `zeitraum=frei&von=${zeitraum.von}&bis=${zeitraum.bis}` : `zeitraum=${zeitraum.key}`;
  return (
    <section className="au-sz-karte">
      <header className="au-sz-karte-kopf">
        <h3>Nach Seminarart</h3>
        <span>Klick filtert</span>
      </header>
      <div className="au-sz-artliste">
        {liste.map((g) => (
          <Link key={g.id || "ohne"} href={`/dashboard?ansicht=seminare&${basis}${g.id ? `&seminartyp=${g.id}` : ""}`} className="au-sz-art" prefetch={false}>
            <span className="au-sz-name">
              <b>{g.name}</b>
              <small>
                {g.zeilen.length} Termin{g.zeilen.length === 1 ? "" : "e"} · {g.tn}{g.plaetze ? ` / ${g.plaetze}` : ""} TN · Umsatz {formatEURGanz(g.umsatz)}
              </small>
            </span>
            <span className="au-sz-db">
              <span className="au-sz-db-spur"><span className={g.db < 0 ? "minus" : "durch"} style={{ width: `${Math.max(2, (Math.abs(g.db) / max) * 100)}%` }} /></span>
              <b className={g.db < 0 ? "minus" : ""}>{formatEURGanz(g.db)}</b>
            </span>
          </Link>
        ))}
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
