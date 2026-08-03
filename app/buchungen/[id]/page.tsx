export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { stornoBuchung, umbuchenBuchung } from "@/lib/actions";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };
const btn: React.CSSProperties = { background: "#102A4C", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" };
const btnDanger: React.CSSProperties = { background: "#8a1f1f", color: "white", padding: "0.55rem 1rem", border: "none", cursor: "pointer" };

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
      <p style={{ color: "#666" }}>
        Status: <strong>{buchung.status}</strong> · Rechnungsempfänger: {buchung.organisationen?.name || (buchung.teilnehmer ? `${buchung.teilnehmer.vorname} ${buchung.teilnehmer.nachname}` : "—")} · Gebucht am {formatDatum(buchung.gebucht_am)}
      </p>

      <div style={card}>
        <h2>Positionen</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Teilnehmer</th>
              <th style={{ padding: "0.4rem" }}>Leistung</th>
              <th style={{ padding: "0.4rem" }}>Preis (netto)</th>
              <th style={{ padding: "0.4rem" }}>Preis (brutto)</th>
            </tr>
          </thead>
          <tbody>
            {positionen?.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{p.teilnehmer?.vorname} {p.teilnehmer?.nachname}</td>
                <td style={{ padding: "0.4rem" }}>
                  {p.seminartermine
                    ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                    : `${p.beschreibung} (individuell${p.startdatum ? `, ab ${formatDatum(p.startdatum)}` : ""})`}
                </td>
                <td style={{ padding: "0.4rem" }}>{formatEUR(Number(p.preis || 0))}</td>
                <td style={{ padding: "0.4rem" }}>{formatEURBrutto(Number(p.preis || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {buchung.status !== "storniert" && positionen?.filter((p: any) => p.seminartermin_id).map((p: any) => (
          <form key={p.id} action={umbuchenBuchung} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <input type="hidden" name="position_id" value={p.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={labelStyle}>Umbuchen auf ({p.teilnehmer?.vorname} {p.teilnehmer?.nachname})</label>
              <select style={inputStyle} name="neuer_seminartermin_id" required>
                <option value="">— neuer Termin wählen —</option>
                {termine?.filter((t: any) => t.id !== p.seminartermine?.id).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.seminartypen?.name} – {formatDatum(t.datum_start)}</option>
                ))}
              </select>
            </div>
            <button type="submit" style={btn}>Umbuchen</button>
          </form>
        ))}
      </div>

      {buchung.status !== "storniert" && (
        <div style={card}>
          <h2>Stornieren</h2>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>Keine Erstattung, kein Ersatz von Reise- oder sonstigen Kosten — laut AGB.</p>
          <form action={stornoBuchung} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={labelStyle}>Grund (optional)</label>
              <input style={inputStyle} name="grund" placeholder="z. B. Krankheit, Terminkonflikt" />
            </div>
            <button type="submit" style={btnDanger}>Buchung stornieren</button>
          </form>
        </div>
      )}

      <div style={card}>
        <h2>Änderungsprotokoll</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Datum</th>
              <th style={{ padding: "0.4rem" }}>Ereignis</th>
              <th style={{ padding: "0.4rem" }}>Beschreibung</th>
              <th style={{ padding: "0.4rem" }}>Bearbeiter</th>
            </tr>
          </thead>
          <tbody>
            {protokoll?.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{formatDatum(e.erstellt_am)}</td>
                <td style={{ padding: "0.4rem" }}>{e.ereignis}</td>
                <td style={{ padding: "0.4rem" }}>{e.beschreibung}</td>
                <td style={{ padding: "0.4rem" }}>{e.bearbeiter || "—"}</td>
              </tr>
            ))}
            {!protokoll?.length && (
              <tr><td colSpan={4} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
