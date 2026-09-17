import { beschreibeUrgencyStufe, type WebsiteVerfuegbarkeit } from "@/lib/verfuegbarkeit";

// Zeigt in Backstage, was der Onepage-Hero / Termin-Kalender fuer einen
// Termin tatsaechlich anzeigt. Frueher stand hier nur "Anzeige
// ueberschrieben: X frei" -- welcher Text (Stufe? Standard-Text?) daraus auf
// der Website wurde, war nicht zu sehen. Die Werte kommen aus
// lib/verfuegbarkeit.ts, also derselben Berechnung wie die oeffentliche API.
export default function WebsiteAnzeigeHinweis({
  anzeige,
  termin,
  ausfuehrlich = false,
}: {
  anzeige: WebsiteVerfuegbarkeit;
  termin: { kapazitaet: number; verfuegbarkeit_anzeige_modus: string | null };
  ausfuehrlich?: boolean;
}) {
  const quelle =
    anzeige.quelle === "neutral"
      ? "fester Text im Neutral-Modus"
      : anzeige.quelle === "stufe" && anzeige.aktiveStufe
        ? `Urgency-Stufe „${beschreibeUrgencyStufe(anzeige.aktiveStufe)}“`
        : anzeige.quelle === "standardtext"
          ? "Urgency-Text Standard (keine Stufe greift)"
          : "kein Text hinterlegt";

  return (
    <div style={{ fontSize: "0.82rem", margin: ausfuehrlich ? "0 0 0.75rem" : "0.25rem 0 0" }}>
      <div>
        <span style={{ color: "var(--color-text-muted)" }}>Website zeigt: </span>
        <strong>{anzeige.dringlichkeitstext ? `„${anzeige.dringlichkeitstext}“` : "keinen Platz-Hinweis"}</strong>
      </div>
      <div style={{ color: "var(--color-text-faint)" }}>
        {termin.verfuegbarkeit_anzeige_modus === "neutral"
          ? "ohne Zahlen/Balken"
          : `Balken: ${anzeige.freiePlaetze} von ${termin.kapazitaet} frei`}
        {" · "}
        {quelle}
      </div>
      {anzeige.restplaetzeUeberschrieben && (
        <div style={{ marginTop: "0.2rem" }}>
          <span
            className="au-badge au-badge-warning"
            title="Onepage rechnet mit einer manuell festgelegten Restplatzzahl statt der echten Buchungen"
          >
            Restplätze überschrieben: {anzeige.freiePlaetze} statt echt {anzeige.freiRechnerisch} frei
          </span>
        </div>
      )}
      {ausfuehrlich && (
        <div style={{ color: "var(--color-text-faint)", marginTop: "0.35rem" }}>
          Der Hero lädt diese Werte live beim Seitenaufruf (bis zu 60 Sekunden zwischengespeichert). Nur solange die Seite noch lädt, steht dort kurz der Wert vom letzten täglichen Sync.
        </div>
      )}
    </div>
  );
}
