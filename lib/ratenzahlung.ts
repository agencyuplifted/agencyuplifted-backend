// Optionale Ratenzahlung pro Seminaroption -- reine Vereinbarung + manuelles
// Tracking, KEINE automatische Abbuchung/Zahlungsanbieter-Anbindung (genau
// wie der bestehende Buchungsfluss: Überweisung, dann manuell "Zahlung
// erhalten" markieren). Erste Rate ist sofort bei Buchung fällig, die
// restlichen Raten sind alle gleich hoch und verteilen sich auf die
// Folgemonate; die Rundungsdifferenz (Centbeträge, die sich nicht glatt
// durch die Ratenzahl teilen lassen) schlägt der letzten Rate zu.

// Der Standard-Ratenbetrag (fuer alle Raten ausser der letzten) -- das ist
// der Wert, der als "X × Y €" angezeigt und in buchungspositionen.metadata
// als rate_betrag gespeichert wird.
export function berechneRatenbetrag(gesamtpreis: number, anzahlRaten: number | null | undefined): number {
  if (!anzahlRaten || anzahlRaten <= 1) return Math.round(gesamtpreis * 100) / 100;
  return Math.round((gesamtpreis / anzahlRaten) * 100) / 100;
}

// Vollstaendiger Ratenplan inkl. der (ggf. um die Rundungsdifferenz
// abweichenden) letzten Rate -- fuer den Fall, dass spaeter eine echte
// Fälligkeits-/Erinnerungslogik pro Rate gebraucht wird.
export function berechneRatenplan(
  gesamtpreis: number,
  anzahlRaten: number | null | undefined
): { rateBetrag: number; letzteRate: number } {
  const rateBetrag = berechneRatenbetrag(gesamtpreis, anzahlRaten);
  if (!anzahlRaten || anzahlRaten <= 1) return { rateBetrag, letzteRate: rateBetrag };
  const letzteRate = Math.round((gesamtpreis - rateBetrag * (anzahlRaten - 1)) * 100) / 100;
  return { rateBetrag, letzteRate };
}
