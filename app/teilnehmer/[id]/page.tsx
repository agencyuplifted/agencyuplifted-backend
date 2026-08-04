export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import {
  setMarketingConsentStatus,
  updateTeilnehmerStammdaten,
  verknuepfeTeilnehmerOrganisation,
  entferneTeilnehmerOrganisation,
  setzeHauptorganisation,
} from "@/lib/actions";

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

  const { data: verknuepfteOrgs } = await supabase
    .from("teilnehmer_organisationen")
    .select("id, ist_hauptorganisation, quelle, organisationen(id, name)")
    .eq("teilnehmer_id", id)
    .order("ist_hauptorganisation", { ascending: false });

  const verknuepfteOrgIds = new Set((verknuepfteOrgs || []).map((v: any) => v.organisationen?.id));
  const { data: alleOrganisationen } = await supabase
    .from("organisationen")
    .select("id, name")
    .order("name", { ascending: true });
  const waehlbareOrganisationen = (alleOrganisationen || []).filter((o) => !verknuepfteOrgIds.has(o.id));

  if (!t) return <main><p>Teilnehmer nicht gefunden.</p></main>;

  return (
    <main>
      <p><Link href="/teilnehmer">← Zurück zur Liste</Link></p>
      <h1>{t.vorname} {t.nachname}</h1>

      <div className="au-card">
        <h2>Stammdaten</h2>
        <form action={updateTeilnehmerStammdaten} style={{ maxWidth: 640 }}>
          <input type="hidden" name="id" value={t.id} />

          <div className="au-row-2">
            <div>
              <label className="au-label">Anrede</label>
              <select className="au-select" name="anrede" defaultValue={t.anrede || "keine_angabe"}>
                <option value="keine_angabe">—</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="Divers">Divers</option>
              </select>
            </div>
            <div>
              <label className="au-label">Geburtsdatum</label>
              <input className="au-input" name="geburtsdatum" type="date" defaultValue={t.geburtsdatum || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Vorname</label>
              <input className="au-input" name="vorname" defaultValue={t.vorname} required />
            </div>
            <div>
              <label className="au-label">Nachname</label>
              <input className="au-input" name="nachname" defaultValue={t.nachname} required />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">E-Mail</label>
              <input className="au-input" name="email" type="email" defaultValue={t.email} required />
            </div>
            <div>
              <label className="au-label">Zweite E-Mail</label>
              <input className="au-input" name="email_zweite" type="email" defaultValue={t.email_zweite || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Telefon</label>
              <input className="au-input" name="telefon" defaultValue={t.telefon || ""} />
            </div>
            <div>
              <label className="au-label">Mobiltelefon</label>
              <input className="au-input" name="mobiltelefon" defaultValue={t.mobiltelefon || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Position / Jobtitel</label>
              <input className="au-input" name="position" defaultValue={t.position || ""} />
            </div>
            <div>
              <label className="au-label">Firma (falls keine Organisation im System)</label>
              <input className="au-input" name="firma_freitext" defaultValue={t.firma_freitext || ""} />
            </div>
          </div>

          <label className="au-label">LinkedIn-URL</label>
          <input className="au-input" name="linkedin_url" defaultValue={t.linkedin_url || ""} />

          <label className="au-label">Privatadresse (für Hotel-Meldeschein & Rechnungen an Einzelpersonen)</label>
          <input className="au-input" name="privatadresse_strasse" placeholder="Straße, Hausnummer" defaultValue={t.privatadresse_strasse || ""} />
          <div className="au-row-2">
            <input className="au-input" name="privatadresse_plz" placeholder="PLZ" defaultValue={t.privatadresse_plz || ""} />
            <input className="au-input" name="privatadresse_ort" placeholder="Ort" defaultValue={t.privatadresse_ort || ""} />
          </div>
          <input className="au-input" name="privatadresse_land" placeholder="Land" defaultValue={t.privatadresse_land || "Deutschland"} />

          <label className="au-label">Ernährung / Sonderwünsche</label>
          <input className="au-input" name="ernaehrung_sonderwuensche" defaultValue={t.ernaehrung_sonderwuensche || ""} />

          <label className="au-label">Notizen (intern)</label>
          <textarea className="au-textarea" name="notizen" defaultValue={t.notizen || ""} />

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400, marginBottom: "1rem", fontSize: "0.9rem" }}>
            <input type="checkbox" name="teilnehmerliste_opt_out" defaultChecked={t.teilnehmerliste_opt_out} />
            Nicht auf Teilnehmerlisten aufführen (Opt-out)
          </label>

          <button type="submit" className="au-btn au-btn-primary">Stammdaten speichern</button>
        </form>

        <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px solid var(--color-border)" }}>
          <div className="au-dt" style={{ marginBottom: "0.5rem" }}>Marketing-Consent (Funnel-Mails)</div>
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

        <p style={{ fontSize: "0.8rem", color: "var(--color-text-faint)", marginTop: "1rem", marginBottom: 0 }}>
          Erfasst am {formatDatum(t.erstellt_am)}
          {t.deaktiviert_am ? ` · Deaktiviert am ${formatDatum(t.deaktiviert_am)}` : ""}
        </p>
      </div>

      <div className="au-card">
        <h2>Organisationen</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-faint)" }}>
          Ein Teilnehmer kann mehreren Organisationen zugeordnet sein (z. B. mehrere mögliche Rechnungsempfänger). Eine davon ist als Hauptorganisation markiert.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Hauptorganisation</th>
              <th>Quelle</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {verknuepfteOrgs?.map((v: any) => (
              <tr key={v.id}>
                <td><Link href={`/organisationen/${v.organisationen?.id}`}>{v.organisationen?.name}</Link></td>
                <td>
                  {v.ist_hauptorganisation ? (
                    <span className="au-badge au-badge-success">Haupt</span>
                  ) : (
                    <form action={setzeHauptorganisation}>
                      <input type="hidden" name="teilnehmer_id" value={id} />
                      <input type="hidden" name="organisation_id" value={v.organisationen?.id} />
                      <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Als Haupt setzen</button>
                    </form>
                  )}
                </td>
                <td>{v.quelle}</td>
                <td>
                  <form action={entferneTeilnehmerOrganisation}>
                    <input type="hidden" name="teilnehmer_id" value={id} />
                    <input type="hidden" name="organisation_id" value={v.organisationen?.id} />
                    <button type="submit" className="au-btn au-btn-danger au-btn-sm">Entfernen</button>
                  </form>
                </td>
              </tr>
            ))}
            {!verknuepfteOrgs?.length && (
              <tr className="au-table-empty"><td colSpan={4}>Noch keine Organisation verknüpft.</td></tr>
            )}
          </tbody>
        </table>
        {!!waehlbareOrganisationen.length && (
          <form action={verknuepfeTeilnehmerOrganisation} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.9rem" }}>
            <input type="hidden" name="teilnehmer_id" value={id} />
            <select name="organisation_id" className="au-select" style={{ marginBottom: 0, width: "auto", minWidth: "260px" }} required>
              <option value="">— Organisation wählen —</option>
              {waehlbareOrganisationen.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button type="submit" className="au-btn au-btn-primary au-btn-sm">Verknüpfen</button>
          </form>
        )}
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
