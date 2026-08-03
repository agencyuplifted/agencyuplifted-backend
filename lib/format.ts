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
