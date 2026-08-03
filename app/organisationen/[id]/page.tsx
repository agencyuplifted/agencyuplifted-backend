export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";

const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };
const dl: React.CSSProperties = { display: "grid", gridTemplateColumns: "220px 1fr", rowGap: "0.6rem", columnGap: "1rem" };
const dt: React.CSSProperties = { color: "#666", fontSize: "0.85rem", fontWeight: 600 };

export default async function OrganisationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: o } = await supabase.from("organisationen").select("*").eq("id", id).single();

  const { data: buchungen } = await supabase
    .from("buchungen")
    .select(
      "*, buchungspositionen(*, teilnehmer(vorname, nachname), seminartermine(datum_start, seminartypen(name)), seminartermin_optionen(titel))"
    )
    .eq("organisation_id", id)
    .order("gebucht_am", { ascending: false });

  const { data: legacyBuchungen } = await supabase
    .from("legacy_buchungen")
    .select("*, seminartypen(name)")
    .eq("organisation_id", id)
    .order("jahr", { ascending: false });

  if (!o) return <main><p>Organisation nicht gefunden.</p></main>;

  const adresse = [o.rechnungsadresse_strasse, [o.rechnungsadresse_plz, o.rechnungsadresse_ort].filter(Boolean).join(" "), o.rechnungsadresse_land]
    .filter(Boolean)
    .join(", ");

  return (
    <main>
      <p><Link href="/organisationen" style={{ color: "#102A4C" }}>← Zurück zur Liste</Link></p>
      <h1>{o.name}</h1>

      <div style={card}>
        <h2>Stammdaten</h2>
        <div style={dl}>
          <div style={dt}>Rechnungsadresse</div>
          <div>{adresse || "—"}</div>
          <div style={dt}>USt-ID</div>
          <div>{o.ust_id || "—"}</div>
          <div style={dt}>Branche</div>
          <div>{o.branche || "—"}</div>
          <div style={dt}>Notizen</div>
          <div>{o.notizen || "—"}</div>
          <div style={dt}>Erfasst am</div>
          <div>{formatDatum(o.erstellt_am)}</div>
          {o.deaktiviert_am && (
            <>
              <div style={dt}>Deaktiviert am</div>
              <div>{formatDatum(o.deaktiviert_am)}</div>
            </>
          )}
        </div>
      </div>

      <div style={card}>
        <h2>Buchungen</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Buchungsnr.</th>
              <th style={{ padding: "0.4rem" }}>Teilnehmer</th>
              <th style={{ padding: "0.4rem" }}>Leistung</th>
              <th style={{ padding: "0.4rem" }}>Preis (netto)</th>
              <th style={{ padding: "0.4rem" }}>Preis (brutto)</th>
              <th style={{ padding: "0.4rem" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {buchungen?.flatMap((b: any) =>
              (b.buchungspositionen || []).map((p: any) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.4rem" }}>
                    <Link href={`/buchungen/${b.id}`} style={{ color: "#102A4C" }}>{b.buchungsnummer}</Link>
                  </td>
                  <td style={{ padding: "0.4rem" }}>{p.teilnehmer?.vorname} {p.teilnehmer?.nachname}</td>
                  <td style={{ padding: "0.4rem" }}>
                    {p.seminartermine
                      ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                      : `${p.beschreibung} (individuell)`}
                  </td>
                  <td style={{ padding: "0.4rem" }}>{formatEUR(Number(p.preis || 0))}</td>
                  <td style={{ padding: "0.4rem" }}>{formatEURBrutto(Number(p.preis || 0))}</td>
                  <td style={{ padding: "0.4rem" }}>{b.status}</td>
                </tr>
              ))
            )}
            {!buchungen?.length && (
              <tr><td colSpan={6} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Buchungen.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!legacyBuchungen?.length && (
        <div style={card}>
          <h2>Historische Seminare (Altdaten)</h2>
          <p style={{ color: "#666", fontSize: "0.85rem" }}>
            Aus dem Pipedrive-Import übernommen — nicht als vollständige Buchung im neuen System erfasst.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: "0.4rem" }}>Jahr</th>
                <th style={{ padding: "0.4rem" }}>Seminar</th>
                <th style={{ padding: "0.4rem" }}>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {legacyBuchungen.map((l: any) => (
                <tr key={l.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.4rem" }}>{l.jahr || "—"}</td>
                  <td style={{ padding: "0.4rem" }}>{l.seminartypen?.name || l.kategorie_rohtext || "—"}</td>
                  <td style={{ padding: "0.4rem" }}>{l.quelle || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
