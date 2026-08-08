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
        <Link href="/buchungen/neu" className="au-btn au-btn-primary">+ Neue Buchung</Link>
      </div>

      <table className="au-table">
        <thead>
          <tr>
            <th>Buchungsnr.</th>
            <th>Rechnungsempfänger</th>
            <th>Seminar</th>
            <th>Preis (netto)</th>
            <th>Preis (brutto)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {buchungen?.map((b: any) => (
            <tr key={b.id}>
              <td><Link href={`/buchungen/${b.id}`}>{b.buchungsnummer}</Link></td>
              <td>{b.organisationen?.name || (b.teilnehmer ? `${b.teilnehmer.vorname} ${b.teilnehmer.nachname}` : "—")}</td>
              <td>{b.buchungspositionen?.[0]?.seminartermine?.seminartypen?.name || "—"}</td>
              <td>{formatEUR(b.buchungspositionen?.reduce((sum: number, p: any) => sum + Number(p.preis || 0), 0) || 0)}</td>
              <td>{formatEURBrutto(b.buchungspositionen?.reduce((sum: number, p: any) => sum + Number(p.preis || 0), 0) || 0)}</td>
              <td>{b.status}</td>
            </tr>
          ))}
          {!buchungen?.length && (
            <tr className="au-table-empty"><td colSpan={6}>Noch keine Buchungen erfasst.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
