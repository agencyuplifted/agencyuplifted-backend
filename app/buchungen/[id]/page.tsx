export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { stornoBuchung, umbuchenBuchung } from "@/lib/actions";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";

export default async function BuchungDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: buchung } = await supabase
    .from("buchungen")
    .select("*, organisationen(name), teilnehmer:rechnungsempfaenger_teilnehmer_id(vorname, nachname, email)")
    .eq("id", id)
    .single();

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("*, teilnehmer(vorname, nachname, email), seminartermine(id, datum_start, seminartypen(name)), seminartermin_optionen(titel)")
    .eq("buchung_id", id);

  const { data: protokoll } = await supabase
    .from("aenderungsprotokoll")
    .select("*")
    .eq("bezug_typ", "buchung")
    .eq("bezug_id", id)
    .order("erstellt_am", { ascending: false });

  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .order("datum_start");

  if (!buchung) return <main><p>Buchung nicht gefunden.</p></main>;

  return (
    <main>
      <h1>Buchung {buchung.buchungsnummer}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Status: <strong>{buchung.status}</strong> · Rechnungsempfänger: {buchung.organisationen?.name || (buchung.teilnehmer ? `${buchung.teilnehmer.vorname} ${buchung.teilnehmer.nachname}` : "—")} · Gebucht am {formatDatum(buchung.gebucht_am)}
      </p>

      <div className="au-card">
        <h2>Positionen</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Leistung</th>
              <th>Preis (netto)</th>
              <th>Preis (brutto)</th>
            </tr>
          </thead>
          <tbody>
            {positionen?.map((p: any) => (
              <tr key={p.id}>
                <td>{p.teilnehmer?.vorname} {p.teilnehmer?.nachname}</td>
                <td>
                  {p.seminartermine
                    ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                    : `${p.beschreibung} (individuell${p.startdatum ? `, ab ${formatDatum(p.startdatum)}` : ""})`}
                </td>
                <td>{formatEUR(Number(p.preis || 0))}</td>
                <td>{formatEURBrutto(Number(p.preis || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {buchung.status !== "storniert" && positionen?.filter((p: any) => p.seminartermin_id).map((p: any) => (
          <form key={p.id} action={umbuchenBuchung} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <input type="hidden" name="position_id" value={p.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="au-label">Umbuchen auf ({p.teilnehmer?.vorname} {p.teilnehmer?.nachname})</label>
              <select className="au-input" name="neuer_seminartermin_id" required>
                <option value="">— neuer Termin wählen —</option>
                {termine?.filter((t: any) => t.id !== p.seminartermine?.id).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.seminartypen?.name} – {formatDatum(t.datum_start)}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="au-btn au-btn-primary">Umbuchen</button>
          </form>
        ))}
      </div>

      {buchung.status !== "storniert" && (
        <div className="au-card">
          <h2>Stornieren</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Keine Erstattung, kein Ersatz von Reise- oder sonstigen Kosten — laut AGB.</p>
          <form action={stornoBuchung} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="au-label">Grund (optional)</label>
              <input className="au-input" name="grund" placeholder="z. B. Krankheit, Terminkonflikt" />
            </div>
            <button type="submit" className="au-btn au-btn-danger-solid">Buchung stornieren</button>
          </form>
        </div>
      )}

      <div className="au-card">
        <h2>Änderungsprotokoll</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ereignis</th>
              <th>Beschreibung</th>
              <th>Bearbeiter</th>
            </tr>
          </thead>
          <tbody>
            {protokoll?.map((e) => (
              <tr key={e.id}>
                <td>{formatDatum(e.erstellt_am)}</td>
                <td>{e.ereignis}</td>
                <td>{e.beschreibung}</td>
                <td>{e.bearbeiter || "—"}</td>
              </tr>
            ))}
            {!protokoll?.length && (
              <tr><td colSpan={4} style={{ color: "var(--color-text-faint)" }}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
