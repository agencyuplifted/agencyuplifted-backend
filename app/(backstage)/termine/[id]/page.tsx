export const dynamic = "force-dynamic";

import {
  createPreisstaffel,
  createUrgencyStufe,
  previewSeminarterminUpdate,
  createSeminarOption,
  createOptionFeature,
  duplicateSeminartermin,
  previewSeminarterminLoeschen,
  duplicateSeminarOption,
  updateOptionBadge,
  updateSeminarOption,
  deleteSeminarOption,
  deleteOptionFeature,
  deletePreisstaffel,
  addMitarbeiterZuTermin,
  removeMitarbeiterVonTermin,
  setzeZimmerpartner,
  entferneZimmerpartner,
} from "@/lib/actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, formatEUR, formatEURBrutto } from "@/lib/format";
import { renderFett } from "@/lib/richtext";
import { FettTextarea, FettInput } from "../BoldEditor";
import Link from "next/link";

const badgeLabel: Record<string, string> = {
  empfohlen: "Empfohlen",
  meistgekauft: "Meistgekauft",
};

function formatZeit(t: string | null) {
  return t ? t.slice(0, 5) + " Uhr" : "";
}

// Gleiche Logik wie in der oeffentlichen API-Route (app/api/public/seminartermine/[id]),
// damit die Vorschau exakt zeigt, welcher Preis gerade auf der Website ausgespielt
// wuerde: die Preisstaffel mit dem groessten Stichtag, dessen Frist noch nicht
// unterschritten ist (je naeher am Termin, desto teurer).
function aktuellerPreisNettoVorschau(preisstaffeln: any[], datumStart: string): number | null {
  if (!preisstaffeln || !preisstaffeln.length) return null;
  const heute = new Date();
  const start = new Date(datumStart);
  const tageBisStart = Math.ceil((start.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  const sortiert = [...preisstaffeln].sort((a, b) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start);
  const aktiv = sortiert.find((p) => tageBisStart >= p.stichtag_tage_vor_start);
  const gewaehlt = aktiv || sortiert[sortiert.length - 1];
  return gewaehlt ? Number(gewaehlt.preis) : null;
}

export default async function TerminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Alle folgenden Abfragen sind voneinander unabhaengig (jede filtert direkt
  // auf die Termin-ID aus der URL, keine haengt vom Ergebnis einer anderen ab).
  // Frueher wurden sie einzeln nacheinander mit await geladen -- bei ~12
  // Round-Trips a 150-300ms summierte sich das auf 10-15+ Sekunden pro
  // Seitenaufruf. Nach einer Formular-Aktion (z.B. Preisstaffel anlegen) rendert
  // Next.js dieselbe Seite fuer den Redirect ein zweites Mal in derselben
  // Funktionsausfuehrung -- das hat zusammen das Vercel-Timeout gerissen und zu
  // einer leeren Seite (503) gefuehrt, obwohl die Daten korrekt gespeichert
  // wurden. Mit Promise.all laufen alle Abfragen parallel (~1 Anfrage-Dauer
  // statt 12), das behebt das Timeout-Problem grundlegend.
  const [
    { data: termin },
    { data: seminartypen },
    { data: orte },
    { data: trainerListe },
    { data: optionen },
    { data: urgencyStufen },
    { data: mitarbeiterListe },
    { data: terminMitarbeiter },
    { data: protokoll },
    { data: buchungsPositionen },
    { data: legacyTeilnehmer },
    { data: zimmerpartner },
  ] = await Promise.all([
    supabase
      .from("seminartermine")
      .select("*, seminartypen(name), veranstaltungsorte(name, ort, nahe_grossstadt), trainer(name)")
      .eq("id", id)
      .single(),
    supabase.from("seminartypen").select("*").order("name"),
    supabase.from("veranstaltungsorte").select("*").order("name"),
    supabase.from("trainer").select("*").order("name"),
    supabase
      .from("seminartermin_optionen")
      .select("*, seminartermin_options_features(*), preisstaffeln(*)")
      .eq("seminartermin_id", id)
      .order("sortierung", { ascending: true }),
    supabase
      .from("urgency_stufen")
      .select("*")
      .eq("seminartermin_id", id)
      .order("schwellenwert_prozent", { ascending: true }),
    supabase
      .from("mitarbeiter")
      .select("*")
      .eq("aktiv", true)
      .order("name"),
    supabase
      .from("seminartermin_mitarbeiter")
      .select("*, mitarbeiter(name)")
      .eq("seminartermin_id", id)
      .order("erstellt_am", { ascending: true }),
    supabase
      .from("aenderungsprotokoll")
      .select("*")
      .eq("bezug_typ", "seminartermin")
      .eq("bezug_id", id)
      .order("erstellt_am", { ascending: false }),
    supabase
      .from("buchungspositionen")
      .select(
        "teilnehmer_id, seminartermin_option_id, beschreibung, buchungen(status, organisationen(name)), teilnehmer(id, vorname, nachname, email, telefon, mobiltelefon, ernaehrung_sonderwuensche, firma_freitext, rolle)"
      )
      .eq("seminartermin_id", id),
    supabase
      .from("legacy_buchungen")
      .select("teilnehmer(id, vorname, nachname, email, telefon, mobiltelefon, ernaehrung_sonderwuensche, firma_freitext, rolle), organisationen(name)")
      .eq("seminartermin_id", id),
    supabase
      .from("seminartermin_zimmerpartner")
      .select("id, teilnehmer_a:teilnehmer_id_a(id, vorname, nachname), teilnehmer_b:teilnehmer_id_b(id, vorname, nachname)")
      .eq("seminartermin_id", id),
  ]);

  type TeilnehmerZeile = {
    id: string;
    name: string;
    orga: string;
    telefon: string;
    email: string;
    zimmer: string;
    essen: string;
    quelle: "aktuell" | "legacy";
    rolle: string;
  };

  const teilnehmerMap = new Map<string, TeilnehmerZeile>();

  (buchungsPositionen || []).forEach((p: any) => {
    if (p.buchungen?.status === "storniert") return;
    if (!p.teilnehmer) return;
    const bestehend = teilnehmerMap.get(p.teilnehmer.id);
    const hatZimmerUpgrade = p.seminartermin_option_id === null;
    if (bestehend) {
      if (hatZimmerUpgrade) bestehend.zimmer = p.beschreibung || "Ja";
      return;
    }
    teilnehmerMap.set(p.teilnehmer.id, {
      id: p.teilnehmer.id,
      name: `${p.teilnehmer.vorname} ${p.teilnehmer.nachname}`,
      orga: p.buchungen?.organisationen?.name || p.teilnehmer.firma_freitext || "—",
      telefon: p.teilnehmer.telefon || p.teilnehmer.mobiltelefon || "—",
      email: p.teilnehmer.email || "—",
      zimmer: hatZimmerUpgrade ? (p.beschreibung || "Ja") : "—",
      essen: p.teilnehmer.ernaehrung_sonderwuensche || "—",
      quelle: "aktuell",
      rolle: p.teilnehmer.rolle || "teilnehmer",
    });
  });

  (legacyTeilnehmer || []).forEach((l: any) => {
    if (!l.teilnehmer || teilnehmerMap.has(l.teilnehmer.id)) return;
    teilnehmerMap.set(l.teilnehmer.id, {
      id: l.teilnehmer.id,
      name: `${l.teilnehmer.vorname} ${l.teilnehmer.nachname}`,
      orga: l.organisationen?.name || l.teilnehmer.firma_freitext || "—",
      telefon: l.teilnehmer.telefon || l.teilnehmer.mobiltelefon || "—",
      email: l.teilnehmer.email || "—",
      zimmer: "—",
      essen: l.teilnehmer.ernaehrung_sonderwuensche || "—",
      quelle: "legacy",
      rolle: l.teilnehmer.rolle || "teilnehmer",
    });
  });

  const teilnehmerListe = [...teilnehmerMap.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
  const echteTeilnehmerAnzahl = teilnehmerListe.filter((t) => t.rolle === "teilnehmer").length;

  const rolleBadge: Record<string, string> = {
    mitarbeiter: "Mitarbeiter",
    organisator: "Organisator",
    gastreferent: "Gastreferent",
  };

  const partnerVonTeilnehmer = new Map<string, { name: string; zuordnungId: string }>();
  (zimmerpartner || []).forEach((z: any) => {
    if (!z.teilnehmer_a || !z.teilnehmer_b) return;
    partnerVonTeilnehmer.set(z.teilnehmer_a.id, {
      name: `${z.teilnehmer_b.vorname} ${z.teilnehmer_b.nachname}`,
      zuordnungId: z.id,
    });
    partnerVonTeilnehmer.set(z.teilnehmer_b.id, {
      name: `${z.teilnehmer_a.vorname} ${z.teilnehmer_a.nachname}`,
      zuordnungId: z.id,
    });
  });
  const anzahlZimmer = teilnehmerListe.length - (zimmerpartner?.length || 0);

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const titelAnzeige = termin.titel || termin.seminartypen?.name;
  const zeitraum = termin.datum_ende && termin.datum_ende !== termin.datum_start
    ? `${formatDatum(termin.datum_start)}${termin.zeit_start ? ", " + formatZeit(termin.zeit_start) : ""} bis ${formatDatum(termin.datum_ende)}${termin.zeit_ende ? ", " + formatZeit(termin.zeit_ende) : ""}`
    : `${formatDatum(termin.datum_start)}${termin.zeit_start ? ", " + formatZeit(termin.zeit_start) : ""}${termin.zeit_ende ? " – " + formatZeit(termin.zeit_ende) : ""}`;

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>{titelAnzeige}{termin.kennung ? <span className="au-badge" style={{ marginLeft: "0.6rem", fontSize: "0.8rem", verticalAlign: "middle" }}>{termin.kennung}</span> : null}</h1>
          <p style={{ color: "var(--color-text-muted)" }}>
            {termin.seminartypen?.name} · {zeitraum}
            {termin.vorabend_anreise_datum && (
              <> · Vorabendanreise: {formatDatum(termin.vorabend_anreise_datum)}{termin.vorabend_anreise_uhrzeit ? ", " + formatZeit(termin.vorabend_anreise_uhrzeit) : ""}</>
            )}
            <br />
            {termin.veranstaltungsorte?.name || "—"}{termin.veranstaltungsorte?.ort ? `, ${termin.veranstaltungsorte.ort}` : ""}{termin.veranstaltungsorte?.nahe_grossstadt ? ` (bei ${termin.veranstaltungsorte.nahe_grossstadt})` : ""} · {termin.format} · Trainer: {termin.trainer?.name || "—"} · Kapazität {termin.kapazitaet} (+{termin.ueberbuchungspuffer} intern) · Status {termin.status}
            {(termin.zusatzteilnehmer_preis || termin.zusatzteilnehmer_rabatt_prozent) && (
              <><br />Zusätzlicher Teilnehmer: {termin.zusatzteilnehmer_preis ? formatEUR(Number(termin.zusatzteilnehmer_preis)) : `${termin.zusatzteilnehmer_rabatt_prozent}% Rabatt`}</>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/termine/${id}/teilnehmerliste`} className="au-btn au-btn-secondary">
            Teilnehmerliste (Hotel)
          </Link>
          <form action={duplicateSeminartermin}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-secondary" title="Legt eine Kopie dieses Termins inkl. Optionen, Featurelisten, Preisstaffeln und Urgency-Stufen an">
              Termin duplizieren
            </button>
          </form>
          <form action={previewSeminarterminLoeschen}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-danger" title="Führt zu einer Bestätigungsseite, bevor der Termin wirklich gelöscht wird">
              Termin löschen
            </button>
          </form>
        </div>
      </div>

      <div className="au-card">
        <h2>Teilnehmer · {echteTeilnehmerAnzahl}</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Alle Personen, die für diesen Termin gebucht haben oder (aus Alt-Daten) hatten — inklusive zugeordneter Legacy-Buchungen.
          {zimmerpartner && zimmerpartner.length > 0 && <> · {anzahlZimmer} Zimmer benötigt ({zimmerpartner.length} geteilt)</>}
          {" "}<Link href={`/termine/${id}/teilnehmerliste`}>Hotel-Liste zum Kopieren →</Link>
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Organisation</th>
              <th>Telefon</th>
              <th>E-Mail</th>
              <th>Zimmer</th>
              <th>Essen</th>
              <th>Quelle</th>
            </tr>
          </thead>
          <tbody>
            {teilnehmerListe.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/teilnehmer/${t.id}`}>{t.name}</Link>
                  {rolleBadge[t.rolle] && (
                    <span className="au-badge au-badge-gold" style={{ marginLeft: "0.5rem", fontSize: "0.72rem" }}>
                      {rolleBadge[t.rolle]}
                    </span>
                  )}
                </td>
                <td>{t.orga}</td>
                <td>{t.telefon}</td>
                <td>{t.email}</td>
                <td>
                  {t.zimmer}
                  {partnerVonTeilnehmer.has(t.id) && (
                    <>
                      {t.zimmer !== "—" ? " · " : ""}
                      <span style={{ color: "var(--color-text-muted)", fontSize: "0.82rem" }}>
                        teilt Zimmer mit {partnerVonTeilnehmer.get(t.id)!.name}
                      </span>
                    </>
                  )}
                </td>
                <td>{t.essen}</td>
                <td>{t.quelle === "legacy" ? <span className="au-badge">Alt-Daten</span> : "Aktuell"}</td>
              </tr>
            ))}
            {!teilnehmerListe.length && (
              <tr className="au-table-empty"><td colSpan={7}>Noch keine Teilnehmer für diesen Termin.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="au-card">
        <h2>Zimmerpartner</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Für Paare (z. B. Ehepaare), die sich ein Zimmer teilen — reduziert die Zimmerzahl automatisch, beide Personen bleiben in der Teilnehmerliste sichtbar.
        </p>
        {zimmerpartner && zimmerpartner.length > 0 && (
          <table className="au-table" style={{ marginBottom: "1rem" }}>
            <thead>
              <tr>
                <th>Person A</th>
                <th>Person B</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {zimmerpartner.map((z: any) => (
                <tr key={z.id}>
                  <td>{z.teilnehmer_a ? `${z.teilnehmer_a.vorname} ${z.teilnehmer_a.nachname}` : "—"}</td>
                  <td>{z.teilnehmer_b ? `${z.teilnehmer_b.vorname} ${z.teilnehmer_b.nachname}` : "—"}</td>
                  <td>
                    <form action={entferneZimmerpartner} style={{ display: "inline" }}>
                      <input type="hidden" name="zuordnung_id" value={z.id} />
                      <input type="hidden" name="seminartermin_id" value={id} />
                      <button type="submit" className="au-link-danger">entfernen</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {teilnehmerListe.length >= 2 ? (
          <form action={setzeZimmerpartner} className="au-row-2">
            <input type="hidden" name="seminartermin_id" value={id} />
            <div>
              <label className="au-label">Person A</label>
              <select className="au-input" name="teilnehmer_id_a" required>
                <option value="">— wählen —</option>
                {teilnehmerListe.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="au-label">Person B</label>
              <select className="au-input" name="teilnehmer_id_b" required>
                <option value="">— wählen —</option>
                {teilnehmerListe.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" className="au-btn au-btn-primary">Als Zimmerpartner verknüpfen</button>
            </div>
          </form>
        ) : (
          <p style={{ color: "var(--color-text-faint)", fontSize: "0.85rem" }}>Mindestens 2 Teilnehmer nötig.</p>
        )}
      </div>

      <div className="au-card">
        <h2>Termin bearbeiten</h2>
        <form action={previewSeminarterminUpdate} style={{ maxWidth: 560 }}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <div className="au-row-2">
            <div>
              <label className="au-label">Titel des Seminars</label>
              <input className="au-input" name="titel" defaultValue={termin.titel || ""} placeholder="z. B. Preisfindung Intensiv – Herbst 2026" required />
            </div>
            <div>
              <label className="au-label">Kennung (optional, z. B. SPS126)</label>
              <input className="au-input" name="kennung" defaultValue={termin.kennung || ""} placeholder="z. B. SPS126" />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Startdatum</label>
              <input className="au-input" name="datum_start" type="date" defaultValue={termin.datum_start} required />
            </div>
            <div>
              <label className="au-label">Startuhrzeit</label>
              <input className="au-input" name="zeit_start" type="time" defaultValue={termin.zeit_start?.slice(0, 5) || ""} />
            </div>
          </div>
          <div className="au-row-2">
            <div>
              <label className="au-label">Enddatum</label>
              <input className="au-input" name="datum_ende" type="date" defaultValue={termin.datum_ende || termin.datum_start} />
            </div>
            <div>
              <label className="au-label">Enduhrzeit</label>
              <input className="au-input" name="zeit_ende" type="time" defaultValue={termin.zeit_ende?.slice(0, 5) || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Vorabendanreise – Tag</label>
              <input className="au-input" name="vorabend_anreise_datum" type="date" defaultValue={termin.vorabend_anreise_datum || ""} />
            </div>
            <div>
              <label className="au-label">Vorabendanreise – Uhrzeit</label>
              <input className="au-input" name="vorabend_anreise_uhrzeit" type="time" defaultValue={termin.vorabend_anreise_uhrzeit?.slice(0, 5) || ""} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Format</label>
              <select className="au-input" name="format" defaultValue={termin.format}>
                <option value="praesenz">Präsenz</option>
                <option value="online">Online</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="au-label">Ort</label>
              <select className="au-input" name="veranstaltungsort_id" defaultValue={termin.veranstaltungsort_id || ""}>
                <option value="">—</option>
                {orte?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.ort ? ` – ${o.ort}` : ""}{o.nahe_grossstadt ? ` (bei ${o.nahe_grossstadt})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="au-label">Trainer</label>
          <select className="au-input" name="trainer_id" defaultValue={termin.trainer_id || ""}>
            <option value="">—</option>
            {trainerListe?.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <div className="au-row-2">
            <div>
              <label className="au-label">Kapazität</label>
              <input className="au-input" name="kapazitaet" type="number" defaultValue={termin.kapazitaet} />
            </div>
            <div>
              <label className="au-label">Mindestteilnehmerzahl</label>
              <input className="au-input" name="mindestteilnehmerzahl" type="number" defaultValue={termin.mindestteilnehmerzahl} />
            </div>
          </div>

          <div className="au-row-2">
            <div>
              <label className="au-label">Überbuchungspuffer (intern)</label>
              <input className="au-input" name="ueberbuchungspuffer" type="number" defaultValue={termin.ueberbuchungspuffer} />
            </div>
            <div>
              <label className="au-label">Angezeigte Restplätze (manuell, Urgency)</label>
              <input className="au-input" name="angezeigte_restplaetze" type="number" defaultValue={termin.angezeigte_restplaetze ?? ""} placeholder="leer = kein Hinweis" />
            </div>
          </div>

          <div className="au-card">
            <strong>Zusätzlicher Teilnehmer (Gruppenpreis)</strong>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0.4rem 0 0.75rem" }}>
              Preis für die 2. (und weitere) Person derselben Firma. Entweder Festpreis ODER Rabatt in % angeben, nicht beides.
            </p>
            <div className="au-row-2">
              <div>
                <label className="au-label">Festpreis pro weiterer Person (€)</label>
                <input className="au-input" name="zusatzteilnehmer_preis" type="number" step="0.01" defaultValue={termin.zusatzteilnehmer_preis ?? ""} placeholder="z. B. 990" />
              </div>
              <div>
                <label className="au-label">oder Rabatt (%)</label>
                <input className="au-input" name="zusatzteilnehmer_rabatt_prozent" type="number" step="0.1" defaultValue={termin.zusatzteilnehmer_rabatt_prozent ?? ""} placeholder="z. B. 15" />
              </div>
            </div>
          </div>

          <button type="submit" className="au-btn au-btn-primary">
            Änderungen speichern
          </button>
        </form>
      </div>

      <div className="au-card">
        <h2>Mitarbeiter beim Termin</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Referenten/Assistenz, die bei diesem Termin dabei sind — nicht als Teilnehmer, sondern als Personal erfasst.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terminMitarbeiter?.map((tm: any) => (
              <tr key={tm.id}>
                <td>{tm.mitarbeiter?.name}</td>
                <td>{tm.rolle}</td>
                <td>
                  <form action={removeMitarbeiterVonTermin} style={{ display: "inline" }}>
                    <input type="hidden" name="zuordnung_id" value={tm.id} />
                    <input type="hidden" name="seminartermin_id" value={id} />
                    <button type="submit" className="au-link-danger">entfernen</button>
                  </form>
                </td>
              </tr>
            ))}
            {!terminMitarbeiter?.length && (
              <tr><td colSpan={3} style={{ color: "var(--color-text-faint)" }}>Noch keine Mitarbeiter zugeordnet.</td></tr>
            )}
          </tbody>
        </table>
        <form action={addMitarbeiterZuTermin} className="au-row-2">
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label className="au-label">Mitarbeiter</label>
            <select className="au-input" name="mitarbeiter_id" required>
              <option value="">— wählen —</option>
              {mitarbeiterListe?.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="au-label">Rolle</label>
            <select className="au-input" name="rolle" defaultValue="Referent">
              <option value="Referent">Referent</option>
              <option value="Assistenz">Assistenz</option>
              <option value="Co-Trainer">Co-Trainer</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="au-btn au-btn-primary">Mitarbeiter zuordnen</button>
          </div>
        </form>
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
          Fehlt jemand in der Liste? Unter <a href="/mitarbeiter" >Mitarbeiter</a> neu anlegen.
        </p>
      </div>

      <div className="au-card">
        <h2>Optionen (z. B. A / B / C)</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Jede Option ist ein eigenes buchbares Paket mit eigenem Titel, Beschreibung, Featureliste und eigenen Preisstufen (Frühbucher/Normalpreis). Ein Seminar mit nur einer Buchungsvariante braucht nur eine Option.
        </p>

        <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.25rem" }}>Vorschau</h3>
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.8rem", margin: "0 0 0.25rem" }}>
          So kommen die Optionen ungefähr auf der Website an (Preis-Sektion und Buchungsformular auf Onepage) – zum Gegenchecken, bevor die Preise dorthin übertragen werden.
        </p>
        {optionen?.length ? (
          <div className="au-option-preview-grid">
            {optionen.map((opt: any) => {
              const previewPreis = aktuellerPreisNettoVorschau(opt.preisstaffeln || [], termin.datum_start);
              const featuresSortiert = (opt.seminartermin_options_features || [])
                .slice()
                .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0));
              return (
                <div
                  key={opt.id}
                  className={`au-option-preview-card ${opt.badge === "empfohlen" ? "au-option-preview-card-empfohlen" : ""}`}
                >
                  {opt.badge && <span className="au-badge au-badge-gold">{badgeLabel[opt.badge] || opt.badge}</span>}
                  <p className="au-option-preview-title">{opt.titel}</p>
                  {opt.beschreibung && <p className="au-option-preview-desc">{renderFett(opt.beschreibung)}</p>}
                  {previewPreis !== null ? (
                    <p className="au-option-preview-price">
                      {formatEUR(previewPreis)}
                      <span className="au-option-preview-price-hinweis"> netto · {formatEURBrutto(previewPreis)} brutto</span>
                    </p>
                  ) : (
                    <p className="au-option-preview-price-fehlt">Noch kein Preis hinterlegt</p>
                  )}
                  {featuresSortiert.length > 0 && (
                    <ul className="au-option-preview-features">
                      {featuresSortiert.map((f: any) => (
                        <li key={f.id}>{renderFett(f.text)}</li>
                      ))}
                    </ul>
                  )}
                  {opt.zusatz_teilnehmer_hinweis && (
                    <p className="au-option-preview-zusatz">{renderFett(opt.zusatz_teilnehmer_hinweis)}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="au-option-preview-empty">Noch keine Optionen angelegt – die Vorschau erscheint hier, sobald mindestens eine Option existiert.</div>
        )}

        {optionen?.map((opt: any) => (
          <div key={opt.id} className="au-subcard">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong>{opt.titel}</strong>
                {opt.badge && <span className="au-badge au-badge-gold">{badgeLabel[opt.badge] || opt.badge}</span>}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <form action={duplicateSeminarOption}>
                  <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                  <input type="hidden" name="seminartermin_id" value={id} />
                  <button type="submit" className="au-btn au-btn-secondary" title="Legt eine Kopie dieser Option (inkl. Features und Preisstaffeln) an, z. B. als Basis für Option B">
                    Option duplizieren
                  </button>
                </form>
              </div>
            </div>
            {opt.beschreibung && <p style={{ color: "#444", fontSize: "0.9rem", margin: "0.35rem 0" }}>{renderFett(opt.beschreibung)}</p>}

            <details style={{ margin: "0.5rem 0" }}>
              <summary style={{ cursor: "pointer", color: "#0B1B33", fontSize: "0.85rem", fontWeight: 600 }}>Option bearbeiten</summary>
              <form action={updateSeminarOption} style={{ marginTop: "0.6rem", maxWidth: 480 }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <label className="au-label">Titel</label>
                <input className="au-input" name="titel" defaultValue={opt.titel} required />
                <label className="au-label">Beschreibung</label>
                <FettTextarea name="beschreibung" defaultValue={opt.beschreibung || ""} placeholder="Kurze Beschreibung dieser Option" />
                <label className="au-label">Sortierung (0 = zuerst)</label>
                <input className="au-input" name="sortierung" type="number" defaultValue={opt.sortierung ?? 0} />
                <label className="au-label">Hinweis: zusätzlicher Teilnehmer (erscheint unter der Preistabelle auf Onepage)</label>
                <FettTextarea
                  name="zusatz_teilnehmer_hinweis"
                  defaultValue={opt.zusatz_teilnehmer_hinweis || ""}
                  placeholder="z. B. Jeder weitere zusätzliche Teilnehmer aus Deiner Agentur im Seminar pro Person 3.480 €. Inklusive drei Übernachtungen im Einzelzimmer mit Frühstück, drei gemeinsamen Mittag- und Abendessen. Inklusive allen Getränken (exklusive Hotelbar)"
                />
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button type="submit" className="au-btn au-btn-secondary">Speichern</button>
                </div>
              </form>
              <form action={deleteSeminarOption} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <button type="submit" className="au-btn au-btn-danger">Option löschen</button>
              </form>
            </details>

            <form action={updateOptionBadge} style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0" }}>
              <input type="hidden" name="seminartermin_option_id" value={opt.id} />
              <input type="hidden" name="seminartermin_id" value={id} />
              <label className="au-label" style={{ marginBottom: 0 }}>Kennzeichnung</label>
              <select name="badge" defaultValue={opt.badge || ""} style={{ padding: "0.35rem" }}>
                <option value="">Keine</option>
                <option value="empfohlen">Empfohlen</option>
                <option value="meistgekauft">Meistgekauft</option>
              </select>
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
            </form>

            <div style={{ marginTop: "0.75rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Features</span>
              <ul style={{ margin: "0.35rem 0 0.5rem", paddingLeft: "1.2rem" }}>
                {opt.seminartermin_options_features
                  ?.sort((a: any, b: any) => a.sortierung - b.sortierung)
                  .map((f: any) => (
                    <li key={f.id} style={{ fontSize: "0.9rem" }}>
                      {renderFett(f.text)}
                      <form action={deleteOptionFeature} style={{ display: "inline" }}>
                        <input type="hidden" name="feature_id" value={f.id} />
                        <input type="hidden" name="seminartermin_id" value={id} />
                        <button type="submit" className="au-link-danger">entfernen</button>
                      </form>
                    </li>
                  ))}
                {!opt.seminartermin_options_features?.length && (
                  <li style={{ fontSize: "0.9rem", color: "var(--color-text-faint)", listStyle: "none", marginLeft: "-1.2rem" }}>Noch keine Features.</li>
                )}
              </ul>
              <form action={createOptionFeature} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <FettInput name="text" placeholder="z. B. Einzelcoaching inklusive" required />
                <button type="submit" className="au-btn au-btn-secondary">+ Feature</button>
              </form>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--color-text-muted)" }}>Preisstaffeln (Nettopreise, zzgl. gesetzlicher USt.)</span>
              <table className="au-table" style={{ margin: "0.35rem 0 0.5rem" }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Stichtag (Tage vorher)</th>
                    <th>Preis (netto)</th>
                    <th>Preis (brutto, 19% USt.)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {opt.preisstaffeln
                    ?.sort((a: any, b: any) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start)
                    .map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.stichtag_tage_vor_start}</td>
                        <td>{formatEUR(Number(p.preis))}</td>
                        <td style={{ color: "var(--color-text-muted)" }}>{formatEURBrutto(Number(p.preis))}</td>
                        <td>
                          <form action={deletePreisstaffel}>
                            <input type="hidden" name="preisstaffel_id" value={p.id} />
                            <input type="hidden" name="seminartermin_id" value={id} />
                            <button type="submit" className="au-link-danger">entfernen</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  {!opt.preisstaffeln?.length && (
                    <tr><td colSpan={5} style={{ color: "var(--color-text-faint)" }}>Noch keine Preisstaffeln.</td></tr>
                  )}
                </tbody>
              </table>
              <form action={createPreisstaffel} className="au-row-2">
                <input type="hidden" name="seminartermin_option_id" value={opt.id} />
                <input type="hidden" name="seminartermin_id" value={id} />
                <div>
                  <label className="au-label">Name (z. B. Super-Frühbucher)</label>
                  <input className="au-input" name="name" required />
                </div>
                <div>
                  <label className="au-label">Stichtag (Tage vor Start)</label>
                  <input className="au-input" name="stichtag_tage_vor_start" type="number" required />
                </div>
                <div>
                  <label className="au-label">Preis (€, netto zzgl. USt.)</label>
                  <input className="au-input" name="preis" type="number" step="0.01" required />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button type="submit" className="au-btn au-btn-secondary">+ Staffel</button>
                </div>
              </form>
            </div>
          </div>
        ))}
        {!optionen?.length && (
          <p style={{ color: "var(--color-text-faint)" }}>Noch keine Optionen angelegt.</p>
        )}

        <div className="au-card">
          <strong>Neue Option hinzufügen</strong>
          <form action={createSeminarOption} style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <div className="au-row-2">
              <div>
                <label className="au-label">Titel (z. B. "Option A – Basis")</label>
                <input className="au-input" name="titel" required />
              </div>
              <div>
                <label className="au-label">Sortierung (0 = zuerst)</label>
                <input className="au-input" name="sortierung" type="number" defaultValue={(optionen?.length || 0)} />
              </div>
            </div>
            <label className="au-label">Kennzeichnung</label>
            <select className="au-input" name="badge" defaultValue="">
              <option value="">Keine</option>
              <option value="empfohlen">Empfohlen</option>
              <option value="meistgekauft">Meistgekauft</option>
            </select>
            <label className="au-label">Beschreibung</label>
            <FettTextarea name="beschreibung" placeholder="Kurze Beschreibung dieser Option" />
            <button type="submit" className="au-btn au-btn-primary">Option anlegen</button>
          </form>
        </div>
      </div>

      <div className="au-card">
        <h2>Urgency-Stufen</h2>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Text, der ab dem jeweiligen Belegungs-Prozentsatz angezeigt wird (basierend auf "Angezeigte Restplätze"). Platzhalter <code>{"{remaining}"}</code> / <code>{"{total}"}</code> möglich.
        </p>
        <table className="au-table">
          <thead>
            <tr>
              <th>Ab % belegt</th>
              <th>Text</th>
            </tr>
          </thead>
          <tbody>
            {urgencyStufen?.map((u) => (
              <tr key={u.id}>
                <td>{u.schwellenwert_prozent}%</td>
                <td>{u.text_vorlage}</td>
              </tr>
            ))}
            {!urgencyStufen?.length && (
              <tr><td colSpan={2} style={{ color: "var(--color-text-faint)" }}>Noch keine Urgency-Stufen.</td></tr>
            )}
          </tbody>
        </table>
        <form action={createUrgencyStufe} className="au-row-2">
          <input type="hidden" name="seminartermin_id" value={id} />
          <div>
            <label className="au-label">Schwellenwert (% belegt)</label>
            <input className="au-input" name="schwellenwert_prozent" type="number" min={0} max={100} required />
          </div>
          <div>
            <label className="au-label">Text</label>
            <input className="au-input" name="text_vorlage" placeholder="Nur noch wenige Plätze" required />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit" className="au-btn au-btn-primary">
              Stufe hinzufügen
            </button>
          </div>
        </form>
      </div>

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
