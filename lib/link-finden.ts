// Links aus Mail-Text herausziehen (ohne Node-Abhaengigkeiten, laeuft auch im
// Browser fuer die Live-Anzeige im Editor). Gefunden werden echte URLs,
// persoenliche Platzhalter-Links ({{..._link}}) und Merker wie "[Link]", die
// noch durch einen echten Link ersetzt werden muessen.

export type GefundenerLink =
  | { art: "url"; url: string }
  | { art: "platzhalter"; text: string }
  | { art: "merker"; text: string };

const URL_REGEX = /https?:\/\/[^\s<>"'()\[\]{}]+[^\s<>"'()\[\]{}.,;:!?]/gi;
const PLATZHALTER_REGEX = /\{\{\s*(\w*link\w*)\s*\}\}/gi;
const MERKER_REGEX = /\[[^\]\n]*(link|url|seite|formular|anmeldung)[^\]\n]*\]/gi;

export function findeLinks(text: string): GefundenerLink[] {
  const ergebnis: GefundenerLink[] = [];
  const gesehen = new Set<string>();
  for (const m of text.matchAll(URL_REGEX)) {
    if (!gesehen.has(m[0])) {
      gesehen.add(m[0]);
      ergebnis.push({ art: "url", url: m[0] });
    }
  }
  for (const m of text.matchAll(PLATZHALTER_REGEX)) {
    const t = `{{${m[1]}}}`;
    if (!gesehen.has(t)) {
      gesehen.add(t);
      ergebnis.push({ art: "platzhalter", text: t });
    }
  }
  for (const m of text.matchAll(MERKER_REGEX)) {
    if (!gesehen.has(m[0])) {
      gesehen.add(m[0]);
      ergebnis.push({ art: "merker", text: m[0] });
    }
  }
  return ergebnis;
}
