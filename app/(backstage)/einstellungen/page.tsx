export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEUR, formatDatumZeit } from "@/lib/format";
import { updateFinanzKonfiguration, speichereFastbillVorlage } from "@/lib/actions";
import { fastbillVorlagen } from "@/lib/fastbill";
import AktionsFormular from "../AktionsFormular";
import { ladeKostenVergleich } from "@/lib/deckungsbeitrag";
import Link from "next/link";

export default async function EinstellungenPage() {
  const supabase = getSupabaseAdmin();
  const { data: konfig } = await supabase
    .from("finanz_konfiguration")
    .select("*")
    .eq("id", 1)
    .single();

  const fremdkosten = Number(konfig?.fremdkosten_pro_person_netto ?? 300);
  const vergleich = await ladeKostenVergleich(supabase);
  // Vorlagen live aus FastBill -- schlaegt der Abruf fehl, bleibt das Feld frei eintragbar.
  let vorlagen: { id: string; name: string }[] = [];
  let vorlagenFehler: string | null = null;
  try {
    vorlagen = await fastbillVorlagen();
  } catch (e: any) {
    vorlagenFehler = e?.message || "FastBill nicht erreichbar.";
  }

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

      <div className="au-card" id="fastbill">
        <h2>Seminar-Rechnungen (FastBill)</h2>
        <p style={{ color: "var(--color-text-muted)" }}>
          Standard für Rechnungsentwürfe in FastBill (Buchungsseite → Bereich „Rechnung“). Positionstexte und eigene FastBill-Vorlagen pro Kategorie pflegst Du unter{" "}
          <Link href="/seminartypen#rechnungstexte">Seminarkategorien → Rechnungstexte</Link>; was dort leer ist, kommt von hier.
        </p>
        <AktionsFormular action={speichereFastbillVorlage} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flexBasis: "100%" }}>
            <label className="au-label">Einleitungstext (nach der Anrede der FastBill-Vorlage)</label>
            <textarea name="rechnung_einleitung" className="au-input" rows={2} defaultValue={konfig?.rechnung_einleitung || ""} />
            <label className="au-label">Positionsvorlage – Standard für alle Seminare</label>
            <textarea name="rechnung_positionsvorlage" className="au-input" rows={10} defaultValue={konfig?.rechnung_positionsvorlage || ""} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }} />
            <label className="au-label">Position „weitere Teilnehmer“ (ab der zweiten Person derselben Option)</label>
            <textarea name="rechnung_zusatz_vorlage" className="au-input" rows={3} defaultValue={konfig?.rechnung_zusatz_vorlage || ""} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }} />
            <label className="au-label">Preisstufen-Zeile (Platzhalter {"{{preisstufe}}"}; nur bei Preis unter dem Normalpreis – {"{{stufe}}"}, {"{{stufen}}"}, {"{{normalpreis}}"})</label>
            <input name="rechnung_preisstufe_text" className="au-input" defaultValue={konfig?.rechnung_preisstufe_text || ""} />
            <p className="au-klein" style={{ margin: "-0.4rem 0 0.75rem" }}>
              Platzhalter der Vorlagen: <Link href="/seminartypen#rechnungstexte">Liste bei den Seminarkategorien</Link>. Ratenzahlung erzeugt automatisch einen Zahlungsplan unter der Einleitung.
            </p>
            <label className="au-label">FastBill-Vorlage (Standard)</label>
          </div>
          {vorlagen.length ? (
            <select name="fastbill_template_id" className="au-select" defaultValue={konfig?.fastbill_template_id || ""} style={{ width: "auto", minWidth: 280, marginBottom: 0 }}>
              <option value="">— FastBill-Standardvorlage —</option>
              {vorlagen.map((v) => (
                <option key={v.id} value={v.id}>{v.name} (ID {v.id})</option>
              ))}
            </select>
          ) : (
            <input name="fastbill_template_id" className="au-input" defaultValue={konfig?.fastbill_template_id || ""} placeholder="Vorlagen-ID (TEMPLATE_ID)" style={{ width: 240, marginBottom: 0 }} />
          )}
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Speichern</button>
        </AktionsFormular>
        {vorlagenFehler && <p className="au-klein" style={{ color: "var(--color-danger)" }}>Vorlagen konnten nicht geladen werden: {vorlagenFehler}</p>}
      </div>

      <div className="au-card">
        <h2>Pauschale vs. echte Kosten</h2>
        {/* Lernen aus den Hotelrechnungen: wie gut trifft die Pauschale? */}
        {!vergleich ? (
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Noch keine Kostenbelege. Echte Hotelrechnungen trägst du am Termin im Reiter „Teilnehmer“ unter „Fremdkosten &amp; Belege“ ein.
          </p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              Ø echte Fremdkosten: <strong>{formatEUR(Math.round(vergleich.durchschnittProPerson))}</strong> pro Person
              {" "}· eingestellte Pauschale {formatEUR(fremdkosten)}
              {" "}({vergleich.durchschnittProPerson <= fremdkosten ? "Pauschale liegt" : "Pauschale liegt"}{" "}
              {formatEUR(Math.abs(Math.round(fremdkosten - vergleich.durchschnittProPerson)))} {vergleich.durchschnittProPerson <= fremdkosten ? "darüber" : "darunter"})
            </p>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Termin</th>
                  <th style={{ textAlign: "right" }}>Personen</th>
                  <th style={{ textAlign: "right" }}>geschätzt</th>
                  <th style={{ textAlign: "right" }}>echt</th>
                  <th style={{ textAlign: "right" }}>pro Person</th>
                  <th style={{ textAlign: "right" }}>pro Person &amp; Nacht</th>
                </tr>
              </thead>
              <tbody>
                {vergleich.zeilen.map((z: any) => (
                  <tr key={z.id}>
                    <td><Link href={`/termine/${z.id}#teilnehmer`}>{z.kennung}</Link> <span className="au-klein">{z.typ}</span></td>
                    <td style={{ textAlign: "right" }}>{z.personen}</td>
                    <td style={{ textAlign: "right" }}>{formatEUR(z.geschaetzt)}</td>
                    <td style={{ textAlign: "right" }}>{formatEUR(z.echt)}</td>
                    <td style={{ textAlign: "right" }}>{formatEUR(Math.round(z.proPerson))}</td>
                    <td style={{ textAlign: "right" }}>{formatEUR(Math.round(z.proPersonNacht))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="au-klein">Nächte = Seminartage (inkl. Anreise am Vorabend). Konferenz und Seminare haben eigene Sätze pro Option – siehe Termin → Optionen.</p>
          </>
        )}
      </div>
    </main>
  );
}
