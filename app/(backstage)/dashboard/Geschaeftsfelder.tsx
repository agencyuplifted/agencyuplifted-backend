import Link from "next/link";
import { berechneDeckungsbeitraege } from "@/lib/deckungsbeitrag";
import { formatEURGanz, formatDatum } from "@/lib/format";
import { zeitraumAus, monatKurz } from "@/lib/zeitraeume";
import { Sparkline } from "./SeminarCockpit";

// Geschaeftsfelder auf der Dashboard-Uebersicht, rollierend 12 Monate.
//
// GEGEN DOPPELZAEHLUNG: Seminarumsatz kommt aus dem eigenen Buchungssystem
// (gleiche Rechnung wie Reiter "Seminare"). Die FastBill-Kategorie "Seminar"
// (schluessel 'seminar') sind dieselben Rechnungen aus anderer Quelle und
// werden hier NIE aufaddiert. Alle anderen Kategorien kommen live aus
// fastbill_kategorien -- keine Liste im Code.

// Kategoriale Farben in fester Reihenfolge (Referenzpalette dataviz, Light),
// Seminare immer Slot 1. "Noch unklar" ist neutral, kein Kategorie-Farbton.
const FARBEN = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const FARBE_UNKLAR = "#d3d1c7";
const UNKLAR = "unklar";

const tagMinus = (iso: string, tage: number) => new Date(Date.parse(iso) - tage * 86400000).toISOString().slice(0, 10);
const MS_TAG = 86400000;
const isoTag = (d: Date) => d.toISOString().slice(0, 10);

// Verlauf fuer die Sparklines: bis ~3 Monate pro Woche, darueber pro Monat --
// 12 Monatswerte ergaben bei "Dieser Monat" keinen Sinn.
function verlaufsAbschnitte(von: string, bis: string) {
  const tage = (Date.parse(bis) - Date.parse(von)) / MS_TAG + 1;
  if (tage <= 100) {
    const abschnitte: { von: string; bis: string }[] = [];
    for (let t = Date.parse(von); t <= Date.parse(bis); t += 7 * MS_TAG) {
      const ende = Math.min(t + 6 * MS_TAG, Date.parse(bis));
      abschnitte.push({ von: isoTag(new Date(t)), bis: isoTag(new Date(ende)) });
    }
    return { art: "Woche" as const, abschnitte };
  }
  const abschnitte: { von: string; bis: string }[] = [];
  let d = new Date(Date.UTC(Number(von.slice(0, 4)), Number(von.slice(5, 7)) - 1, 1));
  while (isoTag(d) <= bis) {
    const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    abschnitte.push({ von: isoTag(d) < von ? von : isoTag(d), bis: isoTag(new Date(n.getTime() - MS_TAG)) > bis ? bis : isoTag(new Date(n.getTime() - MS_TAG)) });
    d = n;
  }
  return { art: "Monat" as const, abschnitte };
}

export default async function Geschaeftsfelder({
  supabase,
  heute,
  zeitraum: zeitraumParam,
  vonParam,
  bisParam,
}: {
  supabase: any;
  heute: string;
  zeitraum?: string;
  vonParam?: string;
  bisParam?: string;
}) {
  const zr = zeitraumAus(zeitraumParam, heute, { vonParam, bisParam, kappenBisHeute: true });
  const { von, bis } = zr;
  const aktuellesJahr = Number(heute.slice(0, 4));
  const auswahl = [
    { key: "monat", label: "Dieser Monat" },
    { key: "vormonat", label: "Vormonat" },
    { key: "3m", label: "Letzte 3 Monate" },
    { key: "quartal", label: "Quartal" },
    { key: "12m", label: "Letzte 12 Monate" },
    { key: String(aktuellesJahr), label: String(aktuellesJahr) },
    { key: String(aktuellesJahr - 1), label: String(aktuellesJahr - 1) },
  ];
  const [{ data: kategorien }, { data: rechnungen }, { data: termine }, { data: fbStand }, { data: naechster }] = await Promise.all([
    supabase.from("fastbill_kategorien").select("id, name, schluessel, reihenfolge").order("reihenfolge").order("name"),
    supabase.from("fastbill_rechnungen").select("kategorie, betrag_netto, rechnungsdatum").gte("rechnungsdatum", von).lte("rechnungsdatum", bis),
    supabase.from("seminartermine").select("id, datum_start").gte("datum_start", von).lte("datum_start", bis).neq("status", "abgesagt"),
    supabase.from("fastbill_rechnungen").select("rechnungsdatum").order("rechnungsdatum", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("seminartermine").select("kennung, titel, datum_start").gt("datum_start", bis).neq("status", "abgesagt").order("datum_start").limit(1).maybeSingle(),
  ]);
  // Stand der FastBill-Daten: Liegt der Zeitraum (teils) nach dem letzten
  // Import, fehlen dort Rechnungen -- sonst sieht "0 €" wie ein Fehler aus.
  const fastbillBis: string | null = (fbStand as any)?.rechnungsdatum || null;
  const fastbillLuecke = !!fastbillBis && bis > fastbillBis;

  const { art, abschnitte } = verlaufsAbschnitte(von, bis);
  const verlauf =
    art === "Monat"
      ? `Verlauf pro Monat, ${monatKurz(abschnitte[0].von.slice(0, 7))} – ${monatKurz(abschnitte[abschnitte.length - 1].von.slice(0, 7))}`
      : `Verlauf pro Woche, ${formatDatum(von).slice(0, 6)} – ${formatDatum(bis).slice(0, 6)}`;
  const proMonat = (eintraege: { datum: string; betrag: number }[]) =>
    abschnitte.map((a) => eintraege.filter((e) => e.datum >= a.von && e.datum <= a.bis).reduce((s, e) => s + e.betrag, 0));

  // Seminare: bestehende Berechnung (lib/deckungsbeitrag.ts)
  const db = await berechneDeckungsbeitraege(supabase, (termine || []).map((t: any) => t.id));
  const seminarEintraege = (termine || []).map((t: any) => ({ datum: t.datum_start as string, betrag: db.get(t.id)?.umsatz || 0 }));
  const seminarSumme = seminarEintraege.reduce((s: number, e: any) => s + e.betrag, 0);

  const seminarName = (kategorien || []).find((k: any) => k.schluessel === "seminar")?.name;
  type Feld = { name: string; summe: number; anzahl: number; monate: number[] };
  const felder: Feld[] = (kategorien || [])
    .filter((k: any) => k.schluessel !== "seminar")
    .map((k: any): Feld => {
      const eintraege = (rechnungen || [])
        .filter((r: any) => r.kategorie === k.name)
        .map((r: any) => ({ datum: r.rechnungsdatum as string, betrag: Number(r.betrag_netto || 0) }));
      return { name: k.name as string, summe: eintraege.reduce((s: number, e: any) => s + e.betrag, 0), anzahl: eintraege.length, monate: proMonat(eintraege) };
    });
  const unklar = (rechnungen || []).filter((r: any) => !r.kategorie || r.kategorie === UNKLAR);
  const unklarSumme = unklar.reduce((s: number, r: any) => s + Number(r.betrag_netto || 0), 0);
  const gesamt = seminarSumme + felder.reduce((s, f) => s + f.summe, 0);

  const segmente = [
    { name: "Seminare", summe: seminarSumme, farbe: FARBEN[0] },
    ...felder.map((f, i) => ({ name: f.name, summe: f.summe, farbe: FARBEN[(i + 1) % FARBEN.length] })),
    { name: "Noch unklar", summe: unklarSumme, farbe: FARBE_UNKLAR },
  ];
  const balkenSumme = segmente.reduce((s, x) => s + Math.max(0, x.summe), 0);

  return (
    <section className="au-panel au-panel-breit au-gf">
      <div className="au-panel-kopf">
        <h2>Umsatz nach Geschäftsfeldern</h2>
        <nav className="au-gf-zeitraum" aria-label="Zeitraum wählen">
          {auswahl.map((a) => (
            <Link
              key={a.key}
              href={`/dashboard?ansicht=uebersicht${a.key === "12m" ? "" : `&zeitraum=${a.key}`}`}
              className={a.key === zr.key ? "aktiv" : ""}
              aria-current={a.key === zr.key ? "true" : undefined}
              prefetch={false}
            >
              {a.label}
            </Link>
          ))}
        </nav>
        <form method="get" className="au-gf-frei" aria-label="Freien Zeitraum wählen">
          <input type="hidden" name="ansicht" value="uebersicht" />
          <input type="hidden" name="zeitraum" value="frei" />
          <input type="date" name="von" defaultValue={zr.von} aria-label="von" className="au-input" required />
          <span aria-hidden="true">–</span>
          <input type="date" name="bis" defaultValue={zr.bis} aria-label="bis" className="au-input" required />
          <button type="submit" className={`au-btn au-btn-sm ${zr.key === "frei" ? "au-btn-primary" : "au-btn-secondary"}`}>Anzeigen</button>
        </form>
      </div>
      <div className="au-panel-inhalt">
      <div className="au-gf-kopf">
        <div>
          <div className="au-cockpit-label">
            Umsatz netto · {zr.titel} · <strong>{formatDatum(von)} – {formatDatum(bis)}</strong>
            {zr.laufend && zr.key !== "12m" ? " (bis heute)" : ""}
          </div>
          <div className="au-cockpit-zahl">{formatEURGanz(gesamt)}</div>
          <div className="au-cockpit-kontext">
            Seminare: Termine mit Beginn im Zeitraum, aus dem Buchungssystem · übrige Geschäftsfelder: zugeordnete FastBill-Rechnungen nach Rechnungsdatum
            {seminarName ? ` (FastBill-Kategorie „${seminarName}“ nicht mitgezählt, sonst doppelt)` : ""}
          </div>
          {gesamt === 0 && (
            <div className="au-gf-hinweis">
              Im Zeitraum gibt es noch keinen Umsatz: Seminare zählen ab Termin-Beginn
              {naechster ? ` (nächstes: ${(naechster as any).kennung || (naechster as any).titel} am ${formatDatum((naechster as any).datum_start)})` : ""}
              {fastbillLuecke ? ", FastBill-Rechnungen sind für diesen Zeitraum noch nicht importiert." : "."}
            </div>
          )}
          {fastbillLuecke && (
            <div className="au-gf-hinweis">
              FastBill-Rechnungen sind bis <strong>{formatDatum(fastbillBis!)}</strong> importiert – danach fehlen sie hier noch.{" "}
              <Link href="/buchungen/fastbill" prefetch={false}>Jetzt importieren →</Link>
            </div>
          )}
          {unklarSumme > 0 && (
            <div className="au-cockpit-vergleich">
              Nicht enthalten: {formatEURGanz(unklarSumme)} aus noch nicht zugeordneten Rechnungen im selben Zeitraum ·{" "}
              <Link href="/buchungen/fastbill/kategorisieren" prefetch={false}>jetzt kategorisieren →</Link>
            </div>
          )}
        </div>
      </div>

      <div className="au-gf-karten">
        <div className="au-gf-karte">
          <div className="au-cockpit-label"><span className="au-gf-punkt" style={{ background: FARBEN[0] }} /> Seminare</div>
          <div className="au-gf-zahl">{formatEURGanz(seminarSumme)}</div>
          {abschnitte.length >= 2 && <Sparkline werte={proMonat(seminarEintraege)} farbe={FARBEN[0]} />}
          <div className="au-klein">{verlauf} · Termine nach Beginn</div>
        </div>
        {felder.map((f, i) =>
          f.anzahl === 0 ? (
            <div key={f.name} className="au-gf-karte leer">
              <div className="au-cockpit-label"><span className="au-gf-punkt" style={{ background: FARBEN[(i + 1) % FARBEN.length] }} /> {f.name}</div>
              <div className="au-gf-zahl">—</div>
              <div className="au-klein">keine zugeordneten Rechnungen im Zeitraum</div>
            </div>
          ) : (
            <div key={f.name} className="au-gf-karte">
              <div className="au-cockpit-label"><span className="au-gf-punkt" style={{ background: FARBEN[(i + 1) % FARBEN.length] }} /> {f.name}</div>
              <div className="au-gf-zahl">{formatEURGanz(f.summe)}</div>
              {abschnitte.length >= 2 && <Sparkline werte={f.monate} farbe={FARBEN[(i + 1) % FARBEN.length]} />}
              <div className="au-klein">{verlauf} · {f.anzahl} Rechnung{f.anzahl === 1 ? "" : "en"}</div>
            </div>
          )
        )}
        <Link href="/buchungen/fastbill/kategorisieren" prefetch={false} className="au-gf-karte unklar">
          <div className="au-cockpit-label">Noch unklar</div>
          <div className="au-gf-zahl">{formatEURGanz(unklarSumme)}</div>
          <div className="au-klein">{unklar.length} Rechnung{unklar.length === 1 ? "" : "en"} · → jetzt kategorisieren</div>
        </Link>
      </div>

      {balkenSumme > 0 && (
        <>
          <div className="au-gf-balken" role="img" aria-label="Anteile der Geschäftsfelder am Umsatz">
            {segmente
              .filter((s) => s.summe > 0)
              .map((s) => (
                <span
                  key={s.name}
                  title={`${s.name}: ${formatEURGanz(s.summe)} (${Math.round((s.summe / balkenSumme) * 100)} %)`}
                  style={{ flexGrow: s.summe, background: s.farbe }}
                />
              ))}
          </div>
          <ul className="au-gf-legende">
            {segmente.map((s) => (
              <li key={s.name}>
                <span className="au-gf-punkt" style={{ background: s.farbe }} />
                {s.name} <strong>{formatEURGanz(s.summe)}</strong>
                {balkenSumme > 0 && <span className="au-klein"> · {Math.round((Math.max(0, s.summe) / balkenSumme) * 100)} %</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      </div>
    </section>
  );
}
