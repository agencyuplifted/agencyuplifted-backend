export function formatEUR(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
export function formatDatum(d: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}

// Kompakte Datumsspanne fuer Listenansichten (z.B. Termine-Uebersicht): zeigt bei
// mehrtaegigen Terminen den vollen Zeitraum statt nur des Starttags. Faellt bei
// eintaegigen Terminen (kein Enddatum oder Enddatum = Startdatum) auf das normale
// Einzeldatum zurueck.
export function formatDatumsspanne(start: string, ende?: string | null) {
  if (!ende || ende === start) return formatDatum(start);
  const startDatum = new Date(start);
  const endeDatum = new Date(ende);
  const tag = (d: Date) => String(d.getDate()).padStart(2, "0");
  const monat = (d: Date) => String(d.getMonth() + 1).padStart(2, "0");
  const jahr = (d: Date) => d.getFullYear();

  if (jahr(startDatum) !== jahr(endeDatum)) {
    return `${formatDatum(start)} – ${formatDatum(ende)}`;
  }
  if (monat(startDatum) !== monat(endeDatum)) {
    return `${tag(startDatum)}.${monat(startDatum)}. – ${tag(endeDatum)}.${monat(endeDatum)}.${jahr(endeDatum)}`;
  }
  return `${tag(startDatum)}. – ${tag(endeDatum)}.${monat(endeDatum)}.${jahr(endeDatum)}`;
}

// Fuer Zeitstempel (z.B. Resend-Tracking: zugestellt/geoeffnet/geklickt am),
// bei denen zusaetzlich zum Datum auch die Uhrzeit relevant ist.
export function formatDatumZeit(d: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
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

export const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function monatsName(monatIndex: number): string {
  return MONATSNAMEN[monatIndex] || "";
}

export const TERMIN_FELD_LABELS: Record<string, string> = {
  titel: "Titel",
  seminartyp_id: "Seminarkategorie",
  kennung: "Kennung",
  datum_start: "Startdatum",
  zeit_start: "Startuhrzeit",
  datum_ende: "Enddatum",
  zeit_ende: "Enduhrzeit",
  vorabend_anreise_datum: "Vorabendanreise-Tag",
  vorabend_anreise_uhrzeit: "Vorabendanreise-Uhrzeit",
  format: "Format",
  veranstaltungsort_id: "Ort",
  trainer_id: "Trainer",
  kapazitaet: "Kapazität",
  mindestteilnehmerzahl: "Mindestteilnehmerzahl",
  ueberbuchungspuffer: "Überbuchungspuffer (intern)",
  angezeigte_restplaetze: "Angezeigte Restplätze (Urgency)",
  zusatzteilnehmer_preis: "Zusatzteilnehmer-Festpreis",
  zusatzteilnehmer_rabatt_prozent: "Zusatzteilnehmer-Rabatt (%)",
  untertitel: "Untertitel (Onepage-Hero)",
  eyebrow_text: "Eyebrow-Text (Onepage-Hero, Standard: Seminar)",
  urgency_label_template: "Urgency-Text Standard (Onepage-Hero, ohne Platzzahl)",
  onepage_slug: "Onepage-Zielseite (Buchen-Button in Termin-Uebersichten)",
  zimmerupgrade_beschreibung: "Zimmer-Upgrade Beschreibung",
  zimmerupgrade_preis_netto: "Zimmer-Upgrade Aufpreis (netto, pro Person)",
  selbstauskunft_label: "Selbstauskunft-Checkbox Text",
  selbstauskunft_aktiv: "Selbstauskunft-Checkbox aktiv",
};
