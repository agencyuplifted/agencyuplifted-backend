export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PROGRAMME, istProgramm, ladeProgrammKalender } from "@/lib/programme";
import { formatDatum, formatEUR } from "@/lib/format";
import { quizProfil, ERGEBNIS_TYP_LABEL, laufzeitMonate, type ProgrammOption } from "@/lib/programm-buchung";
import { speicherProgramm, speicherProgrammOption, setzeProgrammOptionAktiv, setzeLeadKontaktiert } from "@/lib/programm-actions";
import Jahresplaner, { MONATSKURZ } from "../../termine/Jahresplaner";
import SeitenTabs from "../../SeitenTabs";
import AktionsFormular from "../../AktionsFormular";

export async function generateMetadata({ params }: { params: Promise<{ programm: string }> }) {
  const { programm } = await params;
  return { title: istProgramm(programm) ? PROGRAMME[programm].titel : "Programm" };
}

const STATUS: Record<string, { label: string; klasse: string }> = {
  angefragt: { label: "angefragt", klasse: "au-badge-warning" },
  bestaetigt: { label: "bestätigt", klasse: "au-badge-success" },
  storniert: { label: "storniert", klasse: "au-badge-danger" },
  umgebucht: { label: "umgebucht", klasse: "au-badge-neutral" },
};

// Programm-Seite (Foundation, Uplift, Advance): Buchungen, Leads, Kalender
// und Optionen & Preise an einer Stelle. Buchungen/Leads/Optionen gibt es,
// sobald ein Datensatz in der Tabelle programme mit diesem Schluessel
// existiert (Uplift); sonst nur der Kalender plus "Buchungsstrecke einrichten".
export default async function ProgrammSeite({
  params,
  searchParams,
}: {
  params: Promise<{ programm: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { programm } = await params;
  const { status: statusFilter } = await searchParams;
  if (!istProgramm(programm)) notFound();
  const info = PROGRAMME[programm];

  if (programm === "advance") {
    return (
      <main>
        <h1>{info.titel}</h1>
        <div className="au-card au-programm-platzhalter">
          <strong>Hier entsteht das Programm „Advance“.</strong>
          <p className="au-klein" style={{ margin: "0.35rem 0 0" }}>
            Noch keine Inhalte. Sobald es Formate oder Seminarkategorien für Advance gibt, erscheinen deren Termine hier automatisch im Kalender.
          </p>
        </div>
      </main>
    );
  }

  const supabase = getSupabaseAdmin();
  const [{ eintraege, monate, zaehler, heuteISO }, { data: datensatz }] = await Promise.all([
    ladeProgrammKalender(programm),
    supabase.from("programme").select("*, programm_optionen(*)").eq("schluessel", programm).maybeSingle(),
  ]);

  // ---------- Kalender ----------
  const legende = new Map<string, { farbe: string; art: "seminar" | "fest" }>();
  for (const t of eintraege as any[]) {
    if (t.fest || t.vorgeplant) {
      const name = t.seminartypen?.name || t.termin_formate?.name;
      const farbe = t.seminartypen?.farbe || t.termin_formate?.farbe;
      if (name && !legende.has(name)) legende.set(name, { farbe: farbe || "var(--color-accent)", art: t.seminartypen?.name ? "seminar" : "fest" });
    } else if (t.seminartypen?.name && !legende.has(t.seminartypen.name)) {
      legende.set(t.seminartypen.name, { farbe: t.seminartypen.farbe || "var(--color-accent)", art: "seminar" });
    }
  }
  const zeitraum = `${MONATSKURZ[monate[0].monatIndex]} ${monate[0].jahr} – ${MONATSKURZ[monate[monate.length - 1].monatIndex]} ${monate[monate.length - 1].jahr}`;
  const kalenderTab = (
    <section className="au-panel au-panel-breit">
      <div className="au-panel-kopf">
        <h2>Kalender · {zeitraum}</h2>
        <span className="au-planer-legende">
          {[...legende.entries()].map(([name, l]) => (
            <span key={name}>
              <i className={l.art === "fest" ? "au-planer-fest-leg" : undefined} style={{ background: l.farbe }} />
              {name}
            </span>
          ))}
          {eintraege.some((t: any) => t.vorgeplant) && (
            <span><i className="au-planer-vorgeplant-leg" />? = vorgeplant</span>
          )}
        </span>
      </div>
      <div className="au-panel-inhalt" style={{ overflowX: "auto" }}>
        {eintraege.length ? (
          <Jahresplaner monate={monate} termine={eintraege} heuteISO={heuteISO} />
        ) : (
          <p className="au-leer" style={{ margin: 0 }}>Noch keine Termine für {info.titel}.</p>
        )}
      </div>
      <p className="au-klein" style={{ padding: "0 1.15rem 1rem", margin: 0 }}>
        {zaehler.seminare > 0 && `${zaehler.seminare} Seminar${zaehler.seminare === 1 ? "" : "e"} · `}
        {zaehler.fest} fest eingeplant · {zaehler.vorgeplant} vorgeplant. Befüllt sich automatisch: Seminare über die Zuordnung der{" "}
        <Link href="/seminartypen" prefetch={false}>Seminarkategorien</Link>, Online- und Präsenz-Termine über die Formate im{" "}
        <Link href="/termine/planer#formate" prefetch={false}>Terminplaner</Link>. Geändert wird nur im Planer – ein Klick auf einen Online-/Präsenz-Termin öffnet ihn dort direkt.
      </p>
    </section>
  );

  // Ohne Datensatz: nur Kalender + Buchungsstrecke einrichten
  if (!datensatz) {
    return (
      <main>
        <h1>{info.titel}</h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>{info.beschreibung}</p>
        <SeitenTabs
          speicherSchluessel={`programm-${programm}`}
          ariaLabel={info.titel}
          tabs={[
            { key: "kalender", label: "Kalender", inhalt: kalenderTab },
            {
              key: "einrichten",
              label: "Buchungsstrecke einrichten",
              inhalt: (
                <section className="au-panel">
                  <div className="au-panel-kopf"><h2>Buchungsstrecke für {info.titel} einrichten</h2></div>
                  <p className="au-klein" style={{ padding: "0 1.15rem", margin: "0.75rem 0" }}>
                    Legt den Programm-Datensatz an. Danach gibt es hier die Reiter Buchungen, Leads und Optionen &amp; Preise – wie bei Uplift.
                  </p>
                  <AktionsFormular action={speicherProgramm} className="au-tp-form" style={{ padding: "0 1.15rem 1.15rem" }}>
                    <input type="hidden" name="schluessel" value={programm} />
                    <input className="au-input" name="name" defaultValue={info.titel} required aria-label="Name" />
                    <input className="au-input" name="kurzbeschreibung" placeholder="Kurzbeschreibung (optional)" />
                    <label className="au-klein au-tp-inline"><input type="checkbox" name="aktiv" defaultChecked /> aktiv</label>
                    <button type="submit" className="au-btn au-btn-primary au-btn-sm">Datensatz anlegen</button>
                  </AktionsFormular>
                </section>
              ),
            },
          ]}
        />
      </main>
    );
  }

  const [{ data: positionen }, { data: leads }] = await Promise.all([
    supabase
      .from("buchungspositionen")
      .select(
        "id, listenpreis, preis, metadata, programm_optionen(titel), teilnehmer(vorname, nachname), buchungen!inner(id, buchungsnummer, status, gebucht_am, organisationen(name), rechnungsempfaenger:rechnungsempfaenger_teilnehmer_id(vorname, nachname))"
      )
      .eq("programm_id", datensatz.id),
    supabase.from("programm_leads").select("*").eq("programm_id", datensatz.id).order("erstellt_am", { ascending: false }),
  ]);

  // ---------- Buchungen (Positionen je Buchung zusammengefasst) ----------
  const proBuchung = new Map<string, { b: any; positionen: any[] }>();
  for (const p of (positionen || []) as any[]) {
    const b = p.buchungen;
    if (!proBuchung.has(b.id)) proBuchung.set(b.id, { b, positionen: [] });
    proBuchung.get(b.id)!.positionen.push(p);
  }
  const alleBuchungen = [...proBuchung.values()].sort((x, y) => String(y.b.gebucht_am).localeCompare(String(x.b.gebucht_am)));
  const anzahlStatus = (s: string) => alleBuchungen.filter((x) => x.b.status === s).length;
  const gefiltert = statusFilter && STATUS[statusFilter] ? alleBuchungen.filter((x) => x.b.status === statusFilter) : alleBuchungen;
  const filterLink = (s: string | null, label: string, anzahl: number) => (
    <Link
      key={label}
      href={`/programme/${programm}${s ? `?status=${s}` : ""}#buchungen`}
      className={(statusFilter || null) === s ? "aktiv" : ""}
      prefetch={false}
    >
      {label} <span className="au-tab-zahl">{anzahl}</span>
    </Link>
  );
  const buchungenTab = (
    <section className="au-panel">
      <div className="au-panel-kopf">
        <nav className="au-seitentabs" aria-label="Status" style={{ marginBottom: 0 }}>
          {filterLink(null, "Alle", alleBuchungen.length)}
          {filterLink("angefragt", "Angefragt", anzahlStatus("angefragt"))}
          {filterLink("bestaetigt", "Bestätigt", anzahlStatus("bestaetigt"))}
          {filterLink("storniert", "Storniert", anzahlStatus("storniert"))}
        </nav>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="au-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Buchung</th>
              <th>Rechnungsempfänger</th>
              <th>Option</th>
              <th>Zahlweise</th>
              <th>Personen</th>
              <th>Gesamt (netto)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {gefiltert.map(({ b, positionen: ps }) => {
              const erste = ps[0];
              const monatlich = erste.metadata?.programm_zahlweise === "monthly";
              const summe = ps.reduce((s: number, p: any) => s + Number(p.preis ?? p.listenpreis ?? 0), 0);
              const st = STATUS[b.status] || { label: b.status, klasse: "au-badge-neutral" };
              return (
                <tr key={b.id}>
                  <td>
                    <Link href={`/buchungen/${b.id}`} prefetch={false}><strong>{b.buchungsnummer}</strong></Link>
                    <div className="au-klein">{formatDatum(b.gebucht_am)}</div>
                  </td>
                  <td>
                    {b.organisationen?.name || "—"}
                    {b.rechnungsempfaenger && <div className="au-klein">{b.rechnungsempfaenger.vorname} {b.rechnungsempfaenger.nachname}</div>}
                  </td>
                  <td>{erste.programm_optionen?.titel || "—"}</td>
                  <td>
                    {monatlich ? `monatlich (${erste.metadata?.anzahl_raten} × ${formatEUR(Number(erste.metadata?.rate_betrag || 0))})` : "jährlich"}
                  </td>
                  <td>{ps.map((p: any) => `${p.teilnehmer?.vorname || ""} ${p.teilnehmer?.nachname || ""}`.trim()).join(", ")}</td>
                  <td>{formatEUR(summe)}</td>
                  <td><span className={`au-badge ${st.klasse}`}>{st.label}</span></td>
                </tr>
              );
            })}
            {!gefiltert.length && (
              <tr className="au-table-empty"><td colSpan={7}>Noch keine {statusFilter && STATUS[statusFilter] ? `${STATUS[statusFilter].label}en ` : ""}Buchungen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="au-klein" style={{ padding: "0.75rem 1.15rem 1rem", margin: 0 }}>
        Bestätigen (nach Zahlungseingang) und Stornieren wie bei Seminaren in der Buchung selbst – Klick auf die Buchungsnummer. Dort steht auch das komplette Quiz-Profil.
      </p>
    </section>
  );

  // ---------- Leads ----------
  const offeneLeads = (leads || []).filter((l: any) => !l.kontaktiert_am).length;
  const leadsTab = (
    <section className="au-panel">
      <div className="au-panel-kopf">
        <h2>Leads aus dem Quiz</h2>
        <span className="au-klein">{offeneLeads} noch nicht kontaktiert</span>
      </div>
      <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem 1rem" }}>
        {(leads || []).map((l: any) => {
          const profil = quizProfil(l.quiz_antworten);
          return (
            <li key={l.id} className="au-tp-zeile" style={l.kontaktiert_am ? { opacity: 0.65 } : undefined}>
              <div className="au-tp-zeile-kopf">
                <div>
                  <strong><a href={`mailto:${l.email}`}>{l.email}</a></strong>
                  {l.name && <span> · {l.name}</span>}
                  <div className="au-klein">
                    <span className="au-badge au-badge-neutral">{ERGEBNIS_TYP_LABEL[l.ergebnis_typ] || l.ergebnis_typ}</span> · {formatDatum(l.erstellt_am)}
                    {l.kontaktiert_am && ` · kontaktiert am ${formatDatum(l.kontaktiert_am)}`}
                  </div>
                </div>
                <AktionsFormular action={setzeLeadKontaktiert}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="kontaktiert" value={String(!l.kontaktiert_am)} />
                  <button type="submit" className={l.kontaktiert_am ? "au-link" : "au-btn au-btn-secondary au-btn-sm"}>
                    {l.kontaktiert_am ? "auf „nicht kontaktiert“ zurück" : "✓ kontaktiert"}
                  </button>
                </AktionsFormular>
              </div>
              {profil.length > 0 && (
                <details className="au-tp-details">
                  <summary className="au-klein">Quiz-Antworten</summary>
                  <dl className="au-dl" style={{ marginTop: "0.5rem" }}>
                    {profil.map((z) => (
                      <div key={z.label} style={{ display: "contents" }}>
                        <dt className="au-dt">{z.label}</dt>
                        <dd style={{ margin: 0 }}>{z.wert}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </li>
          );
        })}
        {!leads?.length && <li className="au-leer">Noch keine Leads.</li>}
      </ul>
    </section>
  );

  // ---------- Optionen & Preise ----------
  const optionen = [...((datensatz as any).programm_optionen || [])].sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0));
  const optionFelder = (o?: any) => (
    <>
      {o && <input type="hidden" name="id" value={o.id} />}
      <input type="hidden" name="programm_id" value={datensatz.id} />
      <div className="au-programm-felder">
        <label><span className="au-label">Titel</span><input className="au-input" name="titel" required defaultValue={o?.titel || ""} placeholder="z. B. Uplift Mitgliedschaft" /></label>
        <label><span className="au-label">Badge</span><input className="au-input" name="badge" defaultValue={o?.badge || ""} placeholder="z. B. Kuratiert" /></label>
        <label><span className="au-label">Sortierung</span><input className="au-input" name="sortierung" type="number" defaultValue={o?.sortierung ?? 0} /></label>
        <label className="au-programm-breit"><span className="au-label">Beschreibung</span><textarea className="au-textarea" name="beschreibung" rows={2} defaultValue={o?.beschreibung || ""} /></label>
        <label><span className="au-label">Preis monatlich (€ netto)</span><input className="au-input" name="preis_monatlich" inputMode="decimal" defaultValue={o?.preis_monatlich ?? ""} /></label>
        <label><span className="au-label">Preis jährlich (€ netto)</span><input className="au-input" name="preis_jaehrlich" inputMode="decimal" defaultValue={o?.preis_jaehrlich ?? ""} /></label>
        <label><span className="au-label">Laufzeit bei monatlich (Raten)</span><input className="au-input" name="ratenzahlung_anzahl_raten" type="number" min={2} max={60} defaultValue={o?.ratenzahlung_anzahl_raten ?? 12} /></label>
        <label><span className="au-label">Aufschlag monatlich (%)</span><input className="au-input" name="ratenzahlung_aufschlag_prozent" inputMode="decimal" defaultValue={o?.ratenzahlung_aufschlag_prozent ?? 0} /></label>
        <label><span className="au-label">Zusatzperson monatlich (€ netto)</span><input className="au-input" name="zusatzteilnehmer_preis_monatlich" inputMode="decimal" defaultValue={o?.zusatzteilnehmer_preis_monatlich ?? ""} /></label>
        <label><span className="au-label">Zusatzperson jährlich (€ netto)</span><input className="au-input" name="zusatzteilnehmer_preis_jaehrlich" inputMode="decimal" defaultValue={o?.zusatzteilnehmer_preis_jaehrlich ?? ""} /></label>
        <label className="au-programm-breit"><span className="au-label">Hinweis Zusatzperson</span><input className="au-input" name="zusatz_teilnehmer_hinweis" defaultValue={o?.zusatz_teilnehmer_hinweis || ""} placeholder="z. B. Zweite Person aus deiner Agentur" /></label>
        <label className="au-klein au-tp-inline au-programm-breit">
          <input type="checkbox" name="ratenzahlung_aktiv" defaultChecked={o ? !!o.ratenzahlung_aktiv : true} /> Monatliche Zahlung anbieten (Rechnung je Monat, keine Abbuchung)
        </label>
      </div>
    </>
  );
  const optionenTab = (
    <div className="au-tp-stapel">
      <section className="au-panel">
        <div className="au-panel-kopf"><h2>Programm</h2></div>
        <AktionsFormular action={speicherProgramm} className="au-tp-form" style={{ padding: "0.75rem 1.15rem 1.15rem" }}>
          <input type="hidden" name="id" value={datensatz.id} />
          <input className="au-input" name="name" required defaultValue={datensatz.name} aria-label="Name" />
          <input className="au-input" name="kurzbeschreibung" defaultValue={datensatz.kurzbeschreibung || ""} placeholder="Kurzbeschreibung" style={{ flexBasis: "100%" }} />
          <label className="au-klein au-tp-inline"><input type="checkbox" name="aktiv" defaultChecked={datensatz.aktiv} /> aktiv (buchbar)</label>
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
        </AktionsFormular>
      </section>

      {optionen.map((o: any) => {
        const monatlichGesamt = o.preis_monatlich !== null ? Number(o.preis_monatlich) * laufzeitMonate(o as ProgrammOption) * (1 + Number(o.ratenzahlung_aufschlag_prozent || 0) / 100) : null;
        return (
          <section key={o.id} className="au-panel" style={o.deaktiviert_am ? { opacity: 0.6 } : undefined}>
            <div className="au-panel-kopf">
              <div>
                <h2 style={{ margin: 0 }}>
                  {o.titel} {o.badge && <span className="au-badge au-badge-gold">{o.badge}</span>}
                  {o.deaktiviert_am && <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.4rem" }}>deaktiviert</span>}
                </h2>
                <span className="au-klein">
                  {o.preis_monatlich !== null && `${formatEUR(Number(o.preis_monatlich))}/Monat${o.ratenzahlung_aktiv ? ` (${laufzeitMonate(o)} Monate = ${formatEUR(monatlichGesamt || 0)})` : " – monatlich nicht buchbar"}`}
                  {o.preis_jaehrlich !== null && ` · ${formatEUR(Number(o.preis_jaehrlich))}/Jahr`}
                  {(o.zusatzteilnehmer_preis_monatlich !== null || o.zusatzteilnehmer_preis_jaehrlich !== null) &&
                    ` · Zusatzperson ${o.zusatzteilnehmer_preis_monatlich !== null ? `${formatEUR(Number(o.zusatzteilnehmer_preis_monatlich))}/Monat` : ""}${o.zusatzteilnehmer_preis_monatlich !== null && o.zusatzteilnehmer_preis_jaehrlich !== null ? " bzw. " : ""}${o.zusatzteilnehmer_preis_jaehrlich !== null ? `${formatEUR(Number(o.zusatzteilnehmer_preis_jaehrlich))}/Jahr` : ""}`}
                  {" "}· alle Preise netto
                </span>
              </div>
              <AktionsFormular action={setzeProgrammOptionAktiv}>
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="aktiv" value={String(!!o.deaktiviert_am)} />
                <button type="submit" className="au-link">{o.deaktiviert_am ? "wieder aktivieren" : "deaktivieren"}</button>
              </AktionsFormular>
            </div>
            <details className="au-tp-details" style={{ padding: "0 1.15rem 1rem" }}>
              <summary className="au-klein">bearbeiten</summary>
              <AktionsFormular action={speicherProgrammOption} style={{ marginTop: "0.75rem" }}>
                {optionFelder(o)}
                <button type="submit" className="au-btn au-btn-primary au-btn-sm" style={{ marginTop: "0.5rem" }}>Speichern</button>
              </AktionsFormular>
            </details>
          </section>
        );
      })}

      <section className="au-panel">
        <details style={{ padding: "0.9rem 1.15rem" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Neue Option</summary>
          <AktionsFormular action={speicherProgrammOption} zuruecksetzen style={{ marginTop: "0.75rem" }}>
            {optionFelder()}
            <button type="submit" className="au-btn au-btn-primary au-btn-sm" style={{ marginTop: "0.5rem" }}>Option anlegen</button>
          </AktionsFormular>
        </details>
      </section>
      <p className="au-klein" style={{ margin: 0 }}>
        Änderungen gelten sofort für neue Buchungen (Preise werden bei jeder Buchung serverseitig aus diesen Werten berechnet). Bestehende Buchungen behalten ihren Preis.
        Optionen werden nie gelöscht, nur deaktiviert – Buchungen verweisen darauf.
      </p>
    </div>
  );

  return (
    <main>
      <h1>
        {info.titel}
        {!datensatz.aktiv && <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.6rem", fontSize: "0.8rem", verticalAlign: "middle" }}>nicht buchbar</span>}
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>{datensatz.kurzbeschreibung || info.beschreibung}</p>
      <SeitenTabs
        speicherSchluessel={`programm-${programm}`}
        ariaLabel={info.titel}
        tabs={[
          { key: "buchungen", label: "Buchungen", anzahl: alleBuchungen.length || null, warnung: anzahlStatus("angefragt") > 0, inhalt: buchungenTab },
          { key: "leads", label: "Leads", anzahl: (leads || []).length || null, warnung: offeneLeads > 0, inhalt: leadsTab },
          { key: "kalender", label: "Kalender", inhalt: kalenderTab },
          { key: "optionen", label: "Optionen & Preise", anzahl: optionen.filter((o: any) => !o.deaktiviert_am).length || null, inhalt: optionenTab },
        ]}
      />
    </main>
  );
}
