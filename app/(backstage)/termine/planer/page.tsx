export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import {
  ladePlanerDaten,
  generiere,
  bewerte,
  waehleVerteilt,
  zeitraumGrenzen,
  wochentag,
  abstandFuer,
  automatischeTermine,
  stelleFerienSicher,
  type Format,
  type Bewertung,
} from "@/lib/terminplaner";
import {
  legeKandidatAn,
  setzeKandidatStatus,
  aktualisiereKandidat,
  bestaetigeKandidat,
  speichereNachbewertung,
  legeKonferenzAn,
  loescheKonferenz,
  legeBlockerAn,
  aktualisiereBlocker,
  loescheBlocker,
  ladeFerienNach,
  legeBedarfAn,
  loescheBedarf,
  legeFormatAn,
  setzeFormatAktiv,
  aktualisiereFormat,
  speichereEinstellungen,
  setzeOrtFuerPlanung,
} from "@/lib/terminplaner-actions";
import SeitenTabs from "../../SeitenTabs";
import AktionsFormular from "../../AktionsFormular";
import TermineNav from "../TermineNav";
import ManuellerKandidat from "./ManuellerKandidat";
import BewertungAnzeige from "./BewertungAnzeige";
import KopierText from "./KopierText";
import KategorieWahl from "./KategorieWahl";
import PlanerKalender, { KalenderLegende, type KalenderBalken } from "./PlanerKalender";

export const metadata = { title: "Terminplaner" };

const WT = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ZEITRAUM_LABEL: Record<string, string> = { jahr: "ganzes Jahr", H1: "1. Halbjahr", H2: "2. Halbjahr", Q1: "Q1", Q2: "Q2", Q3: "Q3", Q4: "Q4" };
const STATUS_LABEL: Record<string, string> = { vorgeschlagen: "Kandidat", in_pruefung: "In Prüfung beim Hotel", bestaetigt: "Bestätigt", verworfen: "Verworfen" };

// "Mi 14.04.27 – Fr 16.04.27 (Anreise Di 13.04.)"
function spanne(b: { datum_start: string; datum_ende: string; anreise_datum?: string | null; start_uhrzeit?: string | null; end_uhrzeit?: string | null }) {
  const kurz = (iso: string) => `${WT[wochentag(iso)]} ${formatDatum(iso)}`;
  const teil = b.datum_start === b.datum_ende ? kurz(b.datum_start) : `${kurz(b.datum_start)} – ${kurz(b.datum_ende)}`;
  const uhr = b.start_uhrzeit ? `, ${b.start_uhrzeit.slice(0, 5)}${b.end_uhrzeit ? `–${b.end_uhrzeit.slice(0, 5)}` : ""} Uhr` : "";
  return b.anreise_datum ? `${teil}${uhr} (Anreise ${kurz(b.anreise_datum)})` : `${teil}${uhr}`;
}

const MODUS_LABEL: Record<string, string> = { abschlag: "Ferien meiden", neutral: "Ferien egal", bonus: "Ferien bevorzugen" };
// Formate ohne Uebernachtung (Abend, Halbtag): keine Hotelanfrage, Location direkt
const mitHotel = (f?: { benoetigt_uebernachtung?: boolean | null } | null) => f?.benoetigt_uebernachtung !== false;

export default async function TerminplanerPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string; format?: string; zeitraum?: string; ort?: string }>;
}) {
  const sp = await searchParams;
  const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const jahr = Number(sp.jahr) || Math.max(2027, Number(heute.slice(0, 4)) + 1);
  const supabase = getSupabaseAdmin();
  // Neues Jahr aufgerufen? Ferien/Feiertage einmalig selbst nachladen (auch Folgejahr fuer den Jahreswechsel)
  await Promise.all([stelleFerienSicher(jahr), stelleFerienSicher(jahr + 1)]);

  const [{ data: formateAlle }, { data: orteAlle }, { data: typen }, { data: bedarf }, { data: kandidaten }, { data: konferenzen }, { data: blocker }, { data: ferienJahr }, daten] =
    await Promise.all([
      supabase.from("termin_formate").select("*").order("sortierung").order("name"),
      supabase.from("veranstaltungsorte").select("id, name, ort, terminplanung_aktiv").order("name"),
      supabase.from("seminartypen").select("id, name, farbe").order("name"),
      supabase.from("kategorie_bedarf").select("*, seminartypen(name), termin_formate(name)").eq("jahr", jahr).order("zeitraum"),
      supabase
        .from("terminvorschlaege")
        .select("*, termin_formate(*), veranstaltungsorte(name), seminartypen(name, farbe), seminartermine(id, kennung)")
        .gte("datum_start", `${jahr}-01-01`)
        .lte("datum_start", `${jahr}-12-31`)
        .order("datum_start"),
      supabase.from("konferenz_kalender").select("*").gte("bis", `${jahr}-01-01`).lte("von", `${jahr}-12-31`).order("von"),
      supabase.from("persoenliche_blocker").select("*").order("monat").order("tag"),
      supabase.from("ferien_kalender").select("land, region, typ, bezeichnung, von, bis").eq("jahr", jahr).order("von"),
      ladePlanerDaten(jahr),
    ]);

  const formate = ((formateAlle || []) as (Format & { aktiv: boolean; beschreibung: string | null })[]).filter((f) => f.aktiv);
  const format = formate.find((f) => f.id === sp.format) || formate.find((f) => f.name.startsWith("3-Tage")) || formate[0];
  const zeitraum = sp.zeitraum && ZEITRAUM_LABEL[sp.zeitraum] ? sp.zeitraum : "jahr";
  const planungsOrte = (orteAlle || []).filter((o: any) => o.terminplanung_aktiv);
  const ortId = sp.ort && planungsOrte.some((o: any) => o.id === sp.ort) ? sp.ort : planungsOrte[0]?.id || "";

  // Termine des Jahres pro Kategorie (fuer "offener Bedarf")
  const { data: termineJahr } = await supabase
    .from("seminartermine")
    .select("id, kennung, titel, seminartyp_id, datum_start, datum_ende, seminartypen(name, farbe)")
    .neq("status", "abgesagt")
    .gte("datum_start", `${jahr}-01-01`)
    .lte("datum_start", `${jahr}-12-31`);

  // Touring: derselbe Tag in einer anderen Stadt ist ein eigener Kandidat
  // Jedes Jahr automatisch (Karneval) -- in Liste und Kalender wie Konferenzen
  const alleKonferenzen = [...(konferenzen || []), ...automatischeTermine([jahr])].sort((a: any, b: any) => a.von.localeCompare(b.von));

  const gemerkt = new Set(
    (kandidaten || []).filter((k: any) => k.status !== "verworfen").map((k: any) => `${k.format_id}|${k.datum_start}|${k.veranstaltungsort_id || ""}`)
  );

  const vorschlagZeile = (b: Bewertung, f: Format, typId?: string) => {
    const schon = gemerkt.has(`${f.id}|${b.datum_start}|${ortId || ""}`);
    return (
      <li key={`${f.id}-${b.datum_start}`} className="au-tp-zeile">
        <div className="au-tp-zeile-kopf">
          <strong>{spanne({ ...b, start_uhrzeit: f.start_uhrzeit, end_uhrzeit: f.end_uhrzeit })}</strong>
          {schon ? (
            <span className="au-badge au-badge-neutral">schon unter Kandidaten</span>
          ) : (
            <AktionsFormular action={legeKandidatAn} className="au-tp-knoepfe">
              <input type="hidden" name="datum_start" value={b.datum_start} />
              <input type="hidden" name="format_id" value={f.id} />
              <input type="hidden" name="herkunft" value="algorithmisch" />
              {ortId && <input type="hidden" name="veranstaltungsort_id" value={ortId} />}
              {typId && <input type="hidden" name="seminartyp_id" value={typId} />}
              <button type="submit" name="status" value="vorgeschlagen" className="au-btn au-btn-secondary au-btn-sm">Merken</button>
              <button type="submit" name="status" value="in_pruefung" className="au-btn au-btn-primary au-btn-sm">
                {mitHotel(f) ? "Hotel anfragen" : "Location anfragen"}
              </button>
            </AktionsFormular>
          )}
        </div>
        <BewertungAnzeige b={b} kompakt />
      </li>
    );
  };

  // ---------- Reiter "Vorschläge" ----------
  const [zVon, zBis] = zeitraumGrenzen(jahr, zeitraum);
  const kandidatenListe = format ? generiere(zVon, zBis, format, daten, heute) : [];
  const beste = format ? waehleVerteilt(kandidatenListe, 12, abstandFuer(format, daten)) : [];

  const bedarfsGruppen = (bedarf || []).map((bd: any) => {
    const f = formate.find((x) => x.id === bd.format_id) || format;
    const [bVon, bBis] = zeitraumGrenzen(jahr, bd.zeitraum);
    const vorhanden = (termineJahr || []).filter((t: any) => t.seminartyp_id === bd.seminartyp_id && t.datum_start >= bVon && t.datum_start <= bBis).length;
    const inArbeit = (kandidaten || []).filter(
      (k: any) => k.seminartyp_id === bd.seminartyp_id && k.status === "in_pruefung" && k.datum_start >= bVon && k.datum_start <= bBis
    ).length;
    const offen = Math.max(0, bd.anzahl - vorhanden - inArbeit);
    const liste = f && offen > 0 ? waehleVerteilt(generiere(bVon, bBis, f, daten, heute), Math.max(3, offen * 3), abstandFuer(f, daten)) : [];
    return { bd, f, vorhanden, inArbeit, offen, liste };
  });

  const vorschlaegeTab = (
    <div className="au-tp-stapel">
      <form method="get" className="au-tp-filter">
        <label>
          <span className="au-klein">Jahr</span>
          <select className="au-select" name="jahr" defaultValue={jahr}>
            {[jahr - 1, jahr, jahr + 1, jahr + 2].filter((j) => j >= 2026).map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-klein">Format</span>
          <select className="au-select" name="format" defaultValue={format?.id}>
            {formate.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-klein">Zeitraum</span>
          <select className="au-select" name="zeitraum" defaultValue={zeitraum}>
            {Object.entries(ZEITRAUM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-klein">Ort</span>
          <select className="au-select" name="ort" defaultValue={ortId}>
            {planungsOrte.map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
            {!planungsOrte.length && <option value="">– kein Ort für Planung aktiv –</option>}
          </select>
        </label>
        <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Anzeigen</button>
      </form>

      {bedarfsGruppen.length > 0 && (
        <section className="au-panel">
          <div className="au-panel-kopf">
            <h2 style={{ margin: 0 }}>Nach Bedarf {jahr}</h2>
            <a href="#bedarf" className="au-panel-link">Bedarf bearbeiten →</a>
          </div>
          <div className="au-tp-bedarfe">
            {bedarfsGruppen.map(({ bd, f, vorhanden, inArbeit, offen, liste }) => (
              <div key={bd.id} className="au-tp-bedarf">
                <div className="au-tp-bedarf-kopf">
                  <strong>{bd.seminartypen?.name}</strong>
                  <span className="au-klein">
                    {ZEITRAUM_LABEL[bd.zeitraum]} · Ziel {bd.anzahl} · {vorhanden} angelegt · {inArbeit} in Prüfung · {f?.name}
                  </span>
                  <span className={`au-badge ${offen ? "au-badge-warning" : "au-badge-success"}`}>{offen ? `${offen} offen` : "gedeckt"}</span>
                </div>
                {offen > 0 && (
                  <ul className="au-tp-liste">
                    {liste.map((b) => vorschlagZeile(b, f!, bd.seminartyp_id))}
                    {!liste.length && <li className="au-klein">Keine konfliktfreien Termine in diesem Zeitraum gefunden.</li>}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Beste Termine · {format?.name} · {ZEITRAUM_LABEL[zeitraum]} {jahr}</h2>
          <span className="au-klein">{kandidatenListe.length} mögliche Starttage geprüft, hier die besten ohne Überschneidung untereinander</span>
        </div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem 1rem" }}>
          {beste.map((b) => vorschlagZeile(b, format!))}
          {!beste.length && <li className="au-leer">Keine konfliktfreien Termine gefunden – Zeitraum, Format oder Mindestabstand prüfen.</li>}
        </ul>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Eigenen Termin prüfen &amp; merken</h2>
          <span className="au-klein">Beliebiges Datum – wird genauso bewertet, aber nicht gesperrt</span>
        </div>
        <div style={{ padding: "1rem 1.15rem" }}>
          <ManuellerKandidat
            formate={formate.map((f) => ({ id: f.id, name: f.name, start_uhrzeit: f.start_uhrzeit || null, end_uhrzeit: f.end_uhrzeit || null, mitHotel: mitHotel(f) }))}
            orte={(orteAlle || []).map((o: any) => ({ id: o.id, name: o.name }))}
            typen={(typen || []) as any[]}
            jahr={jahr}
          />
        </div>
      </section>
    </div>
  );

  // ---------- Reiter "Kandidaten" ----------
  const nachStatus = (s: string) => (kandidaten || []).filter((k: any) => k.status === s);
  const inPruefung = nachStatus("in_pruefung");
  const exportText = inPruefung
    .filter((k: any) => mitHotel(k.termin_formate))
    .map((k: any) => `• ${spanne(k)} – ${k.termin_formate?.name || ""}${k.veranstaltungsorte?.name ? ` – ${k.veranstaltungsorte.name}` : ""}${k.seminartypen?.name ? ` (${k.seminartypen.name})` : ""}`)
    .join("\n");

  const kandidatZeile = (k: any) => {
    const live = k.termin_formate && k.status !== "bestaetigt" && k.status !== "verworfen" ? bewerte(k.datum_start, k.termin_formate as Format, daten, heute, { vorschlagId: k.id }) : null;
    return (
      <li key={k.id} className="au-tp-zeile">
        <div className="au-tp-zeile-kopf">
          <div>
            <strong>{spanne(k)}</strong>
            <div className="au-klein">
              {k.termin_formate?.name} · {k.herkunft === "manuell" ? "selbst gewählt" : "vom Planer vorgeschlagen"}
              {k.veranstaltungsorte?.name && ` · ${k.veranstaltungsorte.name}`}
              {k.seminartypen?.name && ` · ${k.seminartypen.name}`}
              {k.kollision_bestaetigt && " · Überschneidung bewusst bestätigt"}
            </div>
          </div>
          <div className="au-tp-knoepfe">
            {(k.status === "vorgeschlagen" || k.status === "in_pruefung") && (
              <KategorieWahl kandidatId={k.id} wert={k.seminartyp_id} typen={(typen || []) as any[]} />
            )}
            {k.status === "vorgeschlagen" && (
              <form action={setzeKandidatStatus}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="status" value="in_pruefung" />
                <button type="submit" className="au-btn au-btn-primary au-btn-sm">{mitHotel(k.termin_formate) ? "Hotel anfragen" : "Location anfragen"}</button>
              </form>
            )}
            {k.status === "in_pruefung" && (
              <form action={setzeKandidatStatus}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="status" value="vorgeschlagen" />
                <button type="submit" className="au-link">zurück zu Kandidaten</button>
              </form>
            )}
            {(k.status === "vorgeschlagen" || k.status === "in_pruefung") && (
              <form action={setzeKandidatStatus}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="status" value="verworfen" />
                <button type="submit" className="au-link-danger">verwerfen</button>
              </form>
            )}
            {k.status === "verworfen" && (
              <form action={setzeKandidatStatus}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="status" value="vorgeschlagen" />
                <button type="submit" className="au-link">wiederherstellen</button>
              </form>
            )}
            {k.status === "bestaetigt" && k.seminartermine && (
              <Link href={`/termine/${k.seminartermine.id}`} className="au-btn au-btn-secondary au-btn-sm">
                {k.seminartermine.kennung || "Termin"} öffnen →
              </Link>
            )}
          </div>
        </div>
        {live && <BewertungAnzeige b={live} kompakt />}
        {k.notiz && <p className="au-klein" style={{ margin: "0.3rem 0 0" }}>📝 {k.notiz}</p>}

        {(k.status === "vorgeschlagen" || k.status === "in_pruefung") && (
          <details className="au-tp-details">
            <summary className="au-klein">
              Ort, Kategorie, {mitHotel(k.termin_formate) ? "" : "Uhrzeit, "}Notiz
              {k.status === "in_pruefung" ? ` · ${mitHotel(k.termin_formate) ? "Hotel" : "Location"} hat bestätigt → übernehmen` : ""}
            </summary>
            <form action={aktualisiereKandidat} className="au-tp-form">
              <input type="hidden" name="id" value={k.id} />
              <select className="au-select" name="veranstaltungsort_id" defaultValue={k.veranstaltungsort_id || ""}>
                <option value="">Ort offen</option>
                {(orteAlle || []).map((o: any) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <select className="au-select" name="seminartyp_id" defaultValue={k.seminartyp_id || ""}>
                <option value="">Kategorie offen</option>
                {(typen || []).map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {(!mitHotel(k.termin_formate) || k.start_uhrzeit) && (
                <>
                  <label className="au-klein au-tp-inline">von <input className="au-input au-tp-zeit" type="time" name="start_uhrzeit" defaultValue={k.start_uhrzeit?.slice(0, 5) || ""} /></label>
                  <label className="au-klein au-tp-inline">bis <input className="au-input au-tp-zeit" type="time" name="end_uhrzeit" defaultValue={k.end_uhrzeit?.slice(0, 5) || ""} /></label>
                </>
              )}
              <input className="au-input" name="notiz" defaultValue={k.notiz || ""} placeholder={mitHotel(k.termin_formate) ? "Notiz (z. B. Hotel angefragt am …)" : "Notiz (z. B. Location angefragt am …)"} />
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
            </form>
            {k.status === "in_pruefung" && (
              <form action={bestaetigeKandidat} className="au-tp-form au-tp-bestaetigen">
                <input type="hidden" name="id" value={k.id} />
                <select className="au-select" name="seminartyp_id" defaultValue={k.seminartyp_id || ""} required>
                  <option value="">Kategorie wählen *</option>
                  {(typen || []).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <select className="au-select" name="veranstaltungsort_id" defaultValue={k.veranstaltungsort_id || ""} required>
                  <option value="">Ort wählen *</option>
                  {(orteAlle || []).map((o: any) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <input className="au-input" name="kennung" placeholder="Kennung, z. B. ORG127" />
                <input className="au-input" name="titel" placeholder="Titel (optional)" />
                <button type="submit" className="au-btn au-btn-primary au-btn-sm">
                  {mitHotel(k.termin_formate) ? "Hotel" : "Location"} bestätigt – ins Terminverzeichnis übernehmen
                </button>
              </form>
            )}
          </details>
        )}

        {k.status === "bestaetigt" && (
          <details className="au-tp-details">
            <summary className="au-klein">
              Nachbewertung{k.nachbewertung ? `: lief terminlich ${k.nachbewertung}` : " – wie lief der Termin?"}
            </summary>
            <form action={speichereNachbewertung} className="au-tp-form">
              <input type="hidden" name="id" value={k.id} />
              <select className="au-select" name="nachbewertung" defaultValue={k.nachbewertung || ""}>
                <option value="">– noch offen –</option>
                <option value="gut">gut</option>
                <option value="mittel">mittel</option>
                <option value="schlecht">schlecht</option>
              </select>
              <input className="au-input" name="nachbewertung_text" defaultValue={k.nachbewertung_text || ""} placeholder="Warum? z. B. „Brückentag danach – viele kamen früher“" />
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
            </form>
          </details>
        )}
      </li>
    );
  };

  const kandidatenTab = (
    <div className="au-tp-stapel">
      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>In Prüfung (Hotel bzw. Location)</h2>
          <span className="au-klein">{inPruefung.length}</span>
        </div>
        {inPruefung.length ? (
          <>
            {exportText ? (
              <div style={{ padding: "0.9rem 1.15rem 0" }}>
                <span className="au-label">Text für die Hotelanfrage <span className="au-klein">(nur Formate mit Übernachtung)</span></span>
                <KopierText text={`Anfrage Seminartermine ${jahr}:\n${exportText}`} />
              </div>
            ) : (
              <p className="au-klein" style={{ padding: "0.9rem 1.15rem 0", margin: 0 }}>Keine Hotelanfrage nötig – alles Formate ohne Übernachtung, Location direkt anfragen.</p>
            )}
            <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem 1rem" }}>{inPruefung.map(kandidatZeile)}</ul>
          </>
        ) : (
          <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Noch nichts in Prüfung – unter „Vorschläge“ auf „Hotel anfragen“ klicken.</p>
        )}
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Gemerkte Kandidaten</h2>
          <span className="au-klein">{nachStatus("vorgeschlagen").length}</span>
        </div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem 1rem" }}>
          {nachStatus("vorgeschlagen").map(kandidatZeile)}
          {!nachStatus("vorgeschlagen").length && <li className="au-leer">Keine.</li>}
        </ul>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Bestätigt &amp; übernommen</h2>
          <span className="au-klein">{nachStatus("bestaetigt").length}</span>
        </div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem 1rem" }}>
          {nachStatus("bestaetigt").map(kandidatZeile)}
          {!nachStatus("bestaetigt").length && <li className="au-leer">Noch keine.</li>}
        </ul>
      </section>

      {nachStatus("verworfen").length > 0 && (
        <details className="au-panel" style={{ padding: "0.75rem 1.15rem" }}>
          <summary className="au-klein">Verworfen ({nachStatus("verworfen").length}) – bleiben zur Nachvollziehbarkeit erhalten</summary>
          <ul className="au-tp-liste">{nachStatus("verworfen").map(kandidatZeile)}</ul>
        </details>
      )}
    </div>
  );

  // ---------- Reiter "Bedarf" ----------
  const bedarfTab = (
    <section className="au-panel">
      <div className="au-panel-kopf">
        <h2 style={{ margin: 0 }}>Bedarf {jahr}</h2>
        <span className="au-klein">Wie viele Termine pro Kategorie und Zeitraum – steuert die Vorschläge „Nach Bedarf“</span>
      </div>
      <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem" }}>
        {bedarfsGruppen.map(({ bd, vorhanden, inArbeit, offen }) => (
          <li key={bd.id} className="au-tp-zeile au-tp-zeile-kopf">
            <span>
              <strong>{bd.seminartypen?.name}</strong> · {ZEITRAUM_LABEL[bd.zeitraum]} · {bd.anzahl} Termin{bd.anzahl === 1 ? "" : "e"}
              {bd.termin_formate?.name && ` · ${bd.termin_formate.name}`}
              <span className="au-klein"> · {vorhanden} angelegt, {inArbeit} in Prüfung, {offen} offen</span>
            </span>
            <form action={loescheBedarf}>
              <input type="hidden" name="id" value={bd.id} />
              <button type="submit" className="au-link-danger">entfernen</button>
            </form>
          </li>
        ))}
        {!bedarfsGruppen.length && <li className="au-leer">Noch kein Bedarf für {jahr} hinterlegt.</li>}
      </ul>
      <form action={legeBedarfAn} className="au-tp-form" style={{ padding: "0 1.15rem 1.15rem" }}>
        <input type="hidden" name="jahr" value={jahr} />
        <select className="au-select" name="seminartyp_id" required defaultValue="">
          <option value="" disabled>Kategorie …</option>
          {(typen || []).map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select className="au-select" name="zeitraum" defaultValue="H1">
          {Object.entries(ZEITRAUM_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input className="au-input" name="anzahl" type="number" min={1} max={20} defaultValue={1} style={{ maxWidth: 90 }} aria-label="Anzahl Termine" />
        <select className="au-select" name="format_id" defaultValue={format?.id || ""}>
          {formate.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <button type="submit" className="au-btn au-btn-primary au-btn-sm">Bedarf hinzufügen</button>
      </form>
    </section>
  );

  // ---------- Reiter "Kalenderdaten" ----------
  const ferienNachLand = new Map<string, number>();
  (ferienJahr || []).forEach((f: any) => ferienNachLand.set(f.typ === "feiertag" ? "Feiertage DE" : f.land, (ferienNachLand.get(f.typ === "feiertag" ? "Feiertage DE" : f.land) || 0) + 1));
  const bayern = (ferienJahr || []).filter((f: any) => f.land === "DE" && f.region === "BY" && f.typ !== "feiertag");
  const datenTab = (
    <div className="au-tp-stapel">
      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Schulferien &amp; Feiertage {jahr}</h2>
          <form action={ladeFerienNach} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            <select className="au-select" name="jahr" defaultValue={jahr + (ferienJahr?.length ? 1 : 0)} style={{ margin: 0, width: "auto" }}>
              {[jahr - 1, jahr, jahr + 1, jahr + 2].map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Aus OpenHolidays laden</button>
          </form>
        </div>
        <div style={{ padding: "0.9rem 1.15rem" }}>
          <p className="au-klein" style={{ marginTop: 0 }}>
            Quelle: openholidaysapi.org (alle deutschen Bundesländer, Österreich, Schweiz: ZH, BE, LU, BS, BL, AG, SG, ZG, SZ, TG). Bayern zählt dreifach, Schweiz halb.
            Für jedes neue Jahr werden die Daten beim ersten Aufruf automatisch geladen; der Knopf ist nur zum manuellen Nachladen.
            Überschneidung = voller Abzug, 1–2 Tage davor/danach = leichter Abzug.
          </p>
          <div className="au-chips" style={{ marginBottom: "0.75rem" }}>
            {[...ferienNachLand.entries()].map(([land, n]) => (
              <span key={land} className="au-etikett">{land}: {n}</span>
            ))}
            {!ferienNachLand.size && <span className="au-klein">Für {jahr} noch nichts geladen.</span>}
          </div>
          {bayern.length > 0 && (
            <>
              <span className="au-label">Bayern</span>
              <ul className="au-tp-mini">
                {bayern.map((f: any) => (
                  <li key={f.von + f.bezeichnung}>{f.bezeichnung}: {formatDatum(f.von)}{f.bis !== f.von ? ` – ${formatDatum(f.bis)}` : ""}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Konferenzen &amp; Branchentermine</h2>
          <span className="au-klein">Gewicht 1–2 = weicher Abzug, 4–5 = quasi NOGO (±1 Tag)</span>
        </div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem" }}>
          {alleKonferenzen.map((c: any) => (
            <li key={c.id || c.name + c.von} className="au-tp-zeile au-tp-zeile-kopf">
              <span>
                <strong>{c.name}</strong> · {formatDatum(c.von)}{c.bis !== c.von ? ` – ${formatDatum(c.bis)}` : ""}
                {c.ort && ` · ${c.ort}`} <span className={`au-badge ${c.gewicht >= 4 ? "au-badge-danger" : "au-badge-neutral"}`}>Gewicht {c.gewicht}</span>
                {c.quelle && <a href={c.quelle} target="_blank" rel="noreferrer" className="au-klein"> Quelle ↗</a>}
              </span>
              {c.automatisch ? (
                <span className="au-badge au-badge-neutral" title="Wird jedes Jahr aus dem Osterdatum berechnet">automatisch jedes Jahr</span>
              ) : (
                <form action={loescheKonferenz}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="au-link-danger">entfernen</button>
                </form>
              )}
            </li>
          ))}
          {!alleKonferenzen.length && <li className="au-leer">Keine Konferenzen für {jahr}.</li>}
        </ul>
        <form action={legeKonferenzAn} className="au-tp-form" style={{ padding: "0 1.15rem 1.15rem" }}>
          <input className="au-input" name="name" required placeholder="Name, z. B. Agentur-Gipfel" />
          <input className="au-input" name="von" type="date" required aria-label="von" />
          <input className="au-input" name="bis" type="date" aria-label="bis" />
          <input className="au-input" name="ort" placeholder="Ort" />
          <select className="au-select" name="gewicht" defaultValue="2" aria-label="Gewicht">
            {[1, 2, 3, 4, 5].map((g) => (
              <option key={g} value={g}>Gewicht {g}</option>
            ))}
          </select>
          <input className="au-input" name="quelle" type="url" placeholder="Link (optional)" />
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Hinzufügen</button>
        </form>
        <p className="au-klein" style={{ padding: "0 1.15rem 1rem", margin: 0 }}>
          Laufend nachpflegen – gute Quellen: GWA (Gesamtverband Kommunikationsagenturen), CISION-Veranstaltungskalender, marketinglive.events.
        </p>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Persönliche Blocker</h2>
          <span className="au-klein">Jährlich wiederkehrend · hart = nie vorschlagen, weich = Abzug</span>
        </div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem" }}>
          {(blocker || []).map((b: any) => (
            <li key={b.id} className="au-tp-zeile">
              <form action={aktualisiereBlocker} className="au-tp-form">
                <input type="hidden" name="id" value={b.id} />
                <strong style={{ minWidth: "4.5rem" }}>{String(b.tag).padStart(2, "0")}.{String(b.monat).padStart(2, "0")}.</strong>
                <input className="au-input" name="bezeichnung" defaultValue={b.bezeichnung} />
                <label className="au-klein au-tp-inline">Puffer davor <input className="au-input" name="puffer_vorher" type="number" min={0} max={30} defaultValue={b.puffer_vorher} /></label>
                <label className="au-klein au-tp-inline">danach <input className="au-input" name="puffer_nachher" type="number" min={0} max={30} defaultValue={b.puffer_nachher} /></label>
                <label className="au-klein au-tp-inline"><input type="checkbox" name="hart" defaultChecked={b.hart} /> hart (NOGO)</label>
                <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
              </form>
              <form action={loescheBlocker}>
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" className="au-link-danger">entfernen</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={legeBlockerAn} className="au-tp-form" style={{ padding: "0 1.15rem 1.15rem" }}>
          <input className="au-input" name="datum" type="date" required aria-label="Datum (Jahr egal)" />
          <input className="au-input" name="bezeichnung" placeholder="Bezeichnung" />
          <label className="au-klein au-tp-inline">Puffer davor <input className="au-input" name="puffer_vorher" type="number" min={0} max={30} defaultValue={0} /></label>
          <label className="au-klein au-tp-inline">danach <input className="au-input" name="puffer_nachher" type="number" min={0} max={30} defaultValue={0} /></label>
          <label className="au-klein au-tp-inline"><input type="checkbox" name="hart" defaultChecked /> hart</label>
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Hinzufügen</button>
        </form>
      </section>
    </div>
  );

  // ---------- Reiter "Formate & Einstellungen" ----------
  const formateTab = (
    <div className="au-tp-stapel">
      <section className="au-panel">
        <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Formate</h2></div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem" }}>
          {(formateAlle || []).map((f: any) => (
            <li key={f.id} className="au-tp-zeile au-tp-zeile-kopf">
              <span>
                <strong>{f.name}</strong>
                <span className="au-klein">
                  {" "}· Start {f.start_wochentag ? WT[f.start_wochentag] : "beliebiger Werktag"} · {f.halbtag ? "halber Tag" : `${f.seminar_tage} Seminartag${f.seminar_tage === 1 ? "" : "e"}`}
                  {f.vorabend && " · Anreise am Vorabend"}
                  {f.abendprogramm && " · Abendprogramm"}
                  {f.start_uhrzeit && ` · ${f.start_uhrzeit.slice(0, 5)}${f.end_uhrzeit ? `–${f.end_uhrzeit.slice(0, 5)}` : ""} Uhr`}
                  {` · ${f.benoetigt_uebernachtung ? "mit Übernachtung (Hotelanfrage)" : "ohne Übernachtung"}`}
                  {` · Mindestabstand ${f.mindestabstand_tage ?? daten.einstellungen.mindestabstand_tage} Tage${f.mindestabstand_tage == null ? " (Standard)" : ""}`}
                </span>
                <span className={`au-badge ${f.ferien_gewichtung_modus === "bonus" ? "au-badge-success" : f.ferien_gewichtung_modus === "neutral" ? "au-badge-neutral" : "au-badge-warning"}`} style={{ marginLeft: "0.4rem" }}>
                  {MODUS_LABEL[f.ferien_gewichtung_modus] || f.ferien_gewichtung_modus}
                </span>
                <details className="au-tp-details">
                  <summary className="au-klein">bearbeiten</summary>
                  <form action={aktualisiereFormat} className="au-tp-form">
                    <input type="hidden" name="id" value={f.id} />
                    <input className="au-input" name="name" required defaultValue={f.name} aria-label="Name" />
                    <select className="au-select" name="start_wochentag" defaultValue={f.start_wochentag || ""} aria-label="Starttag">
                      <option value="">Start: beliebiger Werktag</option>
                      {[1, 2, 3, 4, 5, 6, 7].map((w) => (
                        <option key={w} value={w}>Start: {WT[w]}</option>
                      ))}
                    </select>
                    <label className="au-klein au-tp-inline">Seminartage <input className="au-input" name="seminar_tage" type="number" min={1} max={10} defaultValue={f.seminar_tage} /></label>
                    <label className="au-klein au-tp-inline" title="Leer = Standard aus den Regeln">
                      Mindestabstand <input className="au-input" name="mindestabstand_tage" type="number" min={0} max={120} defaultValue={f.mindestabstand_tage ?? ""} placeholder={String(daten.einstellungen.mindestabstand_tage)} /> Tage
                    </label>
                    <label className="au-klein au-tp-inline">von <input className="au-input au-tp-zeit" type="time" name="start_uhrzeit" defaultValue={f.start_uhrzeit?.slice(0, 5) || ""} /></label>
                    <label className="au-klein au-tp-inline">bis <input className="au-input au-tp-zeit" type="time" name="end_uhrzeit" defaultValue={f.end_uhrzeit?.slice(0, 5) || ""} /></label>
                    <label className="au-klein au-tp-inline"><input type="checkbox" name="vorabend" defaultChecked={f.vorabend} /> Anreise Vorabend</label>
                    <label className="au-klein au-tp-inline"><input type="checkbox" name="abendprogramm" defaultChecked={f.abendprogramm} /> Abendprogramm</label>
                    <label className="au-klein au-tp-inline"><input type="checkbox" name="halbtag" defaultChecked={f.halbtag} /> Halbtag</label>
                    <label className="au-klein au-tp-inline"><input type="checkbox" name="benoetigt_uebernachtung" defaultChecked={f.benoetigt_uebernachtung} /> braucht Übernachtung</label>
                    <select className="au-select" name="ferien_gewichtung_modus" defaultValue={f.ferien_gewichtung_modus} aria-label="Ferien-Wertung">
                      <option value="abschlag">Ferien meiden (Abschlag)</option>
                      <option value="neutral">Ferien egal (neutral)</option>
                      <option value="bonus">Ferien bevorzugen (Bonus)</option>
                    </select>
                    <input className="au-input" name="beschreibung" defaultValue={f.beschreibung || ""} placeholder="Beschreibung (optional)" />
                    <button type="submit" className="au-btn au-btn-primary au-btn-sm">Speichern</button>
                  </form>
                </details>
                {!f.aktiv && <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.4rem" }}>deaktiviert</span>}
              </span>
              <form action={setzeFormatAktiv}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="aktiv" value={String(!f.aktiv)} />
                <button type="submit" className="au-link">{f.aktiv ? "deaktivieren" : "aktivieren"}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={legeFormatAn} className="au-tp-form" style={{ padding: "0 1.15rem 1.15rem" }}>
          <input className="au-input" name="name" required placeholder="Name, z. B. 2-Tage Do–Fr" />
          <select className="au-select" name="start_wochentag" defaultValue="" aria-label="Starttag">
            <option value="">Start: beliebiger Werktag</option>
            {[1, 2, 3, 4, 5, 6, 7].map((w) => (
              <option key={w} value={w}>Start: {WT[w]}</option>
            ))}
          </select>
          <label className="au-klein au-tp-inline">Seminartage <input className="au-input" name="seminar_tage" type="number" min={1} max={10} defaultValue={2} /></label>
          <label className="au-klein au-tp-inline" title="Leer = Standard aus den Regeln">
            Mindestabstand <input className="au-input" name="mindestabstand_tage" type="number" min={0} max={120} placeholder={String(daten.einstellungen.mindestabstand_tage)} /> Tage
          </label>
          <label className="au-klein au-tp-inline"><input type="checkbox" name="vorabend" /> Anreise Vorabend</label>
          <label className="au-klein au-tp-inline"><input type="checkbox" name="abendprogramm" /> Abendprogramm</label>
          <label className="au-klein au-tp-inline"><input type="checkbox" name="halbtag" /> Halbtag</label>
          <label className="au-klein au-tp-inline">von <input className="au-input au-tp-zeit" type="time" name="start_uhrzeit" /></label>
          <label className="au-klein au-tp-inline">bis <input className="au-input au-tp-zeit" type="time" name="end_uhrzeit" /></label>
          <label className="au-klein au-tp-inline"><input type="checkbox" name="benoetigt_uebernachtung" defaultChecked /> braucht Übernachtung</label>
          <select className="au-select" name="ferien_gewichtung_modus" defaultValue="abschlag" aria-label="Ferien-Wertung">
            <option value="abschlag">Ferien meiden</option>
            <option value="neutral">Ferien egal</option>
            <option value="bonus">Ferien bevorzugen</option>
          </select>
          <button type="submit" className="au-btn au-btn-primary au-btn-sm">Format anlegen</button>
        </form>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Regeln</h2></div>
        <form action={speichereEinstellungen} className="au-tp-form" style={{ padding: "1rem 1.15rem" }}>
          <label className="au-klein au-tp-inline">
            Standard-Mindestabstand zu eigenen Terminen <input className="au-input" name="mindestabstand_tage" type="number" min={0} max={120} defaultValue={daten.einstellungen.mindestabstand_tage} /> Tage
          </label>
          <label className="au-klein au-tp-inline">
            Mindest-Vorlauf <input className="au-input" name="vorlauf_tage" type="number" min={0} max={365} defaultValue={daten.einstellungen.vorlauf_tage} /> Tage
          </label>
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
        </form>
        <p className="au-klein" style={{ padding: "0 1.15rem 1rem", margin: 0 }}>
          Der Standard gilt für alle Formate ohne eigenen Wert (einstellbar pro Format unter „bearbeiten“, 0 = nur keine Überschneidung).
          Kapazität: ein Trainer – keine zeitgleichen Termine. Überschneidungen mit eigenen Seminarterminen schlägt der Planer nie vor.
        </p>
      </section>

      <section className="au-panel">
        <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Orte für die Planung</h2></div>
        <ul className="au-tp-liste" style={{ padding: "0.5rem 1.15rem 1rem" }}>
          {(orteAlle || []).map((o: any) => (
            <li key={o.id} className="au-tp-zeile au-tp-zeile-kopf">
              <span>
                <strong>{o.name}</strong> {o.terminplanung_aktiv && <span className="au-badge au-badge-success">aktiv für Planung</span>}
              </span>
              <form action={setzeOrtFuerPlanung}>
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="aktiv" value={String(!o.terminplanung_aktiv)} />
                <button type="submit" className="au-link">{o.terminplanung_aktiv ? "nicht mehr planen" : "für Planung aktivieren"}</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const offeneBedarfe = bedarfsGruppen.reduce((s, g) => s + g.offen, 0);

  // ---------- Kalender ----------
  const kurzGruende = (b: Bewertung) =>
    b.gruende.length ? b.gruende.sort((x, y) => x.punkte - y.punkte).slice(0, 3).map((g) => `${g.punkte > 0 ? "+" : ""}${g.punkte} ${g.text}`).join("\n") : "keine Konflikte";
  const kalenderBalken: KalenderBalken[] = [
    ...(termineJahr || []).map((t: any) => ({
      key: `t-${t.id}`,
      von: t.datum_start,
      bis: t.datum_ende || t.datum_start,
      art: "termin" as const,
      label: t.kennung || (t.seminartypen?.name || "").slice(0, 4),
      titel: `${t.kennung || t.titel || t.seminartypen?.name || "Seminar"} · ${formatDatum(t.datum_start)}`,
      farbe: t.seminartypen?.farbe,
      href: `/termine/${t.id}`,
    })),
    ...(kandidaten || [])
      .filter((k: any) => k.status === "in_pruefung" || k.status === "vorgeschlagen")
      .map((k: any) => ({
        key: `k-${k.id}`,
        von: k.anreise_datum || k.datum_start,
        bis: k.datum_ende,
        art: (k.status === "in_pruefung" ? "pruefung" : "gemerkt") as KalenderBalken["art"],
        label: `${k.seminartypen?.name?.slice(0, 4) || (k.status === "in_pruefung" ? "Prüf." : "Kand.")}?`,
        farbe: k.seminartypen?.farbe || null,
        kategorieId: k.seminartyp_id,
        titel: `${k.status === "in_pruefung" ? "In Prüfung" : "Gemerkt"}: ${spanne(k)}${k.veranstaltungsorte?.name ? ` · ${k.veranstaltungsorte.name}` : ""}`,
        start: k.datum_start,
        kandidatId: k.id,
      })),
  ];
  // Vorschlaege (aktueller Filter + Bedarf), sofern nicht schon Kandidat
  const vorschlagsBalken = new Map<string, KalenderBalken>();
  const alsBalken = (b: Bewertung, f: Format) => {
    if (gemerkt.has(`${f.id}|${b.datum_start}|${ortId || ""}`)) return;
    vorschlagsBalken.set(`${f.id}-${b.datum_start}`, {
      key: `v-${f.id}-${b.datum_start}`,
      von: b.anreise_datum || b.datum_start,
      bis: b.datum_ende,
      art: "vorschlag",
      label: String(b.score),
      titel: `Vorschlag (${f.name}), Score ${b.score}: ${spanne(b)}\n${kurzGruende(b)}`,
      start: b.datum_start,
      formatId: f.id,
    });
  };
  if (format) beste.forEach((b) => alsBalken(b, format));
  bedarfsGruppen.forEach((g) => g.f && g.liste.forEach((b) => alsBalken(b, g.f!)));
  kalenderBalken.push(...vorschlagsBalken.values());

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            {inPruefung.length} in Prüfung · {nachStatus("vorgeschlagen").length} gemerkt{bedarfsGruppen.length ? ` · ${offeneBedarfe} Termine offen laut Bedarf` : ""}
          </p>
          <h1>Terminplaner {jahr}</h1>
        </div>
      </header>
      <TermineNav aktiv="planer" />

      <section className="au-panel au-panel-breit">
        <div className="au-panel-kopf">
          <h2 style={{ margin: 0 }}>Kalender {jahr}</h2>
          <KalenderLegende />
        </div>
        <div className="au-panel-inhalt" style={{ overflowX: "auto" }}>
          <PlanerKalender
            jahr={jahr}
            heute={heute}
            balken={kalenderBalken}
            ferien={(ferienJahr || []) as any[]}
            konferenzen={alleKonferenzen as any[]}
            blocker={(blocker || []).filter((b: any) => b.aktiv) as any[]}
            formate={formate.map((f) => ({ id: f.id, name: f.name, mitHotel: mitHotel(f) }))}
            orte={(orteAlle || []).map((o: any) => ({ id: o.id, name: o.name }))}
            typen={(typen || []) as any[]}
            standardFormatId={format?.id || ""}
            standardOrtId={ortId}
          />
          <p className="au-klein" style={{ margin: "0.6rem 0 0" }}>
            <strong>Klick auf einen Tag</strong> = diesen Start prüfen und merken · <strong>Kandidaten ziehen</strong> = verschieben (mit Vorschau) · Grün gepunktet = beste Vorschläge ({format?.name}, {ZEITRAUM_LABEL[zeitraum]}{bedarfsGruppen.length ? " und laut Bedarf" : ""}), Zahl = Score.
          </p>
        </div>
      </section>

      <SeitenTabs
        speicherSchluessel="terminplaner"
        ariaLabel="Terminplaner"
        tabs={[
          { key: "vorschlaege", label: "Vorschläge", inhalt: vorschlaegeTab },
          { key: "kandidaten", label: "Kandidaten", anzahl: inPruefung.length + nachStatus("vorgeschlagen").length, inhalt: kandidatenTab },
          { key: "bedarf", label: "Bedarf", anzahl: bedarfsGruppen.length || null, warnung: offeneBedarfe > 0, inhalt: bedarfTab },
          { key: "daten", label: "Ferien, Konferenzen, Blocker", inhalt: datenTab },
          { key: "formate", label: "Formate & Regeln", inhalt: formateTab },
        ]}
      />
    </main>
  );
}
