import { berechneRatenbetrag } from "./ratenzahlung";
import { formatEUR } from "./format";

// Programme (Uplift, spaeter Foundation/Advance/Personal): Mitgliedschaften
// ueber dieselbe Buchungs-Datenbasis wie Seminare (buchungen +
// buchungspositionen mit programm_id/programm_option_id statt
// seminartermin_id). Markus: "monatlich" = 12 Monate Laufzeit, abgerechnet
// als Raten (Rechnung, keine Abbuchung); "jaehrlich" = Jahresbetrag auf einmal.

export type Zahlweise = "monthly" | "yearly";

export type ProgrammOption = {
  id: string;
  programm_id: string;
  titel: string;
  preis_monatlich: number | string | null;
  preis_jaehrlich: number | string | null;
  ratenzahlung_aktiv: boolean;
  ratenzahlung_anzahl_raten: number | null;
  ratenzahlung_aufschlag_prozent: number | string | null;
  zusatzteilnehmer_preis_monatlich: number | string | null;
  zusatzteilnehmer_preis_jaehrlich: number | string | null;
  deaktiviert_am?: string | null;
};

export const PROGRAMM_SYSTEM_MAIL_EINGANG = "3f1a6c2e-5b7d-4e8a-9c01-2d4b6e8f0a11";
export const PROGRAMM_SYSTEM_MAIL_BESTAETIGT = "7c2d9e4b-1a3f-4b6c-8d20-5e7f9a1b3c22";

const zahl = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const runden = (n: number) => Math.round(n * 100) / 100;

/** Laufzeit bzw. Anzahl Monatsraten bei "monatlich" (Standard 12) */
export const laufzeitMonate = (o: ProgrammOption) => (o.ratenzahlung_anzahl_raten && o.ratenzahlung_anzahl_raten > 1 ? o.ratenzahlung_anzahl_raten : 12);

/**
 * Preis einer Buchungsposition -- serverseitig aus der Option, nie vom Client.
 * index 0 = Hauptperson, ab 1 = Zusatzteilnehmer (fester Betrag aus der
 * Option, sonst voller Preis). Monatlich: Monatsbetrag x Laufzeit (+ ggf.
 * Aufschlag), als Ratenzahlung in metadata -- gleiches Format wie bei
 * Seminar-Ratenzahlung, damit Buchungsdetail/FastBill-Abgleich es verstehen.
 */
export function programmPositionspreis(
  o: ProgrammOption,
  zahlweise: Zahlweise,
  index: number
): { listenpreis: number; metadata: Record<string, unknown> } | { fehler: string } {
  if (zahlweise === "monthly") {
    if (!o.ratenzahlung_aktiv) return { fehler: "monthly_not_available" };
    const monat = index > 0 ? zahl(o.zusatzteilnehmer_preis_monatlich) ?? zahl(o.preis_monatlich) : zahl(o.preis_monatlich);
    if (monat === null) return { fehler: "price_missing" };
    const raten = laufzeitMonate(o);
    const aufschlag = zahl(o.ratenzahlung_aufschlag_prozent) || 0;
    const gesamt = runden(monat * raten * (1 + aufschlag / 100));
    return {
      listenpreis: gesamt,
      metadata: {
        programm_zahlweise: "monthly",
        laufzeit_monate: raten,
        zahlweise: "raten",
        anzahl_raten: raten,
        rate_betrag: berechneRatenbetrag(gesamt, raten),
      },
    };
  }
  const jahr = index > 0 ? zahl(o.zusatzteilnehmer_preis_jaehrlich) ?? zahl(o.preis_jaehrlich) : zahl(o.preis_jaehrlich);
  if (jahr === null) return { fehler: "price_missing" };
  return { listenpreis: runden(jahr), metadata: { programm_zahlweise: "yearly", laufzeit_monate: 12, zahlweise: "einmalig" } };
}

export function zahlweiseText(o: ProgrammOption, zahlweise: Zahlweise): string {
  if (zahlweise === "monthly") {
    const p = programmPositionspreis(o, "monthly", 0);
    return "fehler" in p ? "monatlich" : `monatlich, ${laufzeitMonate(o)} × ${formatEUR(Number(p.metadata.rate_betrag))} netto`;
  }
  return `jährlich, ${formatEUR(Number(o.preis_jaehrlich || 0))} netto`;
}

// ---------------------------------------------------------------------------
// Quiz-Profil (Onepage-Qualifizierung) -- lesbar aufbereitet statt rohem JSON.
// Unbekannte Schluessel/Werte werden trotzdem angezeigt (Quiz kann sich
// weiterentwickeln, ohne dass hier etwas verloren geht).

const QUIZ_FELDER: { key: string; label: string; werte?: Record<string, string> }[] = [
  { key: "unternehmensalter", label: "Unternehmensalter", werte: { "<2": "unter 2 Jahre", "2-5": "2–5 Jahre", "5-10": "5–10 Jahre", "10-15": "10–15 Jahre", ">15": "über 15 Jahre" } },
  { key: "agenturgroesse", label: "Agenturgröße", werte: { solo: "Solo", "2-5": "2–5", "6-15": "6–15", "16-25": "16–25", "26-50": "26–50", "50+": "über 50" } },
  { key: "agentur_art", label: "Agentur-Art" },
  {
    key: "besuchte_seminare",
    label: "Besuchte Seminare",
    werte: { fokussierung: "Fokussierung", fuehrung: "Führung", organisation: "Organisation und Zusammenarbeit", preisfindung: "Preisfindung", keines: "noch keines besucht" },
  },
  { key: "fuehrungsstruktur", label: "Führungsstruktur", werte: { allein: "allein", zu_zweit: "zu zweit", mehrere: "mehrere", andere: "andere" } },
  {
    key: "situation",
    label: "Aktuelle Situation",
    werte: { wachsend: "wachsend", stabil: "stabil", herausfordernd: "herausfordernd", uebergabe: "vor Übergabe", keine_angabe: "dazu sage ich lieber nichts" },
  },
  { key: "themen", label: "Gesuchte Themen" },
  { key: "themen_freitext", label: "Themen (Freitext)" },
  { key: "freitext", label: "Freitext" },
];

const schoen = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function quizProfil(antworten: unknown): { label: string; wert: string }[] {
  if (!antworten || typeof antworten !== "object" || Array.isArray(antworten)) return [];
  const a = antworten as Record<string, unknown>;
  const text = (v: unknown, werte?: Record<string, string>): string => {
    if (Array.isArray(v)) return v.map((x) => text(x, werte)).filter(Boolean).join(", ");
    if (v === null || v === undefined || v === "") return "";
    if (typeof v === "boolean") return v ? "ja" : "nein";
    if (typeof v === "object") return JSON.stringify(v);
    return werte?.[String(v)] || String(v);
  };
  const zeilen = QUIZ_FELDER.filter((f) => f.key in a).map((f) => ({ label: f.label, wert: text(a[f.key], f.werte) }));
  const bekannt = new Set(QUIZ_FELDER.map((f) => f.key));
  for (const [k, v] of Object.entries(a)) if (!bekannt.has(k)) zeilen.push({ label: schoen(k), wert: text(v) });
  return zeilen.filter((z) => z.wert);
}

export const ERGEBNIS_TYP_LABEL: Record<string, string> = {
  gruenderpaket: "Gründerpaket (Gespräch)",
  foundation_empfehlung: "eher Foundation",
};
