export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import { setMarketingConsentStatus } from "@/lib/actions";

const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };
const dl: React.CSSProperties = { display: "grid", gridTemplateColumns: "220px 1fr", rowGap: "0.6rem", columnGap: "1rem" };
const dt: React.CSSProperties = { color: "#666", fontSize: "0.85rem", fontWeight: 600 };

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
      <p><Link href="/teilnehmer" style={{ color: "#102A4C" }}>← Zurück zur Liste</Link></p>
      <h1>{t.vorname} {t.nachname}</h1>

      <div style={card}>
        <h2>Stammdaten</h2>
        <div style={dl}>
          <div style={dt}>E-Mail</div>
          <div>{t.email}</div>
          <div style={dt}>Telefon</div>
          <div>{t.telefon || "—"}</div>
          <div style={dt}>LinkedIn</div>
          <div>{t.linkedin_url ? <a href={t.linkedin_url} target="_blank" rel="noreferrer">{t.linkedin_url}</a> : "—"}</div>
          <div style={dt}>Ernährung / Sonderwünsche</div>
          <div>{t.ernaehrung_sonderwuensche || "—"}</div>
          <div style={dt}>Teilnehmerliste Opt-out</div>
          <div>{t.teilnehmerliste_opt_out ? "Ja — nicht auf Teilnehmerlisten aufführen" : "Nein"}</div>
          <div style={dt}>Marketing-Consent</div>
          <div>
            <form action={setMarketingConsentStatus} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="id" value={t.id} />
              <select name="status" defaultValue={t.marketing_consent_status || "unbekannt"} style={{ padding: "0.35rem" }}>
                <option value="abonniert">abonniert</option>
                <option value="keine_zustimmung">keine_zustimmung</option>
                <option value="abgemeldet">abgemeldet (bekommt keine Funnel-Mails)</option>
                <option value="unbekannt">unbekannt</option>
              </select>
              <button
                type="submit"
                style={{ background: "#102A4C", color: "white", border: "none", padding: "0.4rem 0.8rem", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Speichern
              </button>
              <span style={{ color: "#666", fontSize: "0.8rem" }}>
                {t.marketing_consent_zeitpunkt ? `seit ${formatDatum(t.marketing_consent_zeitpunkt)}` : ""}
                {t.marketing_consent_quelle ? ` · Quelle: ${t.marketing_consent_quelle}` : ""}
              </span>
            </form>
            {t.marketing_consent_status === "abgemeldet" && (
              <p style={{ color: "#8a1f1f", fontSize: "0.8rem", marginTop: "0.35rem", marginBottom: 0 }}>
                Abgemeldet — erhält garantiert keine Funnel-/Serien-Mails mehr.
              </p>
            )}
          </div>
          <div style={dt}>Erfasst am</div>
          <div>{formatDatum(t.erstellt_am)}</div>
          {t.deaktiviert_am && (
            <>
              <div style={dt}>Deaktiviert am</div>
              <div>{formatDatum(t.deaktiviert_am)}</div>
            </>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Buchungen</h2>
          <Link
            href={`/buchungen/neu?teilnehmer_id=${id}`}
            style={{ background: "#102A4C", color: "white", padding: "0.5rem 1rem", textDecoration: "none", fontSize: "0.9rem" }}
          >
            + Neue Buchung anlegen
          </Link>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Buchungsnr.</th>
              <th style={{ padding: "0.4rem" }}>Leistung</th>
              <th style={{ padding: "0.4rem" }}>Organisation</th>
              <th style={{ padding: "0.4rem" }}>Preis (netto)</th>
              <th style={{ padding: "0.4rem" }}>Preis (brutto)</th>
              <th style={{ padding: "0.4rem" }}>Status</th>
              <th style={{ padding: "0.4rem" }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {positionen?.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>
                  {p.buchungen?.buchungsnummer}
                </td>
                <td style={{ padding: "0.4rem" }}>
                  {p.seminartermine
                    ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                    : `${p.beschreibung} (individuell${p.startdatum ? `, ab ${formatDatum(p.startdatum)}` : ""})`}
                </td>
                <td style={{ padding: "0.4rem" }}>{p.buchungen?.organisationen?.name || "—"}</td>
                <td style={{ padding: "0.4rem" }}>{formatEUR(Number(p.preis || 0))}</td>
                <td style={{ padding: "0.4rem" }}>{formatEURBrutto(Number(p.preis || 0))}</td>
                <td style={{ padding: "0.4rem" }}>{p.buchungen?.status}</td>
                <td style={{ padding: "0.4rem" }}>
                  <Link href={`/buchungen/${p.buchungen?.id}`} style={{ color: "#102A4C" }}>Bearbeiten / Umbuchen / Stornieren →</Link>
                </td>
              </tr>
            ))}
            {!positionen?.length && (
              <tr><td colSpan={7} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Buchungen.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {!!legacyBuchungen?.length && (
        <div style={card}>
          <h2>Historische Teilnahmen (Altdaten)</h2>
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
