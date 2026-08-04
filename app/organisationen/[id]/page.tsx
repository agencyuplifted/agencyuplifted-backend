export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";

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
      <p><Link href="/organisationen">← Zurück zur Liste</Link></p>
      <h1>{o.name}</h1>

      <div className="au-card">
        <h2>Stammdaten</h2>
        <div className="au-dl">
          <div className="au-dt">Rechnungsadresse</div>
          <div>{adresse || "—"}</div>
          <div className="au-dt">USt-ID</div>
          <div>{o.ust_id || "—"}</div>
          <div className="au-dt">Branche</div>
          <div>{o.branche || "—"}</div>
          <div className="au-dt">Notizen</div>
          <div>{o.notizen || "—"}</div>
          <div className="au-dt">Erfasst am</div>
          <div>{formatDatum(o.erstellt_am)}</div>
          {o.deaktiviert_am && (
            <>
              <div className="au-dt">Deaktiviert am</div>
              <div>{formatDatum(o.deaktiviert_am)}</div>
            </>
          )}
        </div>
      </div>

      <div className="au-card">
        <h2>Buchungen</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Buchungsnr.</th>
              <th>Teilnehmer</th>
              <th>Leistung</th>
              <th>Preis (netto)</th>
              <th>Preis (brutto)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {buchungen?.flatMap((b: any) =>
              (b.buchungspositionen || []).map((p: any) => (
                <tr key={p.id}>
                  <td><Link href={`/buchungen/${b.id}`}>{b.buchungsnummer}</Link></td>
                  <td>{p.teilnehmer?.vorname} {p.teilnehmer?.nachname}</td>
                  <td>
                    {p.seminartermine
                      ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                      : `${p.beschreibung} (individuell)`}
                  </td>
                  <td>{formatEUR(Number(p.preis || 0))}</td>
                  <td>{formatEURBrutto(Number(p.preis || 0))}</td>
                  <td>{b.status}</td>
                </tr>
              ))
            )}
            {!buchungen?.length && (
              <tr className="au-table-empty"><td colSpan={6}>Noch keine Buchungen.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!legacyBuchungen?.length && (
        <div className="au-card">
          <h2>Historische Seminare (Altdaten)</h2>
          <p style={{ fontSize: "0.85rem" }}>
            Aus dem Alt-System importiert — nicht als vollständige Buchung im neuen System erfasst.
          </p>
          <table className="au-table">
            <thead>
              <tr>
                <th>Jahr</th>
                <th>Seminar</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {legacyBuchungen.map((l: any) => (
                <tr key={l.id}>
                  <td>{l.jahr || "—"}</td>
                  <td>{l.seminartypen?.name || l.kategorie_rohtext || "—"}</td>
                  <td>{l.quelle || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
