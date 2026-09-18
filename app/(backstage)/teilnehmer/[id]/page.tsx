export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import { renderTextMitLinks } from "@/lib/richtext";
import {
  setMarketingConsentStatus,
  updateTeilnehmerStammdaten,
  verknuepfeTeilnehmerOrganisation,
  entferneTeilnehmerOrganisation,
  setzeHauptorganisation,
  createTeilnehmerReferenz,
  deleteTeilnehmerReferenz,
  toggleReferenzFreigabe,
  setzeTeilnehmerTags,
} from "@/lib/actions";
import PasteImageField from "../PasteImageField";
import SeitenTabs from "../../SeitenTabs";
import TagAuswahl from "./TagAuswahl";

const consentBadgeClass: Record<string, string> = {
  abonniert: "au-badge-success",
  abgemeldet: "au-badge-danger",
  keine_zustimmung: "au-badge-neutral",
  unbekannt: "au-badge-neutral",
};

export default async function TeilnehmerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Parallel statt nacheinander -- jede Abfrage ist ein eigener DB-Round-Trip.
  const [{ data: t }, { data: positionen }, { data: legacyBuchungen }, { data: verknuepfteOrgs }, { data: alleOrganisationen }, { data: referenzen }, { data: alleTags }, { data: meineTags }] =
    await Promise.all([
      supabase.from("teilnehmer").select("*").eq("id", id).single(),
      supabase
        .from("buchungspositionen")
        .select(
          "*, buchungen(id, buchungsnummer, status, organisationen(name)), seminartermine(id, datum_start, titel, kennung, seminartypen(name)), seminartermin_optionen(titel)"
        )
        .eq("teilnehmer_id", id)
        .order("erstellt_am", { ascending: false }),
      supabase.from("legacy_buchungen").select("*, seminartypen(name), seminartermine(id, datum_start, titel, kennung)").eq("teilnehmer_id", id).order("jahr", { ascending: false }),
      supabase
        .from("teilnehmer_organisationen")
        .select("id, ist_hauptorganisation, quelle, organisationen(id, name)")
        .eq("teilnehmer_id", id)
        .order("ist_hauptorganisation", { ascending: false }),
      supabase.from("organisationen").select("id, name").order("name", { ascending: true }),
      supabase.from("teilnehmer_referenzen").select("*").eq("teilnehmer_id", id).order("erstellt_am", { ascending: false }),
      supabase.from("tags").select("id, label, aktiv").order("label"),
      supabase.from("teilnehmer_tags").select("tag_id, quelle, gesetzt_am").eq("teilnehmer_id", id),
    ]);
  const tagLabel = new Map((alleTags || []).map((tg: any) => [tg.id, tg.label]));
  const verknuepfteOrgIds = new Set((verknuepfteOrgs || []).map((v: any) => v.organisationen?.id));
  const waehlbareOrganisationen = (alleOrganisationen || []).filter((o) => !verknuepfteOrgIds.has(o.id));

  const referenzenMitUrls = (referenzen || []).map((r: any) => ({
    ...r,
    profilfotoUrl: r.profilfoto_pfad ? supabase.storage.from("referenzen").getPublicUrl(r.profilfoto_pfad).data.publicUrl : null,
    agenturLogoUrl: r.agentur_logo_pfad ? supabase.storage.from("referenzen").getPublicUrl(r.agentur_logo_pfad).data.publicUrl : null,
  }));

  if (!t) return <main><p>Teilnehmer nicht gefunden.</p></main>;

  const hauptOrg: any = verknuepfteOrgs?.find((v: any) => v.ist_hauptorganisation);
  const consentStatus = t.marketing_consent_status || "unbekannt";
  const hatWeitereAngaben = !!(
    t.privatadresse_strasse ||
    t.privatadresse_plz ||
    t.privatadresse_ort ||
    t.linkedin_url ||
    t.ernaehrung_sonderwuensche ||
    t.notizen
  );

  const aktivePositionen = (positionen || []).filter((p: any) => p.buchungen?.status !== "storniert");
  const umsatzNetto = aktivePositionen.reduce((summe: number, p: any) => summe + Number(p.preis || 0), 0);

  // Seminar-Historie: neue Buchungen und Altdaten in einer Zeitleiste
  type Station = { key: string; datum: string | null; jahr: number | null; titel: string; zusatz: string | null; href: string | null; quelle: "neu" | "alt"; status?: string };
  const stationen: Station[] = [
    ...(positionen || [])
      .filter((p: any) => p.seminartermine)
      .map((p: any) => ({
        key: `p-${p.id}`,
        datum: p.seminartermine.datum_start,
        jahr: Number(String(p.seminartermine.datum_start).slice(0, 4)),
        titel: p.seminartermine.titel || p.seminartermine.seminartypen?.name || "Seminar",
        zusatz: [p.seminartermine.kennung, p.seminartermin_optionen?.titel].filter(Boolean).join(" · ") || null,
        href: `/termine/${p.seminartermine.id}`,
        quelle: "neu" as const,
        status: p.buchungen?.status,
      })),
    ...(legacyBuchungen || []).map((l: any) => ({
      key: `l-${l.id}`,
      datum: l.seminartermine?.datum_start || null,
      jahr: l.jahr ? Number(l.jahr) : l.seminartermine?.datum_start ? Number(String(l.seminartermine.datum_start).slice(0, 4)) : null,
      titel: l.seminartypen?.name || l.kategorie_rohtext || "Seminar",
      zusatz: l.seminartermine?.kennung || null,
      href: l.seminartermine?.id ? `/termine/${l.seminartermine.id}` : null,
      quelle: "alt" as const,
    })),
  ].sort((a, b) => (b.datum || `${b.jahr || 0}`).localeCompare(a.datum || `${a.jahr || 0}`));
  const teilnahmen = stationen.filter((st) => st.status !== "storniert");
  const jahre = teilnahmen.map((st) => st.jahr).filter((j): j is number => !!j);
  const ersteJahr = jahre.length ? Math.min(...jahre) : null;
  const letztesJahr = jahre.length ? Math.max(...jahre) : null;
  const unternehmerLabel: Record<string, string> = { unternehmer: "Unternehmer:in", mitarbeiter: "Mitarbeiter:in" };
  const rolleLabel: Record<string, string> = { mitarbeiter: "Mitarbeiter (Seminar)", gastreferent: "Gastreferent", organisator: "Organisator" };
  const consentLabel: Record<string, string> = { abonniert: "Marketing: abonniert", abgemeldet: "Marketing: abgemeldet", keine_zustimmung: "Marketing: keine Zustimmung", unbekannt: "Marketing: unbekannt" };
  const initialen = `${(t.vorname || "").charAt(0)}${(t.nachname || "").charAt(0)}`.toUpperCase();

  const uebersicht = (
    <div className="au-dash-raster">
      <div className="au-dash-haupt">
        <Bereich titel="Seminar-Historie" aktion={<Link href={`/buchungen/neu?teilnehmer_id=${id}`} className="au-panel-link">+ Neue Buchung →</Link>}>
          {!stationen.length && <p className="au-leer">Noch keine Seminare.</p>}
          <ol className="au-zeitleiste">
            {stationen.map((st) => (
              <li key={st.key} className={st.status === "storniert" ? "storniert" : undefined}>
                <span className="au-zeitleiste-datum">{st.datum ? formatDatum(st.datum) : st.jahr || "—"}</span>
                <span className="au-zeitleiste-inhalt">
                  {st.href ? <Link href={st.href}>{st.titel}</Link> : <strong>{st.titel}</strong>}
                  <span className="au-klein">
                    {[st.zusatz, st.quelle === "alt" ? "Altdaten" : null, st.status === "storniert" ? "storniert" : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Bereich>
      </div>
      <div className="au-dash-seite">
        <Bereich titel="Kontakt" aktion={<a href="#stammdaten" className="au-panel-link">Bearbeiten →</a>}>
          <dl className="au-eckdaten au-eckdaten-schmal">
            <dt>E-Mail</dt><dd>{t.email ? <a href={`mailto:${t.email}`}>{t.email}</a> : "—"}{t.email_zweite && <><br /><a href={`mailto:${t.email_zweite}`}>{t.email_zweite}</a></>}</dd>
            <dt>Telefon</dt><dd>{t.telefon || "—"}{t.mobiltelefon && <><br />{t.mobiltelefon} (mobil)</>}</dd>
            {t.linkedin_url && (<><dt>LinkedIn</dt><dd><a href={t.linkedin_url} target="_blank" rel="noreferrer">Profil öffnen ↗</a></dd></>)}
            {t.geburtsdatum && (<><dt>Geburtstag</dt><dd>{formatDatum(t.geburtsdatum)}</dd></>)}
            {t.ernaehrung_sonderwuensche && (<><dt>Ernährung</dt><dd>{t.ernaehrung_sonderwuensche}</dd></>)}
          </dl>
        </Bereich>
        <Bereich titel="Organisationen" aktion={<a href="#organisationen" className="au-panel-link">Verwalten →</a>}>
          {!verknuepfteOrgs?.length && <p className="au-leer">{t.firma_freitext || "Keine Organisation verknüpft."}</p>}
          <ul className="au-kompaktliste">
            {(verknuepfteOrgs || []).map((v: any) => (
              <li key={v.id}>
                <Link href={`/organisationen/${v.organisationen?.id}`}>{v.organisationen?.name}</Link>
                {v.ist_hauptorganisation && <span className="au-badge au-badge-success">Haupt</span>}
              </li>
            ))}
          </ul>
        </Bereich>
        <Bereich titel="Tags" aktion={<Link href="/tags" className="au-panel-link">Tags verwalten →</Link>}>
          <TagAuswahl teilnehmerId={id} tags={(alleTags || []) as any[]} gesetzt={(meineTags || []) as any[]} speichernAction={setzeTeilnehmerTags} />
        </Bereich>
        {t.notizen && (
          <Bereich titel="Notizen (intern)">
            <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--color-text)", fontSize: "0.9rem" }}>{t.notizen}</p>
          </Bereich>
        )}
      </div>
    </div>
  );

  const historisch = !!legacyBuchungen?.length && (
    <Bereich titel="Historische Teilnahmen (Altdaten)">
      <p className="au-klein" style={{ marginTop: 0 }}>Aus dem Alt-System importiert – nicht als vollständige Buchung im neuen System erfasst.</p>
      <table className="au-table">
        <thead>
          <tr>
            <th>Jahr</th>
            <th>Seminar</th>
            <th>Quelle</th>
          </tr>
        </thead>
        <tbody>
          {legacyBuchungen!.map((l: any) => (
            <tr key={l.id}>
              <td>{l.jahr || "—"}</td>
              <td>{l.seminartypen?.name || l.kategorie_rohtext || "—"}</td>
              <td>{l.quelle || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Bereich>
  );

  return (
    <main>
      <p className="au-brotkrumen"><Link href="/teilnehmer">Teilnehmer</Link> <span>›</span> {t.vorname} {t.nachname}</p>
      <header className="au-dash-kopf">
        <div className="au-person-kopf">
          <span className="au-initialen au-initialen-gross">{initialen || "?"}</span>
          <div style={{ minWidth: 0 }}>
            <h1>{t.vorname} {t.nachname}</h1>
            <p className="au-termin-unterzeile">
              {t.position}
              {t.position && (hauptOrg || t.firma_freitext) ? " bei " : ""}
              {hauptOrg ? <Link href={`/organisationen/${hauptOrg.organisationen?.id}`}>{hauptOrg.organisationen?.name}</Link> : t.firma_freitext || (!t.position ? "Keine Organisation verknüpft" : "")}
            </p>
            <div className="au-person-etiketten">
              {unternehmerLabel[t.unternehmer_status] && <span className="au-badge au-badge-neutral">{unternehmerLabel[t.unternehmer_status]}</span>}
              {rolleLabel[t.rolle] && <span className="au-badge au-badge-gold">{rolleLabel[t.rolle]}</span>}
              <span className={`au-badge ${consentBadgeClass[consentStatus]}`}>{consentLabel[consentStatus] || consentStatus}</span>
              {t.teilnehmerliste_opt_out && <span className="au-badge au-badge-warning">Listen-Opt-out</span>}
              {t.deaktiviert_am && <span className="au-badge au-badge-neutral">deaktiviert seit {formatDatum(t.deaktiviert_am)}</span>}
              {(meineTags || []).map((mt: any) => tagLabel.get(mt.tag_id) && (
                <span key={mt.tag_id} className="au-badge au-badge-neutral au-badge-tag">#{tagLabel.get(mt.tag_id)}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="au-dash-aktionen">
          <Link href={`/buchungen/neu?teilnehmer_id=${id}`} className="au-btn au-btn-primary au-btn-sm">+ Neue Buchung</Link>
          {t.email && <a href={`mailto:${t.email}`} className="au-btn au-btn-secondary au-btn-sm">E-Mail</a>}
          {(t.mobiltelefon || t.telefon) && <a href={`tel:${String(t.mobiltelefon || t.telefon).replace(/[^\d+]/g, "")}`} className="au-btn au-btn-secondary au-btn-sm">Anrufen</a>}
        </div>
      </header>

      <div className="au-kennzahlen">
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Seminare</div>
          <div className="au-kennzahl-wert">{teilnahmen.length}</div>
          <div className="au-kennzahl-kontext">{aktivePositionen.filter((p: any) => p.seminartermine).length} im neuen System · {legacyBuchungen?.length || 0} Altdaten</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Umsatz netto</div>
          <div className="au-kennzahl-wert">{formatEUR(umsatzNetto)}</div>
          <div className="au-kennzahl-kontext">brutto {formatEURBrutto(umsatzNetto)} · neues System</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Dabei seit</div>
          <div className="au-kennzahl-wert">{ersteJahr || "—"}</div>
          <div className="au-kennzahl-kontext">erfasst am {formatDatum(t.erstellt_am)}</div>
        </div>
        <div className="au-kennzahl">
          <div className="au-kennzahl-label">Zuletzt dabei</div>
          <div className="au-kennzahl-wert">{letztesJahr || "—"}</div>
          <div className="au-kennzahl-kontext">{teilnahmen[0]?.titel || "noch kein Seminar"}</div>
        </div>
      </div>

      <SeitenTabs
        speicherSchluessel={`teilnehmer-${id}`}
        ariaLabel="Bereiche der Person"
        tabs={[
          { key: "uebersicht", label: "Übersicht", inhalt: uebersicht },
          {
            key: "buchungen",
            label: "Buchungen",
            anzahl: positionen?.length || 0,
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel="Buchungen" aktion={<Link href={`/buchungen/neu?teilnehmer_id=${id}`} className="au-panel-link">+ Neue Buchung →</Link>}>
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
                <td><span className={`au-badge ${p.buchungen?.status === "storniert" ? "au-badge-danger" : p.buchungen?.status === "bestaetigt" ? "au-badge-success" : "au-badge-neutral"}`}>{p.buchungen?.status}</span></td>
                <td><Link href={`/buchungen/${p.buchungen?.id}`}>Öffnen →</Link></td>
              </tr>
            ))}
            {!positionen?.length && (
              <tr className="au-table-empty"><td colSpan={7}>Noch keine Buchungen.</td></tr>
            )}
          </tbody>
        </table>
      </Bereich>

                {historisch}
              </div>
            ),
          },
          {
            key: "stammdaten",
            label: "Stammdaten",
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel="Stammdaten">
        <form action={updateTeilnehmerStammdaten} style={{ maxWidth: 640 }}>
          <input type="hidden" name="id" value={t.id} />

          <div className="au-row-3">
            <div>
              <label className="au-label">Anrede</label>
              <select className="au-select" name="anrede" defaultValue={t.anrede || "keine_angabe"}>
                <option value="keine_angabe">—</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="Divers">Divers</option>
              </select>
              {t.anrede_quelle === "automatisch" && (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: "0.3rem 0 0" }}>
                  Automatisch aus dem Vornamen geschätzt — bei Bedarf korrigieren.
                </p>
              )}
            </div>
            <div>
              <label className="au-label">Geburtsdatum</label>
              <input className="au-input" name="geburtsdatum" type="date" defaultValue={t.geburtsdatum || ""} />
            </div>
            <div>
              <label className="au-label">Unternehmer:in / Mitarbeiter:in</label>
              <select className="au-select" name="unternehmer_status" defaultValue={t.unternehmer_status || "unbekannt"}>
                <option value="unbekannt">—</option>
                <option value="unternehmer">Unternehmer:in</option>
                <option value="mitarbeiter">Mitarbeiter:in</option>
              </select>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: "0.3rem 0 0" }}>
                Unabhängig von "Rolle" — bezieht sich auf die berufliche Position der Person, nicht auf ihre Funktion beim Seminar.
              </p>
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Rolle</label>
              <select className="au-select" name="rolle" defaultValue={t.rolle || "teilnehmer"}>
                <option value="teilnehmer">Teilnehmer</option>
                <option value="mitarbeiter">Mitarbeiter</option>
                <option value="gastreferent">Gastreferent</option>
                <option value="organisator">Organisator</option>
              </select>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8rem", margin: "0.3rem 0 0" }}>
                Steuert, ob die Person in Teilnehmerlisten mitgezählt wird.
              </p>
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

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 400, marginBottom: "1rem", fontSize: "0.9rem" }}>
            <input type="checkbox" name="teilnehmerliste_opt_out" defaultChecked={t.teilnehmerliste_opt_out} />
            Nicht auf Teilnehmerlisten aufführen (Opt-out)
          </label>

          <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontWeight: 400, marginBottom: "1rem", fontSize: "0.9rem" }}>
            <input type="checkbox" name="teilnehmerliste_freigabe" defaultChecked={!!t.teilnehmerliste_freigabe} style={{ marginTop: "0.2rem" }} />
            <span>
              In der Nach-Seminar-Teilnehmerliste mit Foto &amp; LinkedIn zeigen (Freigabe)
              <span className="au-klein" style={{ display: "block" }}>Eigene Einwilligung, unabhängig von Referenz-Freigaben. Kann die Person auch selbst über den Link {"{{freigabe_link}}"} aus der Mail setzen.</span>
            </span>
          </label>

          <details open={hatWeitereAngaben} style={{ marginBottom: "1.1rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.75rem" }}>
              Weitere Angaben (Adresse, LinkedIn, Ernährung, Notizen)
            </summary>
            <div style={{ marginTop: "0.9rem" }}>
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
            </div>
          </details>

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
      </Bereich>

              </div>
            ),
          },
          {
            key: "organisationen",
            label: "Organisationen",
            anzahl: verknuepfteOrgs?.length || 0,
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel="Organisationen">
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
      </Bereich>

              </div>
            ),
          },
          {
            key: "referenzen",
            label: "Referenzen",
            anzahl: referenzenMitUrls.length,
            inhalt: (
              <div className="au-bereichsstapel">
      <Bereich titel="Referenzen & Testimonials">
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-faint)" }}>
          Freitext, Profilfoto, Agentur-Logo und Links (z. B. LinkedIn-Post, Video) — später Grundlage für Testimonials auf der Website.
        </p>

        {referenzenMitUrls.map((r: any) => (
          <div key={r.id} className="au-subcard" style={{ marginBottom: "0.9rem" }}>
            <div style={{ display: "flex", gap: "0.9rem", alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                {r.profilfotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.profilfotoUrl} alt="Profilfoto" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: "50%" }} />
                )}
                {r.agenturLogoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.agenturLogoUrl} alt="Agentur-Logo" style={{ width: 56, height: 56, objectFit: "contain", borderRadius: "6px", background: "#fff", border: "1px solid var(--color-border)" }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: "0.9rem" }}>{renderTextMitLinks(r.text)}</p>
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
                  {formatDatum(r.erstellt_am)}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flexShrink: 0 }}>
                <form action={toggleReferenzFreigabe}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="teilnehmer_id" value={id} />
                  <input type="hidden" name="redirect_to" value={`/teilnehmer/${id}`} />
                  <input type="hidden" name="neuer_wert" value={(!r.freigegeben_fuer_onepage).toString()} />
                  <button type="submit" className={`au-btn au-btn-sm ${r.freigegeben_fuer_onepage ? "au-btn-secondary" : "au-btn-primary"}`}>
                    {r.freigegeben_fuer_onepage ? "Freigegeben ✓" : "Für Onepage freigeben"}
                  </button>
                </form>
                <form action={deleteTeilnehmerReferenz}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="teilnehmer_id" value={id} />
                  <input type="hidden" name="redirect_to" value={`/teilnehmer/${id}`} />
                  <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
                </form>
              </div>
            </div>
          </div>
        ))}
        {!referenzenMitUrls.length && (
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-faint)" }}>Noch keine Referenz erfasst.</p>
        )}

        <details style={{ marginTop: "0.9rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>+ Neue Referenz erfassen</summary>
          <form action={createTeilnehmerReferenz} style={{ maxWidth: 480, marginTop: "0.9rem" }}>
            <input type="hidden" name="teilnehmer_id" value={id} />
            <input type="hidden" name="redirect_to" value={`/teilnehmer/${id}`} />
            <PasteImageField name="profilfoto" label="Profilfoto" />
            <PasteImageField name="agentur_logo" label="Agentur-Logo" />
            <label className="au-label">Text (Freitext, Links werden automatisch klickbar)</label>
            <textarea className="au-textarea" name="text" placeholder="Zitat, Kontext, Link zum LinkedIn-Post oder Video ..." />
            <button type="submit" className="au-btn au-btn-primary au-btn-sm">Referenz speichern</button>
          </form>
        </details>
      </Bereich>

              </div>
            ),
          },
        ]}
      />
    </main>
  );
}

function Bereich({ titel, aktion, children }: { titel: React.ReactNode; aktion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="au-panel">
      <div className="au-panel-kopf">
        <h2>{titel}</h2>
        {aktion}
      </div>
      <div className="au-panel-inhalt">{children}</div>
    </section>
  );
}
