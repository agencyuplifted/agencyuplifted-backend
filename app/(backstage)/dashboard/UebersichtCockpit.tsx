import Link from "next/link";
import { berechneDeckungsbeitraege } from "@/lib/deckungsbeitrag";
import { formatEURGanz, formatDatum, MONATSNAMEN } from "@/lib/format";
import { monatKurz, type Zeitraum } from "@/lib/zeitraeume";
import { Sparkline } from "./SeminarCockpit";

// Dashboard-Uebersicht: Kennzahlen + Umsatz nach Geschaeftsfeldern + naechste
// Seminare, alles fuer EINEN Zeitraum aus der gemeinsamen Zeitraum-Leiste.
// Vorher hatten die Kacheln (Kalenderjahr) und die Geschaeftsfelder (bis
// heute gekappt) verschiedene Zeitraeume -- dieselbe Seite zeigte zwei
// verschiedene Seminarumsaetze (Markus 10/2026). Jetzt gilt ueberall:
// Seminare = Termine mit Beginn im Zeitraum inkl. bereits gebuchter
// kuenftiger (wie Reiter Seminare), FastBill = Rechnungen nach Datum.
//
// GEGEN DOPPELZAEHLUNG: Die FastBill-Kategorie mit schluessel 'seminar' sind
// dieselben Rechnungen wie die Buchungen und werden NIE aufaddiert. Alle
// anderen Kategorien kommen live aus fastbill_kategorien -- keine Liste im Code.

// Kategoriale Farben in fester Reihenfolge (Referenzpalette dataviz, Light),
// Seminare immer Slot 1. "Noch unklar" ist neutral, kein Kategorie-Farbton.
const FARBEN = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const FARBE_UNKLAR = "#d3d1c7";
const UNKLAR = "unklar";
const MS_TAG = 86400000;
const isoTag = (d: Date) => d.toISOString().slice(0, 10);
const prozent = (teil: number, ganz: number) => (ganz > 0 ? Math.round((teil / ganz) * 100) : 0);

// Verlauf fuer die Sparklines: bis ~3 Monate pro Woche, darueber pro Monat.
function verlaufsAbschnitte(von: string, bis: string) {
  const tage = (Date.parse(bis) - Date.parse(von)) / MS_TAG + 1;
  const abschnitte: { von: string; bis: string }[] = [];
  if (tage <= 100) {
    for (let t = Date.parse(von); t <= Date.parse(bis); t += 7 * MS_TAG) {
      abschnitte.push({ von: isoTag(new Date(t)), bis: isoTag(new Date(Math.min(t + 6 * MS_TAG, Date.parse(bis)))) });
    }
    return { art: "Woche" as const, abschnitte };
  }
  let d = new Date(Date.UTC(Number(von.slice(0, 4)), Number(von.slice(5, 7)) - 1, 1));
  while (isoTag(d) <= bis) {
    const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const ende = isoTag(new Date(n.getTime() - MS_TAG));
    abschnitte.push({ von: isoTag(d) < von ? von : isoTag(d), bis: ende > bis ? bis : ende });
    d = n;
  }
  return { art: "Monat" as const, abschnitte };
}

export default async function UebersichtCockpit({ supabase, heute, zeitraum }: { supabase: any; heute: string; zeitraum: Zeitraum }) {
  const { von, bis } = zeitraum;
  const [{ data: kategorien }, { data: rechnungen }, { data: termine }, { data: fbStand }, { data: offen }, { data: naechste }] = await Promise.all([
    supabase.from("fastbill_kategorien").select("id, name, schluessel, reihenfolge").order("reihenfolge").order("name"),
    supabase.from("fastbill_rechnungen").select("kategorie, betrag_netto, rechnungsdatum").gte("rechnungsdatum", von).lte("rechnungsdatum", bis),
    supabase.from("seminartermine").select("id, datum_start, datum_ende, kapazitaet, seminartypen(name)").gte("datum_start", von).lte("datum_start", bis).neq("status", "abgesagt"),
    supabase.from("fastbill_rechnungen").select("rechnungsdatum").order("rechnungsdatum", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("buchungspositionen").select("buchung_id, preis, buchungen!inner(status)").eq("buchungen.status", "angefragt"),
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, kapazitaet, format, seminartypen(name), veranstaltungsorte(name, ort)")
      .gte("datum_start", heute)
      .in("status", ["geplant", "bestaetigt", "unterbesetzt"])
      .order("datum_start", { ascending: true })
      .limit(5),
  ]);
  const terminIds = (termine || []).map((t: any) => t.id);
  const naechsteIds = (naechste || []).map((t: any) => t.id).filter((id: string) => !terminIds.includes(id));
  const db = await berechneDeckungsbeitraege(supabase, [...terminIds, ...naechsteIds]);

  // Stand der FastBill-Daten: Liegt der Zeitraum (teils) nach dem letzten
  // Import, fehlen dort Rechnungen -- sonst sieht "0 €" wie ein Fehler aus.
  const fastbillBis: string | null = (fbStand as any)?.rechnungsdatum || null;
  const fastbillLuecke = !!fastbillBis && fastbillBis < (bis < heute ? bis : heute);

  const { art, abschnitte } = verlaufsAbschnitte(von, bis);
  const verteile = (eintraege: { datum: string; betrag: number }[]) =>
    abschnitte.map((a) => eintraege.filter((e) => e.datum >= a.von && e.datum <= a.bis).reduce((s, e) => s + e.betrag, 0));

  // Seminare (Buchungssystem)
  let durchgefuehrt = 0, gebucht = 0, tn = 0, plaetze = 0, konferenzTn = 0;
  const seminarEintraege: { datum: string; betrag: number }[] = [];
  (termine || []).forEach((t: any) => {
    const d = db.get(t.id);
    if (!d) return;
    if ((t.datum_ende || t.datum_start) < heute) durchgefuehrt += d.umsatz;
    else gebucht += d.umsatz;
    seminarEintraege.push({ datum: t.datum_start, betrag: d.umsatz });
    if ((t.seminartypen?.name || "").toLowerCase().includes("konferenz")) konferenzTn += d.teilnehmer;
    else {
      tn += d.teilnehmer;
      plaetze += Number(t.kapazitaet) || 0;
    }
  });
  const seminarSumme = durchgefuehrt + gebucht;

  // Uebrige Geschaeftsfelder (FastBill, ohne Seminar-Kategorie)
  type Feld = { name: string; summe: number; anzahl: number; verlauf: number[]; farbe: string };
  const felder: Feld[] = (kategorien || [])
    .filter((k: any) => k.schluessel !== "seminar")
    .map((k: any, i: number): Feld => {
      const eintraege = (rechnungen || [])
        .filter((r: any) => r.kategorie === k.name)
        .map((r: any) => ({ datum: r.rechnungsdatum as string, betrag: Number(r.betrag_netto || 0) }));
      return {
        name: k.name,
        summe: eintraege.reduce((s: number, e: any) => s + e.betrag, 0),
        anzahl: eintraege.length,
        verlauf: verteile(eintraege),
        farbe: FARBEN[(i + 1) % FARBEN.length],
      };
    });
  const unklar = (rechnungen || []).filter((r: any) => !r.kategorie || r.kategorie === UNKLAR);
  const unklarSumme = unklar.reduce((s: number, r: any) => s + Number(r.betrag_netto || 0), 0);
  const weitere = felder.reduce((s, f) => s + f.summe, 0);
  const gesamt = seminarSumme + weitere;
  const offenSumme = (offen || []).reduce((s: number, p: any) => s + Number(p.preis || 0), 0);
  const offenAnzahl = new Set((offen || []).map((p: any) => p.buchung_id)).size;

  const zeilen = [
    { name: "Seminare", summe: seminarSumme, farbe: FARBEN[0], verlauf: verteile(seminarEintraege), sub: `${(termine || []).length} Termine · ${formatEURGanz(gebucht)} davon gebucht, steht aus`, href: `/dashboard?ansicht=seminare&zeitraum=${zeitraum.key}${zeitraum.key === "frei" ? `&von=${von}&bis=${bis}` : ""}` },
    ...felder
      .filter((f) => f.anzahl > 0)
      .map((f) => ({ name: f.name, summe: f.summe, farbe: f.farbe, verlauf: f.verlauf, sub: `${f.anzahl} Rechnung${f.anzahl === 1 ? "" : "en"}`, href: "/buchungen/fastbill" })),
  ].sort((a, b) => b.summe - a.summe);
  const ohneUmsatz = felder.filter((f) => f.anzahl === 0).map((f) => f.name);
  const max = Math.max(1, ...zeilen.map((z) => z.summe), unklarSumme);
  const verlaufText = art === "Monat" ? `pro Monat, ${monatKurz(abschnitte[0].von.slice(0, 7))} – ${monatKurz(abschnitte[abschnitte.length - 1].von.slice(0, 7))}` : "pro Woche";

  return (
    <div className="au-sz">
      <div className="au-sz-kpis">
        <section className="au-sz-kpi au-sz-kpi-haupt">
          <div className="au-sz-kpi-kopf">
            <span>Umsatz gesamt</span>
            {unklarSumme > 0 && (
              <Link href="/buchungen/fastbill/kategorisieren" className="au-sz-chip warn" prefetch={false} title="Noch nicht zugeordnete FastBill-Rechnungen im Zeitraum">
                + {formatEURGanz(unklarSumme)} noch unklar →
              </Link>
            )}
          </div>
          <div className="au-sz-kpi-wert gross">{formatEURGanz(gesamt)}</div>
          {gesamt > 0 && (
            <div className="au-sz-stapel" aria-hidden="true">
              {zeilen.filter((z) => z.summe > 0).map((z) => <span key={z.name} style={{ flexGrow: z.summe, background: z.farbe }} title={`${z.name}: ${formatEURGanz(z.summe)}`} />)}
            </div>
          )}
          <div className="au-sz-legende">
            {zeilen.filter((z) => z.summe > 0).map((z) => (
              <span key={z.name}><i style={{ background: z.farbe }} />{z.name} <em>· {prozent(z.summe, gesamt)} %</em></span>
            ))}
          </div>
        </section>

        <Link href={zeilen.find((z) => z.name === "Seminare")!.href} className="au-sz-kpi au-sz-kpi-link" prefetch={false}>
          <div className="au-sz-kpi-kopf"><span>Umsatz Seminare</span><span className="au-sz-pfeil-klein">→</span></div>
          <div className="au-sz-kpi-wert">{formatEURGanz(seminarSumme)}</div>
          <div className="au-sz-kpi-sub">{formatEURGanz(durchgefuehrt)} durchgeführt</div>
          <div className="au-sz-kpi-sub">{formatEURGanz(gebucht)} gebucht, steht aus</div>
        </Link>

        <Link href="/termine" className="au-sz-kpi au-sz-kpi-link" prefetch={false}>
          <div className="au-sz-kpi-kopf"><span>Teilnehmer Seminare</span><span className="au-sz-pfeil-klein">→</span></div>
          <div className="au-sz-kpi-wert">{tn}<small> / {plaetze} Plätze</small></div>
          {plaetze > 0 && <div className="au-sz-mini breit" aria-hidden="true"><span style={{ width: `${Math.min(100, prozent(tn, plaetze))}%` }} /></div>}
          <div className="au-sz-kpi-sub">{prozent(tn, plaetze)} % ausgelastet · ohne Konferenz{konferenzTn ? ` (+${konferenzTn})` : ""}</div>
        </Link>

        <Link href="/buchungen" className="au-sz-kpi au-sz-kpi-link" prefetch={false}>
          <div className="au-sz-kpi-kopf"><span>Offene Zahlungen</span><span className="au-sz-chip">aktuell</span></div>
          <div className="au-sz-kpi-wert">{formatEURGanz(offenSumme)}</div>
          <div className="au-sz-kpi-sub">{offenAnzahl ? `${offenAnzahl} Buchung${offenAnzahl === 1 ? "" : "en"} angefragt, noch nicht bezahlt` : "alles bezahlt"}</div>
        </Link>
      </div>

      <section className="au-sz-karte">
        <header className="au-sz-karte-kopf">
          <h3>Umsatz nach Geschäftsfeldern</h3>
          <span>
            Verlauf {verlaufText} · FastBill bis {fastbillBis ? formatDatum(fastbillBis) : "—"}
            {fastbillLuecke && <> · <Link href="/buchungen/fastbill" prefetch={false}>jetzt importieren</Link></>}
          </span>
        </header>
        <div className="au-sz-artliste">
          {zeilen.map((z) => (
            <Link key={z.name} href={z.href} className="au-ue-feld" prefetch={false}>
              <span className="au-sz-name">
                <b><i className="au-ue-punkt" style={{ background: z.farbe }} />{z.name}</b>
                <small>{z.sub}</small>
              </span>
              <span className="au-ue-spark">{abschnitte.length >= 2 && z.verlauf.some((v) => v) ? <Sparkline werte={z.verlauf} farbe={z.farbe} /> : null}</span>
              <span className="au-sz-db">
                <span className="au-sz-db-spur"><span style={{ width: `${Math.max(1, (z.summe / max) * 100)}%`, background: z.farbe }} /></span>
                <b>{formatEURGanz(z.summe)}</b>
              </span>
            </Link>
          ))}
          {unklarSumme > 0 && (
            <Link href="/buchungen/fastbill/kategorisieren" className="au-ue-feld unklar" prefetch={false}>
              <span className="au-sz-name">
                <b><i className="au-ue-punkt" style={{ background: FARBE_UNKLAR }} />Noch unklar</b>
                <small>{unklar.length} Rechnung{unklar.length === 1 ? "" : "en"} · nicht im Gesamtumsatz · jetzt kategorisieren →</small>
              </span>
              <span className="au-ue-spark" />
              <span className="au-sz-db">
                <span className="au-sz-db-spur"><span style={{ width: `${Math.max(1, (unklarSumme / max) * 100)}%`, background: FARBE_UNKLAR }} /></span>
                <b className="gedimmt">{formatEURGanz(unklarSumme)}</b>
              </span>
            </Link>
          )}
        </div>
        {ohneUmsatz.length > 0 && <p className="au-ue-fuss">Ohne Umsatz im Zeitraum: {ohneUmsatz.join(", ")}</p>}
      </section>

      <section className="au-sz-karte">
        <header className="au-sz-karte-kopf">
          <h3>Nächste Seminare</h3>
          <Link href="/termine" className="au-panel-link" prefetch={false}>Alle Termine →</Link>
        </header>
        {!(naechste || []).length && <p className="au-ue-fuss">Keine anstehenden Termine.</p>}
        <div className="au-sz-artliste">
          {(naechste || []).map((t: any) => {
            const d = new Date(t.datum_start + "T00:00:00Z");
            const belegt = db.get(t.id)?.teilnehmer || 0;
            const kap = Number(t.kapazitaet) || 0;
            const tage = Math.round((Date.parse(t.datum_start) - Date.parse(heute)) / MS_TAG);
            return (
              <Link key={t.id} href={`/termine/${t.id}`} className="au-ue-termin" prefetch={false}>
                <span className="au-sz-termin">
                  <span className="au-sz-datum">
                    <b>{d.getUTCDate()}</b>
                    <small>{MONATSNAMEN[d.getUTCMonth()].slice(0, 3)} {String(d.getUTCFullYear()).slice(2)}</small>
                  </span>
                  <span className="au-sz-name">
                    <b>{t.titel || t.seminartypen?.name}</b>
                    <small>{[t.kennung, t.veranstaltungsorte?.ort || t.veranstaltungsorte?.name, t.format === "online" ? "online" : null].filter(Boolean).join(" · ")}</small>
                  </span>
                </span>
                <span className="au-ue-bis">{tage === 0 ? "heute" : tage === 1 ? "morgen" : `in ${tage} Tagen`}</span>
                <span className="au-sz-ausl">
                  <span className="au-sz-mini"><span style={{ width: `${kap ? Math.min(100, prozent(belegt, kap)) : 0}%` }} /></span>
                  <small>{belegt}{kap ? ` / ${kap}` : ""} TN</small>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
