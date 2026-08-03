export function formatEUR(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
export function formatDatum(d: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

// Alle in der App erfassten Preise sind Nettopreise (zzgl. gesetzlicher USt.).
export const MWST_SATZ = 0.19;

export function formatEURBrutto(nettoPreis: number) {
  return formatEUR(nettoPreis * (1 + MWST_SATZ));
}

// Zerlegt einen vollen Namen (z. B. aus der Mitarbeiter-Tabelle) heuristisch in
// Vorname/Nachname fuer Listen, die wie bei Teilnehmern beides getrennt anzeigen.
export function splitName(vollerName: string): { vorname: string; nachname: string } {
  const teile = vollerName.trim().split(/\s+/);
  if (teile.length <= 1) return { vorname: teile[0] || "", nachname: "" };
  return { vorname: teile[0], nachname: teile.slice(1).join(" ") };
}
