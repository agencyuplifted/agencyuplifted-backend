import Link from "next/link";
import { berechneDeckungsbeitraege } from "@/lib/deckungsbeitrag";
import { formatEURGanz, formatDatum, MONATSNAMEN } from "@/lib/format";
import { monatKurz, type Zeitraum } from "@/lib/zeitraeume";
import { Sparkline } from "./SeminarCockpit";
import { ladeSeminarZaehler } from "@/lib/seminarzaehler";
import { ladeUeberfaelligeZahlungen, UEBERFAELLIG_KARENZ_TAGE } from "@/lib/rechnungen";

// Dashboard-Uebersicht: Kennzahlen + Umsatz nach Geschaeftsfeldern + naechste
// Seminare, alles fuer EINEN Zeitraum aus der gemeinsamen Zeitraum-Leiste.
// Vorher hatten die Kacheln (Kalenderjahr) und die Geschaeftsfelder (bis
// heute gekappt) verschiedene Zeitraeume -- dieselbe Seite zeigte zwei
// verschiedene Seminarumsaetze (Markus 10/2026). Jetzt gilt ueberall:
// Seminare = Termine mit Beginn im Zeitraum inkl. bereits gebuchter
// kuenftiger (wie Reiter Seminare), FastBill = Rechnungen nach Datum.
//
// Gruppen in FESTER Reihenfolge, auch ohne Umsatz (Markus 10/2026: "alle
// Gruppen tendenziell sehen"): Seminare (ohne Konferenz), Konferenz, je
// Programm (Foundation, Uplift ... aus dem Buchungssystem, nach Buchungsdatum,
// voller Vertragswert), dann die FastBill-Kategorien. Feste Reihenfolge =
// feste Farbe pro Gruppe, auch wenn sich die Betraege aendern.
//
// GEGEN DOPPELZAEHLUNG: Die FastBill-Kategorie mit schluessel 'seminar' sind
// dieselben Rechnungen wie die Buchungen und werden NIE aufaddiert. Gleiches gilt kuenftig fuer Programm-Rechnungen:
// Bekommen die in FastBill eine eigene Kategorie, muss sie hier genauso
// ausgenommen werden (sonst doppelt mit den Programm-Buchungen). Alle
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
  const [{ data: kategorien }, { data: rechnungen }, { data: termine }, { data: fbStand }, { data: offen }, { data: naechste }, { data: programme }, { data: programmPos }] = await Promise.all([
    supabase.from("fastbill_kategorien").select("id, name, schluessel, reihenfolge").order("reihenfolge").order("name"),
    supabase.from("fastbill_rechnungen").select("kategorie, betrag_netto, rechnungsdatum").gte("rechnungsdatum", von).lte("rechnungsdatum", bis),
    supabase.from("seminartermine").select("id, datum_start, datum_ende, kapazitaet, seminartyp_id, seminartypen(name)").gte("datum_start", von).lte("datum_start", bis).neq("status", "abgesagt"),
    supabase.from("fastbill_rechnungen").select("rechnungsdatum").order("rechnungsdatum", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("buchungspositionen").select("buchung_id, preis, buchungen!inner(status)").eq("buchungen.status", "angefragt"),
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, kapazitaet, format, seminartypen(name), veranstaltungsorte(name, ort)")
      .gte("datum_start", heute)
      .in("status", ["geplant", "bestaetigt", "unterbesetzt"])
      .order("datum_start", { ascending: true })
      .limit(5),
    supabase.from("programme").select("id, name, schluessel").order("name"),
    supabase
      .from("buchungspositionen")
      .select("programm_id, preis, buchungen!inner(status, gebucht_am)")
      .not("programm_id", "is", null)
      .neq("buchungen.status", "storniert")
      .gte("buchungen.gebucht_am", von)
      .lte("buchungen.gebucht_am", `${bis}T23:59:59`),
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
  // Seminare ohne Konferenz; die Konferenz ist eine eigene Gruppe (Markus 10/2026).
  let durchgefuehrt = 0, gebucht = 0, tn = 0, plaetze = 0, konferenzTn = 0, konferenzSumme = 0;
  let seminarAnzahl = 0, konferenzAnzahl = 0, paketSumme = 0;
  let konferenzTypId: string | null = null;
  const seminarEintraege: { datum: string; betrag: number }[] = [];
  const konferenzEintraege: { datum: string; betrag: number }[] = [];
  (termine || []).forEach((t: any) => {
    const d = db.get(t.id);
    if (!d) return;
    // Paket-Buchungen (Seminar im Coaching-Paket) nicht in den Umsatz: das
    // Geld steckt in der Coaching-Rechnung (FastBill), sonst doppelt.
    const umsatz = d.umsatz - d.umsatzPaket;
    paketSumme += d.umsatzPaket;
    if ((t.seminartypen?.name || "").toLowerCase().includes("konferenz")) {
      konferenzTn += d.teilnehmer;
      konferenzSumme += umsatz;
      konferenzAnzahl++;
      konferenzTypId = t.seminartyp_id;
      konferenzEintraege.push({ datum: t.datum_start, betrag: umsatz });
      return;
    }
    if ((t.datum_ende || t.datum_start) < heute) durchgefuehrt += umsatz;
    else gebucht += umsatz;
    seminarAnzahl++;
    seminarEintraege.push({ datum: t.datum_start, betrag: umsatz });
    tn += d.teilnehmer;
    plaetze += Number(t.kapazitaet) || 0;
  });
  const seminarSumme = durchgefuehrt + gebucht;

  // Uebrige Geschaeftsfelder (FastBill, ohne Seminar-Kategorie)
  type Feld = { name: string; summe: number; anzahl: number; verlauf: number[]; farbe: string };
  const felder: Feld[] = (kategorien || [])
    .filter((k: any) => k.schluessel !== "seminar")
    .map((k: any): Feld => {
      const eintraege = (rechnungen || [])
        .filter((r: any) => r.kategorie === k.name)
        .map((r: any) => ({ datum: r.rechnungsdatum as string, betrag: Number(r.betrag_netto || 0) }));
      return {
        name: k.name,
        summe: eintraege.reduce((s: number, e: any) => s + e.betrag, 0),
        anzahl: eintraege.length,
        verlauf: verteile(eintraege),
        farbe: "",
      };
    });
  const unklar = (rechnungen || []).filter((r: any) => !r.kategorie || r.kategorie === UNKLAR);
  const unklarSumme = unklar.reduce((s: number, r: any) => s + Number(r.betrag_netto || 0), 0);
  const programmZeilen = (programme || []).map((p: any) => {
    const eintraege = (programmPos || [])
      .filter((x: any) => x.programm_id === p.id)
      .map((x: any) => ({ datum: String(x.buchungen?.gebucht_am || "").slice(0, 10), betrag: Number(x.preis || 0) }));
    return { p, eintraege, summe: eintraege.reduce((s: number, e: any) => s + e.betrag, 0) };
  });
  const zeitraumQuery = `zeitraum=${zeitraum.key}${zeitraum.key === "frei" ? `&von=${von}&bis=${bis}` : ""}`;

  type Gruppe = { name: string; summe: number; farbe: string; verlauf: number[]; sub: string; href: string };
  const gruppenOhneFarbe: Omit<Gruppe, "farbe">[] = [
    {
      name: "Seminare",
      summe: seminarSumme,
      verlauf: verteile(seminarEintraege),
      sub: seminarAnzahl
        ? `${seminarAnzahl} Termin${seminarAnzahl === 1 ? "" : "e"} · ohne Konferenz${gebucht ? ` · ${formatEURGanz(gebucht)} gebucht, steht aus` : ""}${paketSumme ? ` · ohne ${formatEURGanz(paketSumme)} aus Paket-Buchungen` : ""}`
        : "keine Termine im Zeitraum",
      href: `/dashboard?ansicht=seminare&${zeitraumQuery}`,
    },
    {
      name: "Konferenz",
      summe: konferenzSumme,
      verlauf: verteile(konferenzEintraege),
      sub: konferenzAnzahl ? `${konferenzAnzahl === 1 ? "1 Konferenz" : `${konferenzAnzahl} Konferenzen`} · ${konferenzTn} TN` : "keine Konferenz im Zeitraum",
      href: konferenzTypId ? `/dashboard?ansicht=seminare&${zeitraumQuery}&seminartyp=${konferenzTypId}` : "/termine",
    },
    ...programmZeilen.map(({ p, eintraege, summe }: any) => ({
      name: `Programm ${p.name}`,
      summe,
      verlauf: verteile(eintraege),
      sub: eintraege.length ? `${eintraege.length} Buchung${eintraege.length === 1 ? "" : "en"} · voller Vertragswert` : "noch keine Buchung im Zeitraum",
      href: `/programme/${p.schluessel}`,
    })),
    ...felder.map((f) => ({
      name: f.name,
      summe: f.summe,
      verlauf: f.verlauf,
      sub: f.anzahl ? `${f.anzahl} Rechnung${f.anzahl === 1 ? "" : "en"} (FastBill)` : "keine Rechnung im Zeitraum",
      href: "/buchungen/fastbill",
    })),
  ];
  const zeilen: Gruppe[] = gruppenOhneFarbe.map((g, i) => ({ ...g, farbe: FARBEN[i % FARBEN.length] }));
  const gesamt = zeilen.reduce((s, z) => s + z.summe, 0);
  const offenSumme = (offen || []).reduce((s: number, p: any) => s + Number(p.preis || 0), 0);
  const offenAnzahl = new Set((offen || []).map((p: any) => p.buchung_id)).size;

  const max = Math.max(1, ...zeilen.map((z) => z.summe), unklarSumme);
  const verlaufText = art === "Monat" ? `pro Monat, ${monatKurz(abschnitte[0].von.slice(0, 7))} – ${monatKurz(abschnitte[abschnitte.length - 1].von.slice(0, 7))}` : "pro Woche";

  const [zaehler, ueberfaellig] = await Promise.all([ladeSeminarZaehler(supabase, heute), ladeUeberfaelligeZahlungen(supabase, heute)]);

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

        <Link href={zeilen[0].href} className="au-sz-kpi au-sz-kpi-link" prefetch={false}>
          <div className="au-sz-kpi-kopf"><span>Umsatz Seminare</span><span className="au-sz-pfeil-klein">→</span></div>
          <div className="au-sz-kpi-wert">{formatEURGanz(seminarSumme)}</div>
          <div className="au-sz-kpi-sub">{formatEURGanz(durchgefuehrt)} durchgeführt · {formatEURGanz(gebucht)} gebucht</div>
          <div className="au-sz-kpi-sub">ohne Konferenz{konferenzSumme ? ` (${formatEURGanz(konferenzSumme)} separat)` : ""}</div>
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

      {ueberfaellig.length > 0 && (
        <section className="au-sz-karte au-ueberfaellig">
          <header className="au-sz-karte-kopf">
            <h3>Überfällige Zahlungen</h3>
            <span>ab {UEBERFAELLIG_KARENZ_TAGE} Tagen nach Fälligkeit · Stand FastBill-Abgleich</span>
          </header>
          <div className="au-sz-artliste">
            {ueberfaellig.map((u) => (
              <Link key={u.rechnungId} href={`/buchungen/${u.buchungId}`} className="au-ue-termin" prefetch={false}>
                <span className="au-sz-name">
                  <b>{u.kunde}</b>
                  <small>{u.was}{u.rechnungsnummer ? ` · ${u.rechnungsnummer}` : ""}{u.buchungsnummer ? ` · ${u.buchungsnummer}` : ""} · fällig {formatDatum(u.faelligAm)}</small>
                </span>
                <span className="au-ue-bis au-ueberfaellig-tage">{u.tage} Tage überfällig</span>
                <span className="au-sz-betrag"><b>{formatEURGanz(u.offen)}</b><small>offen</small></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {zaehler.map((z) => (
        <section key={z.praefix} className="au-sz-karte au-zaehler">
          <div className="au-zaehler-nummer">#{z.anzahl}</div>
          <div className="au-zaehler-text">
            <b>{z.bezeichnung}</b>
            <small>
              {z.anzahl} Seminare seit {z.seit}
              {z.naechster && (
                <> · nächstes: <Link href={`/termine/${z.naechster.id}`} prefetch={false}>{z.naechster.kennung}</Link> am {formatDatum(z.naechster.datum_start)} (#{z.naechster.nummer})</>
              )}
            </small>
          </div>
        </section>
      ))}

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
            <Link key={z.name} href={z.href} className={`au-ue-feld${z.summe ? "" : " leer"}`} prefetch={false}>
              <span className="au-sz-name">
                <b><i className="au-ue-punkt" style={{ background: z.farbe }} />{z.name}</b>
                <small>{z.sub}</small>
              </span>
              <span className="au-ue-spark">{abschnitte.length >= 2 && z.verlauf.some((v) => v) ? <Sparkline werte={z.verlauf} farbe={z.farbe} /> : null}</span>
              <span className="au-sz-db">
                <span className="au-sz-db-spur">{z.summe > 0 && <span style={{ width: `${Math.max(1, (z.summe / max) * 100)}%`, background: z.farbe }} />}</span>
                <b>{z.summe ? formatEURGanz(z.summe) : "—"}</b>
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
