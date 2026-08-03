export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEUR, formatEURBrutto } from "@/lib/format";

export default async function BuchungenPage() {
  const supabase = getSupabaseAdmin();
  const { data: buchungen } = await supabase
    .from("buchungen")
    .select("*, organisationen(name), teilnehmer:rechnungsempfaenger_teilnehmer_id(vorname, nachname), buchungspositionen(preis, seminartermine(datum_start, seminartypen(name)))")
    .order("gebucht_am", { ascending: false });

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Buchungen</h1>
        <Link href="/buchungen/neu" style={{ background: "#102A4C", color: "white", padding: "0.5rem 1rem", textDecoration: "none" }}>
          + Neue Buchung
        </Link>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #102A4C" }}>
            <th style={{ padding: "0.5rem" }}>Buchungsnr.</th>
            <th style={{ padding: "0.5rem" }}>Rechnungsempfänger</th>
            <th style={{ padding: "0.5rem" }}>Seminar</th>
            <th style={{ padding: "0.5rem" }}>Preis (netto)</th>
            <th style={{ padding: "0.5rem" }}>Preis (brutto)</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {buchungen?.map((b: any) => (
            <tr key={b.id} style={{ borderBottom: "1px solid #e2e2e2" }}>
              <td style={{ padding: "0.5rem" }}><Link href={`/buchungen/${b.id}`} style={{ color: "#102A4C" }}>{b.buchungsnummer}</Link></td>
              <td style={{ padding: "0.5rem" }}>
                {b.organisationen?.name || (b.teilnehmer ? `${b.teilnehmer.vorname} ${b.teilnehmer.nachname}` : "—")}
              </td>
              <td style={{ padding: "0.5rem" }}>
                {b.buchungspositionen?.[0]?.seminartermine?.seminartypen?.name || "—"}
              </td>
              <td style={{ padding: "0.5rem" }}>
                {formatEUR(b.buchungspositionen?.reduce((sum: number, p: any) => sum + Number(p.preis || 0), 0) || 0)}
              </td>
              <td style={{ padding: "0.5rem" }}>
                {formatEURBrutto(b.buchungspositionen?.reduce((sum: number, p: any) => sum + Number(p.preis || 0), 0) || 0)}
              </td>
              <td style={{ padding: "0.5rem" }}>{b.status}</td>
            </tr>
          ))}
          {!buchungen?.length && (
            <tr><td colSpan={6} style={{ padding: "0.5rem", color: "#888" }}>Noch keine Buchungen erfasst.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
