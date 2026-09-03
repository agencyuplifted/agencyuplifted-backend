export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEUR, formatDatumZeit } from "@/lib/format";
import { updateFinanzKonfiguration } from "@/lib/actions";

export default async function EinstellungenPage() {
  const supabase = getSupabaseAdmin();
  const { data: konfig } = await supabase
    .from("finanz_konfiguration")
    .select("*")
    .eq("id", 1)
    .single();

  const fremdkosten = Number(konfig?.fremdkosten_pro_person_netto ?? 300);

  return (
    <main>
      <h1>Einstellungen</h1>

      <div className="au-card">
        <h2>Finanzen</h2>
        <p style={{ color: "var(--color-text-muted)" }}>
          Diese Werte fließen in die Umsatz-/Deckungsbeitragsauswertung im Dashboard (Übersicht → "Umsatz pro
          Seminar") ein.
        </p>

        <form action={updateFinanzKonfiguration}>
          <label
            htmlFor="fremdkosten_pro_person_netto"
            style={{ display: "block", fontWeight: 600, marginBottom: "0.4rem" }}
          >
            Fremdkosten pro Person (netto, €)
          </label>
          <p style={{ color: "var(--color-text-muted)", marginTop: 0, fontSize: "0.9rem", maxWidth: "560px" }}>
            Pauschale pro anwesender Person und Seminar (Teilnehmer, Mitarbeiter, Gastreferenten — alle, die vor
            Ort sind). Deckt Seminarpauschale, Hotelübernachtung und Getränke ab, die im Vorfeld netto kassiert
            bzw. bezahlt werden. Wird im Dashboard automatisch mit der Personenzahl je Termin multipliziert, um
            den geschätzten Deckungsbeitrag zu berechnen.
          </p>
          <input
            type="number"
            step="0.01"
            min="0"
            id="fremdkosten_pro_person_netto"
            name="fremdkosten_pro_person_netto"
            defaultValue={fremdkosten}
            style={{ maxWidth: "220px", marginBottom: "1rem", display: "block" }}
          />
          <button type="submit" className="au-btn au-btn-primary">
            Speichern
          </button>
        </form>

        {konfig?.aktualisiert_am && (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: "1rem" }}>
            Zuletzt geändert: {formatDatumZeit(konfig.aktualisiert_am)}
            {konfig.aktualisiert_von ? ` von ${konfig.aktualisiert_von}` : ""}
          </p>
        )}
      </div>

      <div className="au-card">
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
          Aktueller Wert zur Kontrolle: {formatEUR(fremdkosten)} pro Person.
        </p>
      </div>
    </main>
  );
}
