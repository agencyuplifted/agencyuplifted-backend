import { setzeZimmerReserviert } from "@/lib/actions";
import type { Hotelliste } from "@/lib/hotelliste";

// Reserviert vs. benoetigt -- auf Terminseite und Hotel-Liste gleich, damit
// beim Nachbuchen im Hotel immer dieselbe Zahl sichtbar ist.
export default function ZimmerKontingent({ terminId, liste }: { terminId: string; liste: Hotelliste }) {
  const { zimmerBenoetigt, zimmerReserviert, geteilteZimmer } = liste;
  const differenz = zimmerReserviert === null ? null : zimmerReserviert - zimmerBenoetigt;
  return (
    <div className="au-card">
      <h2 style={{ marginTop: 0 }}>Zimmer</h2>
      <p style={{ margin: "0 0 0.75rem" }}>
        <strong>{zimmerBenoetigt}</strong> benötigt (Referenten + Mitarbeiter + Teilnehmer{geteilteZimmer ? `, ${geteilteZimmer} geteilt` : ""})
        {" · "}
        <strong>{zimmerReserviert ?? "—"}</strong> im Hotel reserviert
        {differenz !== null && (
          <>
            {" · "}
            {differenz > 0 && <span className="au-badge au-badge-neutral">{differenz} frei</span>}
            {differenz === 0 && <span className="au-badge au-badge-neutral">passt genau</span>}
            {differenz < 0 && <span className="au-badge au-badge-warning">{-differenz} fehlen</span>}
          </>
        )}
      </p>
      <form action={setzeZimmerReserviert} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <input type="hidden" name="seminartermin_id" value={terminId} />
        <div>
          <label className="au-label">Im Hotel reservierte Zimmer</label>
          <input className="au-input" style={{ marginBottom: 0, width: 140 }} name="zimmer_reserviert" type="number" min={0} step={1} defaultValue={zimmerReserviert ?? ""} />
        </div>
        <button type="submit" className="au-btn au-btn-secondary">Speichern</button>
      </form>
    </div>
  );
}
