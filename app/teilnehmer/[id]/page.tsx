export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import { setMarketingConsentStatus } from "@/lib/actions";

export default async function TeilnehmerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: t } = await supabase.from("teilnehmer").select("*").eq("id", id).single();

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select(
      "*, buchungen(id, buchungsnummer, status, organisationen(name)), seminartermine(datum_start, seminartypen(name)), seminartermin_optionen(titel)"
    )
    .eq("teilnehmer_id", id)
    .order("erstellt_am", { ascending: false });

  const { data: legacyBuchungen } = await supabase
    .from("legacy_buchungen")
    .select("*, seminartypen(name)")
    .eq("teilnehmer_id", id)
    .order("jahr", { ascending: false });

  if (!t) return <main><p>Teilnehmer nicht gefunden.</p></main>;

  return (
    <main>
      <p><Link href="/teilnehmer">← Zurück zur Liste</Link></p>
      <h1>{t.vorname} {t.nachname}</h1>

      <div className="au-card">
        <h2>Stammdaten</h2>
        <div className="au-dl">
          <div className="au-dt">E-Mail</div>
          <div>{t.email}</div>
          <div className="au-dt">Telefon</div>
          <div>{t.telefon || "—"}</div>
          <div className="au-dt">LinkedIn</div>
          <div>{t.linkedin_url ? <a href={t.linkedin_url} target="_blank" rel="noreferrer">{t.linkedin_url}</a> : "—"}</div>
          <div className="au-dt">Ernährung / Sonderwünsche</div>
          <div>{t.ernaehrung_sonderwuensche || "—"}</div>
          <div className="au-dt">Teilnehmerliste Opt-out</div>
          <div>{t.teilnehmerliste_opt_out ? "Ja — nicht auf Teilnehmerlisten aufführen" : "Nein"}</div>
          <div className="au-dt">Marketing-Consent</div>
          <div>
            <form action={setMarketingConsentStatus} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={t.id} />
              <select name="status" defaultValue={t.marketing_consent_status || "unbekannt"} className="au-select" style={{ marginBottom: 0, width: "auto" }}>
                <option value="abonniert">abonniert</option>
                <option value="keine_zustimmung">keine_zustimmung</option>
                <option value="abgemeldet">abgemeldet (bekommt keine Funnel-Mails)</option>
                <option value="unbekannt">unbekannt</option>
              </select>
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
              <span style={{ color: "var(--color-text-faint)", fontSize: "0.8rem" }}>
                {t.marketing_consent_zeitpunkt ? `seit ${formatDatum(t.marketing_consent_zeitpunkt)}` : ""}
                {t.marketing_consent_quelle ? ` · Quelle: ${t.marketing_consent_quelle}` : ""}
              </span>
            </form>
            {t.marketing_consent_status === "abgemeldet" && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", marginTop: "0.35rem", marginBottom: 0 }}>
                Abgemeldet — erhält garantiert keine Funnel-/Serien-Mails mehr.
              </p>
            )}
          </div>
          <div className="au-dt">Erfasst am</div>
          <div>{formatDatum(t.erstellt_am)}</div>
          {t.deaktiviert_am && (
            <>
              <div className="au-dt">Deaktiviert am</div>
              <div>{formatDatum(t.deaktiviert_am)}</div>
            </>
          )}
        </div>
      </div>

      <div className="au-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem" }}>
          <h2 style={{ margin: 0 }}>Buchungen</h2>
          <Link href={`/buchungen/neu?teilnehmer_id=${id}`} className="au-btn au-btn-primary au-btn-sm">
            + Neue Buchung anlegen
          </Link>
        </div>
        <table className="au-table">
          <thead>
            <tr>
              <th>Buchungsnr.</th>
              <th>Leistung</th>
              <th>Organisation</th>
              <th>Preis (netto)</th>
              <th>Preis (brutto)</th>
              <th>Status</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {positionen?.map((p: any) => (
              <tr key={p.id}>
                <td>{p.buchungen?.buchungsnummer}</td>
                <td>
                  {p.seminartermine
                    ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                    : `${p.beschreibung} (individuell${p.startdatum ? `, ab ${formatDatum(p.startdatum)}` : ""})`}
                </td>
                <td>{p.buchungen?.organisationen?.name || "—"}</td>
                <td>{formatEUR(Number(p.preis || 0))}</td>
                <td>{formatEURBrutto(Number(p.preis || 0))}</td>
                <td>{p.buchungen?.status}</td>
                <td><Link href={`/buchungen/${p.buchungen?.id}`}>Bearbeiten / Umbuchen / Stornieren →</Link></td>
              </tr>
            ))}
            {!positionen?.length && (
              <tr className="au-table-empty"><td colSpan={7}>Noch keine Buchungen.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!legacyBuchungen?.length && (
        <div className="au-card">
          <h2>Historische Teilnahmen (Altdaten)</h2>
          <p style={{ fontSize: "0.85rem" }}>
            Aus dem Pipedrive-Import übernommen — nicht als vollständige Buchung im neuen System erfasst.
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
