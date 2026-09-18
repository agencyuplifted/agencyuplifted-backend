// Modul "Ideen & Wiedervorlage", Phase 2: Events, Kontakte, Aufgaben.
// Werte passend zu den CHECK-Constraints der Migration
// wiedervorlage_phase2_events. Client-tauglich (keine Server-Imports).

export const TEILNAHME = ["offen", "teilnehmen", "speaker", "remote_verfolgen", "nicht_moeglich"] as const;
export type Teilnahme = (typeof TEILNAHME)[number];
export const TEILNAHME_LABEL: Record<Teilnahme, string> = {
  offen: "Offen",
  teilnehmen: "Teilnehmen",
  speaker: "Speaker (Ziel)",
  remote_verfolgen: "Remote verfolgen",
  nicht_moeglich: "Nicht möglich",
};

export const TURNUS = ["jaehrlich", "halbjaehrlich", "zweijaehrlich", "unregelmaessig", "einmalig"] as const;
export type Turnus = (typeof TURNUS)[number];
export const TURNUS_LABEL: Record<Turnus, string> = {
  jaehrlich: "jährlich",
  halbjaehrlich: "halbjährlich",
  zweijaehrlich: "alle zwei Jahre",
  unregelmaessig: "unregelmäßig",
  einmalig: "einmalig",
};

export const EVENT_ROLLEN = ["veranstalter_asp", "gold_sponsor", "sponsor", "aussteller", "speaker", "teilnehmer"] as const;
export type EventRolle = (typeof EVENT_ROLLEN)[number];
export const EVENT_ROLLE_LABEL: Record<EventRolle, string> = {
  veranstalter_asp: "Veranstalter (ASP)",
  gold_sponsor: "Gold-Sponsor",
  sponsor: "Sponsor",
  aussteller: "Aussteller",
  speaker: "Speaker",
  teilnehmer: "Teilnehmer",
};

export const KONTAKT_STATUS = ["recherchieren", "vernetzt", "angeschrieben", "im_gespraech", "kunde", "kein_interesse"] as const;
export type KontaktStatus = (typeof KONTAKT_STATUS)[number];
export const KONTAKT_STATUS_LABEL: Record<KontaktStatus, string> = {
  recherchieren: "Recherchieren",
  vernetzt: "Vernetzt",
  angeschrieben: "Angeschrieben",
  im_gespraech: "Im Gespräch",
  kunde: "Kunde",
  kein_interesse: "Kein Interesse",
};

// Heutiges Datum in Berlin als YYYY-MM-DD (Server laufen in UTC -- zwischen
// 0 und 2 Uhr nachts waere "heute" sonst noch gestern).
export function berlinHeute(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

export function tagPlus(isoTag: string, tage: number): string {
  const [j, m, t] = isoTag.split("-").map(Number);
  return new Date(Date.UTC(j, m - 1, t + tage)).toISOString().slice(0, 10);
}

export function formatTag(isoTag: string | null | undefined): string {
  if (!isoTag) return "—";
  const [j, m, t] = isoTag.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(j, m - 1, t))
  );
}

export function nurErlaubterWert<T extends string>(wert: unknown, erlaubt: readonly T[]): T | null {
  const s = String(wert ?? "");
  return (erlaubt as readonly string[]).includes(s) ? (s as T) : null;
}
