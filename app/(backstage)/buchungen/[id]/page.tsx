export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { stornoBuchung, umbuchenBuchung, bestaetigeBuchung, setzeBuchungOrganisation } from "@/lib/actions";
import { formatDatum, formatDatumsspanne, formatEUR, formatEURBrutto } from "@/lib/format";
import { quizProfil } from "@/lib/programm-buchung";
import Link from "next/link";
import RechnungBereich from "./RechnungBereich";

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
    .select("*, teilnehmer(vorname, nachname, email), seminartermine(id, datum_start, seminartypen(name)), seminartermin_optionen(titel), programme(name, schluessel)")
    .eq("buchung_id", id);

  const { data: organisationen } = await supabase.from("organisationen").select("id, name").is("deaktiviert_am", null).order("name");

  const { data: protokoll } = await supabase
    .from("aenderungsprotokoll")
    .select("*")
    .eq("bezug_typ", "buchung")
    .eq("bezug_id", id)
    .order("erstellt_am", { ascending: false });

  // Umbuchen nur auf kommende, nicht abgesagte Termine -- vorher standen alle
  // Termine ohne Kennung zur Wahl, und "01.02.2026" wurde mit "02.12.2026"
  // verwechselt (Tobias Bals, 01.10.2026).
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("id, kennung, titel, datum_start, datum_ende, seminartyp_id, seminartypen(name)")
    .gte("datum_start", new Date().toISOString().slice(0, 10))
    .neq("status", "abgesagt")
    .order("datum_start");

  if (!buchung) return <main><p>Buchung nicht gefunden.</p></main>;
  // Programm-Buchung (Uplift-Mitgliedschaft …): gleiche Maske, plus Quiz-Profil
  const programmPosition: any = positionen?.find((p: any) => p.programm_id);
  const profil = quizProfil((buchung.metadata as any)?.quiz_antworten);

  return (
    <main>
      {programmPosition?.programme?.schluessel && (
        <p className="au-brotkrumen">
          <Link href={`/programme/${programmPosition.programme.schluessel}#buchungen`}>{programmPosition.programme.name} · Buchungen</Link>
        </p>
      )}
      <h1>
        Buchung {buchung.buchungsnummer}
        {programmPosition && <span className="au-badge au-badge-gold" style={{ marginLeft: "0.6rem", fontSize: "0.8rem", verticalAlign: "middle" }}>{programmPosition.programme?.name || "Programm"}</span>}
      </h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Status: <strong>{buchung.status}</strong> · Rechnungsempfänger: {buchung.organisationen?.name || (buchung.teilnehmer ? `${buchung.teilnehmer.vorname} ${buchung.teilnehmer.nachname}` : "—")} · Gebucht am {formatDatum(buchung.gebucht_am)}
      </p>

      {/* Firma der Buchung sichtbar und aenderbar -- vorher nirgends zu sehen,
          FastBill-Zuordnungen liessen sie leer (Befund 01.10.2026). */}
      <form action={setzeBuchungOrganisation} className="au-card" style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
        <input type="hidden" name="buchung_id" value={buchung.id} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <label className="au-label">
            Firma (Organisation)
            {!buchung.organisation_id && <span className="au-badge au-badge-warning" style={{ marginLeft: "0.5rem" }}>keine hinterlegt</span>}
          </label>
          <select className="au-input" style={{ marginBottom: 0 }} name="organisation_id" defaultValue={buchung.organisation_id || ""}>
            <option value="">— keine (Selbständige/r, Rechnung an Person) —</option>
            {(organisationen || []).map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="au-btn au-btn-secondary">Speichern</button>
        <span className="au-klein" style={{ width: "100%" }}>Alle Teilnehmer dieser Buchung werden mit der Firma verknüpft.</span>
      </form>

      {(() => {
        const metadata: any = buchung.metadata || {};
        if (!metadata.privacy_accepted && !metadata.trust_guarantee_accepted) return null;
        const erfasstAm = metadata.consent_erfasst_am ? formatDatum(metadata.consent_erfasst_am) : null;
        return (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Einwilligungen: Datenschutz {metadata.privacy_accepted ? "✓" : "—"} · Vertrauensgarantie {metadata.trust_guarantee_accepted ? "✓" : "—"}
            {erfasstAm ? ` (erfasst am ${erfasstAm})` : ""}
          </p>
        );
      })()}

      <div className="au-card">
        <h2>Positionen</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Leistung</th>
              <th>Preis (netto)</th>
              <th>Preis (brutto)</th>
              <th>Zahlweise</th>
            </tr>
          </thead>
          <tbody>
            {positionen?.map((p: any) => (
              <tr key={p.id}>
                <td>{p.teilnehmer?.vorname} {p.teilnehmer?.nachname}</td>
                <td>
                  {p.seminartermine
                    ? `${p.seminartermine.seminartypen?.name} – ${formatDatum(p.seminartermine.datum_start)}${p.seminartermin_optionen?.titel ? ` (${p.seminartermin_optionen.titel})` : ""}`
                    : p.programm_id
                    ? `${p.beschreibung} (${p.metadata?.programm_zahlweise === "monthly" ? "monatlich" : "jährlich"}, Laufzeit ${p.metadata?.laufzeit_monate || 12} Monate)`
                    : `${p.beschreibung} (individuell${p.startdatum ? `, ab ${formatDatum(p.startdatum)}` : ""})`}
                </td>
                <td>{formatEUR(Number(p.preis || 0))}</td>
                <td>{formatEURBrutto(Number(p.preis || 0))}</td>
                <td>
                  {p.metadata?.zahlweise === "raten"
                    ? `Ratenzahlung (${p.metadata.anzahl_raten} × ${formatEUR(Number(p.metadata.rate_betrag))})`
                    : p.metadata?.zahlweise === "einmalig"
                    ? "Einmalzahlung"
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {buchung.status !== "storniert" && positionen?.filter((p: any) => p.seminartermin_id).map((p: any) => (
          <form key={p.id} action={umbuchenBuchung} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <input type="hidden" name="position_id" value={p.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="au-label">Umbuchen auf ({p.teilnehmer?.vorname} {p.teilnehmer?.nachname})</label>
              <select className="au-input" name="neuer_seminartermin_id" required>
                <option value="">— neuer Termin wählen —</option>
                {termine?.filter((t: any) => t.id !== p.seminartermine?.id).map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.kennung ? `${t.kennung} · ` : ""}{t.titel || t.seminartypen?.name} · {formatDatumsspanne(t.datum_start, t.datum_ende)}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="au-btn au-btn-primary">Umbuchen</button>
          </form>
        ))}
      </div>

      {buchung.status === "angefragt" && (
        <div className="au-banner au-banner-warning">
          <strong>Platz ist belegt, Mailstrecke wartet.</strong> Die Buchung zählt sofort auf die Kapazität (intern und in der Restplatz-Anzeige).
          Funnel-Mails – „nach Buchungseingang“, „vor Seminarstart“, „nach Seminarende“ – starten erst nach dem Bestätigen der Zahlung.
        </div>
      )}

      {buchung.metadata?.buchungsart === "paket" && (
        <div className="au-banner au-card-tint">
          <strong>Paket-Buchung.</strong> Im Paket (z. B. Coaching) enthalten, ohne Info an den Kunden angelegt: keine „Buchung erstellt“-Mail, die Mails vor
          Seminarstart und nach Seminarende gehen wie bei allen anderen raus. Der Preis zählt für den Deckungsbeitrag des Termins, aber nicht im Gesamtumsatz
          der Übersicht – das Geld steckt in der Paket-Rechnung.
        </div>
      )}

      {buchung.metadata?.buchungsart === "freiplatz" && (
        <div className="au-banner au-card-tint">
          <strong>Freiplatz.</strong> Kostenlose Teilnahme: belegt einen Platz, keine Rechnung, kein Umsatz.
          Keine „Buchung erstellt“-Mail, die Mails vor Seminarstart und nach Seminarende gehen wie bei allen anderen raus.
        </div>
      )}

      {profil.length > 0 && (
        <div className="au-card">
          <h2>Quiz-Profil</h2>
          <dl className="au-dl">
            {profil.map((z) => (
              <div key={z.label} style={{ display: "contents" }}>
                <dt className="au-dt">{z.label}</dt>
                <dd style={{ margin: 0 }}>{z.wert}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <RechnungBereich supabase={supabase} buchungId={buchung.id} />

      {buchung.status === "angefragt" && (
        <div className="au-card">
          <h2>Bestätigen</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            {programmPosition
              ? "Setzt die Buchung auf „bestätigt“, startet die Funnel-Strecke ab heute und verschickt sofort die Mail „Mitgliedschaft bestätigt“ an alle Teilnehmer:innen und den Rechnungsempfänger. Erst nach Zahlungseingang (bei Monatszahlung: erste Rate) bestätigen."
              : "Setzt die Buchung auf „bestätigt“ und verschickt sofort die Zahlungsbestätigungs-Mail an alle Teilnehmer:innen dieser Buchung. Erst nach Zahlungseingang bestätigen."}
          </p>
          <form action={bestaetigeBuchung}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <button type="submit" className="au-btn au-btn-primary">Zahlung erhalten — Buchung bestätigen</button>
          </form>
        </div>
      )}

      {buchung.status !== "storniert" && (
        <div className="au-card">
          <h2>Stornieren</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Keine Erstattung, kein Ersatz von Reise- oder sonstigen Kosten — laut AGB.</p>
          <form action={stornoBuchung} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
            <input type="hidden" name="buchung_id" value={buchung.id} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="au-label">Grund (optional)</label>
              <input className="au-input" name="grund" placeholder="z. B. Krankheit, Terminkonflikt" />
            </div>
            <button type="submit" className="au-btn au-btn-danger-solid">Buchung stornieren</button>
          </form>
        </div>
      )}

      <div className="au-card">
        <h2>Änderungsprotokoll</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Ereignis</th>
              <th>Beschreibung</th>
              <th>Bearbeiter</th>
            </tr>
          </thead>
          <tbody>
            {protokoll?.map((e) => (
              <tr key={e.id}>
                <td>{formatDatum(e.erstellt_am)}</td>
                <td>{e.ereignis}</td>
                <td>{e.beschreibung}</td>
                <td>{e.bearbeiter || "—"}</td>
              </tr>
            ))}
            {!protokoll?.length && (
              <tr><td colSpan={4} style={{ color: "var(--color-text-faint)" }}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
