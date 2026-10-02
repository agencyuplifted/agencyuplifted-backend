import Link from "next/link";
import { berechneDeckungsbeitraege } from "@/lib/deckungsbeitrag";
import { formatEURGanz } from "@/lib/format";
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

function monatsReihe(heute: string) {
  const [j, m] = heute.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(j, m - 1 - 11 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}

export default async function Geschaeftsfelder({ supabase, heute }: { supabase: any; heute: string }) {
  const von = tagMinus(heute, 365);
  const [{ data: kategorien }, { data: rechnungen }, { data: termine }] = await Promise.all([
    supabase.from("fastbill_kategorien").select("id, name, schluessel, reihenfolge").order("reihenfolge").order("name"),
    supabase.from("fastbill_rechnungen").select("kategorie, betrag_netto, rechnungsdatum").gt("rechnungsdatum", von).lte("rechnungsdatum", heute),
    supabase.from("seminartermine").select("id, datum_start").gt("datum_start", von).lte("datum_start", heute).neq("status", "abgesagt"),
  ]);

  const monate = monatsReihe(heute);
  const proMonat = (eintraege: { datum: string; betrag: number }[]) =>
    monate.map((m) => eintraege.filter((e) => e.datum.startsWith(m)).reduce((s, e) => s + e.betrag, 0));

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
        <h2>Geschäftsfelder · rollierend 12 Monate</h2>
        <Link href="/buchungen/fastbill/kategorien" className="au-panel-link" prefetch={false}>Kategorien verwalten →</Link>
      </div>
      <div className="au-panel-inhalt">
      <div className="au-gf-kopf">
        <div>
          <div className="au-cockpit-label">Gesamtumsatz</div>
          <div className="au-cockpit-zahl">{formatEURGanz(gesamt)}</div>
          <div className="au-cockpit-kontext">
            Seminare aus dem Buchungssystem + zugeordnete FastBill-Rechnungen{seminarName ? ` (ohne „${seminarName}“, sonst doppelt)` : ""}
          </div>
          {unklarSumme > 0 && (
            <div className="au-cockpit-vergleich">
              zusätzlich {formatEURGanz(unklarSumme)} noch nicht zugeordnet ·{" "}
              <Link href="/buchungen/fastbill/kategorisieren" prefetch={false}>jetzt kategorisieren →</Link>
            </div>
          )}
        </div>
      </div>

      <div className="au-gf-karten">
        <div className="au-gf-karte">
          <div className="au-cockpit-label"><span className="au-gf-punkt" style={{ background: FARBEN[0] }} /> Seminare</div>
          <div className="au-gf-zahl">{formatEURGanz(seminarSumme)}</div>
          <Sparkline werte={proMonat(seminarEintraege)} farbe={FARBEN[0]} />
          <div className="au-klein">aus dem Buchungssystem</div>
        </div>
        {felder.map((f, i) =>
          f.anzahl === 0 ? (
            <div key={f.name} className="au-gf-karte leer">
              <div className="au-cockpit-label"><span className="au-gf-punkt" style={{ background: FARBEN[(i + 1) % FARBEN.length] }} /> {f.name}</div>
              <div className="au-gf-zahl">—</div>
              <div className="au-klein">noch keine zugeordneten Rechnungen</div>
            </div>
          ) : (
            <div key={f.name} className="au-gf-karte">
              <div className="au-cockpit-label"><span className="au-gf-punkt" style={{ background: FARBEN[(i + 1) % FARBEN.length] }} /> {f.name}</div>
              <div className="au-gf-zahl">{formatEURGanz(f.summe)}</div>
              <Sparkline werte={f.monate} farbe={FARBEN[(i + 1) % FARBEN.length]} />
              <div className="au-klein">{f.anzahl} Rechnung{f.anzahl === 1 ? "" : "en"}</div>
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
