// Kleine Anzeige-Helfer fuers Netzwerk (Server- und Client-tauglich).

export const AGENTUR_ROLLE_LABEL: Record<string, string> = {
  inhaber: "Inhaber:in",
  mitinhaber: "Mitinhaber:in",
  angestellt: "im Team",
};

export function initialen(vorname?: string | null, nachname?: string | null): string {
  return `${(vorname || "").trim().charAt(0)}${(nachname || "").trim().charAt(0)}`.toUpperCase() || "?";
}

// wa.me braucht die Nummer international ohne +/00/Leerzeichen. Deutsche
// Nummern mit fuehrender 0 werden als +49 gelesen.
export function whatsappNummer(nummer?: string | null): string | null {
  if (!nummer) return null;
  let ziffern = nummer.replace(/[^\d+]/g, "");
  if (ziffern.startsWith("+")) ziffern = ziffern.slice(1);
  else if (ziffern.startsWith("00")) ziffern = ziffern.slice(2);
  else if (ziffern.startsWith("0")) ziffern = "49" + ziffern.slice(1);
  return ziffern.length >= 8 ? ziffern : null;
}

export function kanonischesPaar(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function staerkeText(staerke: number): string {
  if (staerke >= 60) return "enge Verbindung";
  if (staerke >= 30) return "gute Verbindung";
  if (staerke > 0) return "lose Verbindung";
  return "noch keine Verbindung";
}
