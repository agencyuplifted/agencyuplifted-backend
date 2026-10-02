import { MONATSNAMEN } from "./format";

// Waehlbare Zeitraeume fuer die Dashboards (Uebersicht/Geschaeftsfelder und
// Reiter Seminare). Jeder Zeitraum hat konkrete Daten von/bis -- vorher stand
// nur "rollierend 12 Monate" ohne Datum da (Markus 10/2026).
//
// kappenBisHeute: fuer Ist-Zahlen (FastBill-Rechnungen) endet ein laufender
// Zeitraum heute; fuer Seminare zaehlen auch bereits gebuchte kuenftige
// Termine, dort bleibt das volle Ende stehen.

export type Zeitraum = { key: string; titel: string; von: string; bis: string; laufend: boolean };

const MS_TAG = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (j: number, m0: number, t: number) => new Date(Date.UTC(j, m0, t));
const istDatum = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const tagPlus = (isoTag: string, tage: number) => iso(new Date(Date.parse(isoTag) + tage * MS_TAG));

export function zeitraumAus(
  param: string | undefined,
  heute: string,
  opt: { vonParam?: string; bisParam?: string; kappenBisHeute?: boolean; standard?: string } = {}
): Zeitraum {
  const [j, m, t] = heute.split("-").map(Number);
  const kappen = !!opt.kappenBisHeute;
  const fertig = (key: string, titel: string, von: string, bisVoll: string): Zeitraum => {
    const bis = kappen && bisVoll > heute ? heute : bisVoll;
    return { key, titel, von, bis, laufend: von <= heute && bisVoll >= heute };
  };
  const monat = (versatz: number, key: string) => {
    const a = utc(j, m - 1 + versatz, 1);
    return fertig(key, `${MONATSNAMEN[a.getUTCMonth()]} ${a.getUTCFullYear()}`, iso(a), iso(utc(a.getUTCFullYear(), a.getUTCMonth() + 1, 0)));
  };
  const quartal = (versatz: number, key: string) => {
    const q0 = Math.floor((m - 1) / 3) + versatz;
    const a = utc(j, q0 * 3, 1);
    return fertig(key, `Q${Math.floor(a.getUTCMonth() / 3) + 1} ${a.getUTCFullYear()}`, iso(a), iso(utc(a.getUTCFullYear(), a.getUTCMonth() + 3, 0)));
  };
  const p = param || opt.standard || "12m";
  switch (p) {
    case "monat": return monat(0, "monat");
    case "vormonat": return monat(-1, "vormonat");
    case "naechster-monat": return monat(1, "naechster-monat");
    case "quartal": return quartal(0, "quartal");
    case "naechstes-quartal": return quartal(1, "naechstes-quartal");
    case "3m": return { key: "3m", titel: "Letzte 3 Monate", von: iso(utc(j, m - 4, t + 1)), bis: heute, laufend: false };
    case "12m": return { key: "12m", titel: "Letzte 12 Monate", von: tagPlus(heute, -364), bis: heute, laufend: false };
    case "naechste-12m": return { key: "naechste-12m", titel: "Nächste 12 Monate", von: heute, bis: tagPlus(heute, 364), laufend: false };
    case "frei":
      if (istDatum(opt.vonParam) && istDatum(opt.bisParam)) {
        const [a, b] = [opt.vonParam!, opt.bisParam!].sort();
        return { key: "frei", titel: "Freier Zeitraum", von: a, bis: b, laufend: false };
      }
  }
  const jahr = Number(p);
  if (Number.isInteger(jahr) && jahr >= 2020 && jahr <= j + 5) return fertig(String(jahr), `Kalenderjahr ${jahr}`, `${jahr}-01-01`, `${jahr}-12-31`);
  return zeitraumAus(opt.standard || "12m", heute, { ...opt, standard: "12m" });
}

// Vorperiode: ganze Kalendermonate/-quartale/-jahre verschieben sich um ihre
// Monatszahl (Q4 -> Q3, 2026 -> 2025); alles andere um gleich viele Tage.
export function vorperiode(z: Zeitraum): { von: string; bis: string } {
  const monatsanfang = z.von.slice(8) === "01";
  const monatsende = tagPlus(z.bis, 1).slice(8) === "01";
  if (monatsanfang && monatsende) {
    const monate = (Number(z.bis.slice(0, 4)) - Number(z.von.slice(0, 4))) * 12 + Number(z.bis.slice(5, 7)) - Number(z.von.slice(5, 7)) + 1;
    const start = new Date(Date.UTC(Number(z.von.slice(0, 4)), Number(z.von.slice(5, 7)) - 1 - monate, 1));
    return { von: start.toISOString().slice(0, 10), bis: tagPlus(z.von, -1) };
  }
  const tage = Math.round((Date.parse(z.bis) - Date.parse(z.von)) / MS_TAG);
  const bis = tagPlus(z.von, -1);
  return { von: tagPlus(bis, -tage), bis };
}

export const monatKurz = (ym: string) => `${MONATSNAMEN[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
