export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { formatEUR } from "@/lib/format";
import {
  importFastbillRechnungen,
  setzeFastbillKategorie,
  ignoriereFastbillRechnung,
  setzeFastbillOffen,
} from "@/lib/actions";
import FastbillZuordnenForm from "./FastbillZuordnenForm";
import { parseRechnung, type ParserTermin, type RechnungsVorschlag } from "@/lib/fastbill-parser";
import Link from "next/link";

type Filter = "offen" | "zugeordnet" | "ignoriert" | "alle";
const FILTER: Filter[] = ["offen", "zugeordnet", "ignoriert", "alle"];

export default async function FastbillAbgleichPage({
  searchParams,
}: {
  searchParams: Promise<{ importiert?: string; gefunden?: string; jahr?: string; debug?: string; fehler?: string; filter?: string; erledigt?: string }>;
}) {
  const { importiert, gefunden, jahr, debug, fehler, filter: filterRaw, erledigt } = await searchParams;
  // Standard nur offene Rechnungen -- zugeordnete blieben vorher in derselben
  // Liste stehen und sahen aus, als waeren sie noch nicht erledigt.
  const filter: Filter = FILTER.includes(filterRaw as Filter) ? (filterRaw as Filter) : "offen";
  const supabase = getSupabaseAdmin();

  const { data: rechnungen } = await supabase
    .from("fastbill_rechnungen")
    .select(
      "id, fastbill_invoice_number, rechnungsdatum, ist_storno, positionen, kunde_firma, kunde_vorname, kunde_nachname, betrag_netto, betrag_brutto, kategorie, status, notiz, vorgeschlagener_seminartermin_id, vorgeschlagene_option_id, seminartermin_id, seminartermin_option_id, teilnehmer_id, buchung_id, seminartermine!fastbill_rechnungen_seminartermin_id_fkey(kennung, titel), seminartermin_optionen!fastbill_rechnungen_seminartermin_option_id_fkey(titel), teilnehmer(vorname, nachname, email)"
    )
    .order("rechnungsdatum", { ascending: false });

  const { data: alleTermine } = await supabase
    .from("seminartermine")
    .select("id, kennung, titel, datum_start, datum_ende, seminartypen(name)")
    .order("datum_start", { ascending: true });

  const { data: alleOptionen } = await supabase
    .from("seminartermin_optionen")
    .select("id, seminartermin_id, titel, preisstaffeln(preis)");

  const { data: alleTeilnehmer } = await supabase.from("teilnehmer").select("id, vorname, nachname, email");

  const rows = rechnungen || [];

  // Vorschlag aus dem Rechnungstext (lib/fastbill-parser.ts), pro Aufruf
  // berechnet -- nichts gespeichert, damit neue Termine/Optionen sofort zaehlen.
  const parserTermine: ParserTermin[] = (alleTermine || []).map((t: any) => ({
    id: t.id,
    kennung: t.kennung,
    titel: t.titel,
    typ: t.seminartypen?.name || null,
    datum_start: t.datum_start,
    datum_ende: t.datum_ende,
    optionen: (alleOptionen || [])
      .filter((o: any) => o.seminartermin_id === t.id)
      .map((o: any) => ({ id: o.id, titel: o.titel, preise: (o.preisstaffeln || []).map((p: any) => Number(p.preis)) })),
  }));
  const teilnehmerById = new Map((alleTeilnehmer || []).map((t: any) => [t.id, t]));
  const vorschlaege = new Map<string, RechnungsVorschlag>(
    rows.map((r: any) => [r.id, parseRechnung(r, parserTermine, alleTeilnehmer || [])])
  );

  // Eine FastBill-Rechnung kann mehrere Teilnehmer haben (Gesamtrechnung fuer
  // eine Gruppe) -- die eigentliche Teilnehmerliste steckt in den
  // Buchungspositionen der verknuepften Buchung, nicht in der einzelnen
  // teilnehmer_id-Spalte (die nur den ersten/Rechnungsempfaenger haelt).
  const buchungIds = Array.from(new Set(rows.map((r: any) => r.buchung_id).filter(Boolean)));
  const { data: alleBuchungspositionen } = buchungIds.length
    ? await supabase
        .from("buchungspositionen")
        .select("buchung_id, teilnehmer_id, seminartermin_option_id, teilnehmer(vorname, nachname, email)")
        .in("buchung_id", buchungIds)
    : { data: [] as any[] };

  const positionenByBuchung = new Map<string, any[]>();
  (alleBuchungspositionen || []).forEach((p: any) => {
    const liste = positionenByBuchung.get(p.buchung_id) || [];
    liste.push(p);
    positionenByBuchung.set(p.buchung_id, liste);
  });
  const gesamt = rows.length;
  const offen = rows.filter((r: any) => r.status === "offen").length;
  const zugeordnet = rows.filter((r: any) => r.status === "zugeordnet").length;
  const ignoriert = rows.filter((r: any) => r.status === "ignoriert").length;


  const statusReihenfolge: Record<string, number> = { offen: 0, zugeordnet: 1, ignoriert: 2 };
  const sortiert = [...rows]
    .filter((r: any) => filter === "alle" || r.status === filter)
    .sort((a: any, b: any) => statusReihenfolge[a.status] - statusReihenfolge[b.status]);
  const anzahlProFilter: Record<Filter, number> = { offen, zugeordnet, ignoriert, alle: gesamt };
  const erledigtZeile: any = erledigt ? rows.find((r: any) => r.id === erledigt && r.status === "zugeordnet") : null;

  return (
    <main>
      <h1>FastBill-Rechnungsabgleich</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Importiert Ausgangs-/Stornorechnungen eines Jahres aus FastBill und gleicht sie manuell gegen Teilnehmer
        und Seminartermine ab. Bei "Zuordnen" wird eine echte Buchung angelegt, damit der Teilnehmer auch in der
        Teilnehmerliste des Termins auftaucht. Ein erneuter Import ergänzt nur neue Rechnungen — bereits bearbeitete
        Zeilen bleiben unverändert.
      </p>

      {importiert !== undefined && (
        <div className="au-card au-card-tint" style={{ marginBottom: "1rem" }}>
          Import für {jahr}: {gefunden} Rechnungen von FastBill geladen, {importiert} davon neu
          gespeichert (Rest war schon vorhanden).
        </div>
      )}

      {erledigtZeile && (
        <div className="au-card au-card-tint" style={{ marginBottom: "1rem" }}>
          ✓ {erledigtZeile.fastbill_invoice_number} zugeordnet:{" "}
          {(positionenByBuchung.get(erledigtZeile.buchung_id) || [])
            .map((p: any) => (p.teilnehmer ? `${p.teilnehmer.vorname} ${p.teilnehmer.nachname}` : null))
            .filter(Boolean)
            .join(", ") || "—"}{" "}
          → {erledigtZeile.seminartermine?.kennung || erledigtZeile.seminartermine?.titel}
          {" · "}<Link href="/buchungen/fastbill?filter=zugeordnet">alle zugeordneten ansehen</Link>
        </div>
      )}

      {fehler && (
        <div className="au-card" style={{ marginBottom: "1rem", borderColor: "var(--color-danger, #c0392b)" }}>
          <strong>FastBill-Fehler:</strong> {decodeURIComponent(fehler)}
        </div>
      )}

      {debug && (
        <details className="au-card" style={{ marginBottom: "1rem" }}>
          <summary style={{ cursor: "pointer" }}>Diagnose (Rohantworten der ersten Aufrufe)</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75rem", marginTop: "0.5rem" }}>
            {decodeURIComponent(debug).split(" ||| ").join("\n\n")}
          </pre>
        </details>
      )}

      <div className="au-card" style={{ display: "flex", gap: "2rem", alignItems: "center", flexWrap: "wrap" }}>
        <div><strong>{gesamt}</strong> Rechnungen gesamt</div>
        <div><strong>{offen}</strong> offen</div>
        <div><strong>{zugeordnet}</strong> zugeordnet</div>
        <div><strong>{ignoriert}</strong> ignoriert</div>

        <form action={importFastbillRechnungen} style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
          <input
            className="au-input"
            type="number"
            name="jahr"
            defaultValue={new Date().getFullYear()}
            style={{ width: 100 }}
          />
          <button type="submit" className="au-btn au-btn-primary">
            Rechnungen importieren
          </button>
        </form>
      </div>

      <nav className="au-seitentabs" aria-label="Rechnungen filtern" style={{ marginTop: "1rem" }}>
        {FILTER.map((f) => (
          <Link key={f} href={`/buchungen/fastbill?filter=${f}`} className={f === filter ? "aktiv" : ""} aria-current={f === filter ? "page" : undefined}>
            {f === "offen" ? "Offen" : f === "zugeordnet" ? "Zugeordnet" : f === "ignoriert" ? "Ignoriert" : "Alle"} ({anzahlProFilter[f]})
          </Link>
        ))}
      </nav>

      <table className="au-table" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Rechnung</th>
            <th>Kunde</th>
            <th>Betrag</th>
            <th>Kategorie</th>
            <th>Zuordnung</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {sortiert.length === 0 && (
            <tr className="au-table-empty">
              <td colSpan={6}>{gesamt === 0 ? "Noch keine Rechnungen importiert." : filter === "offen" ? "Alles abgeglichen — keine offenen Rechnungen." : "Keine Rechnungen in dieser Ansicht."}</td>
            </tr>
          )}
          {sortiert.map((r: any, idx: number) => {
            const vorherige = sortiert[idx - 1];
            const istErsteIgnorierte = filter === "alle" && r.status === "ignoriert" && vorherige?.status !== "ignoriert";
            const v = vorschlaege.get(r.id)!;
            const ersterTn: any = v.teilnehmerId ? teilnehmerById.get(v.teilnehmerId) : null;
            // Formular-Vorbelegung: so viele Zeilen wie Personen, erste Person = Rechnungsempfaenger
            const vorschlagPositionen = v.terminId
              ? Array.from({ length: Math.min(4, v.anzahl) }).map((_, i) => ({
                  teilnehmerId: i === 0 && ersterTn ? ersterTn.id : "",
                  optionId: v.optionId,
                  vorname: i === 0 && ersterTn ? ersterTn.vorname : null,
                  nachname: i === 0 && ersterTn ? ersterTn.nachname : null,
                  email: i === 0 && ersterTn ? ersterTn.email : null,
                }))
              : [];
            const abweichung = r.status === "zugeordnet" && v.terminId && v.terminId !== r.seminartermin_id;
            return (
            <>
            {istErsteIgnorierte && (
              <tr>
                <td colSpan={6} style={{ paddingTop: "1.25rem", borderTop: "2px solid var(--color-border)" }}>
                  <strong style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    Ignoriert ({ignoriert}) — zum späteren Nachschauen, jederzeit über "Zurück auf offen" reaktivierbar
                  </strong>
                </td>
              </tr>
            )}
            <tr key={r.id}>
              <td>
                {r.fastbill_invoice_number}
                <br />
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>{r.rechnungsdatum}</span>
                {r.ist_storno && (
                  <>
                    <br />
                    <span className="au-badge au-badge-danger">Storno</span>
                  </>
                )}
              </td>
              <td>
                {r.kunde_firma && <div>{r.kunde_firma}</div>}
                <div>
                  {r.kunde_vorname} {r.kunde_nachname}
                </div>
                {/* Rechnungstext aus dem Import -- vorher musste man fuer jede
                    Zuordnung in FastBill nachsehen, was genau berechnet wurde. */}
                {Array.isArray(r.positionen) && r.positionen.length > 0 && (
                  <details className="au-rechnungstext">
                    <summary>Rechnungstext ({r.positionen.length} {r.positionen.length === 1 ? "Position" : "Positionen"})</summary>
                    <ol>
                      {r.positionen.map((pos: any, i: number) => (
                        <li key={i}>
                          <div className="au-rechnungstext-beschreibung">{String(pos.description || "—").trim()}</div>
                          <div className="au-klein">
                            {Number(pos.quantity || 1)} × {formatEUR(Number(pos.unitPrice || 0))} = <strong>{formatEUR(Number(pos.completeNet || 0))}</strong> netto
                          </div>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </td>
              <td>
                {formatEUR(Number(r.betrag_netto))} netto
                <br />
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                  {formatEUR(Number(r.betrag_brutto))} brutto
                </span>
              </td>
              <td>
                <form action={setzeFastbillKategorie} style={{ display: "flex", gap: "0.3rem" }}>
                  <input type="hidden" name="id" value={r.id} />
                  <select className="au-select" name="kategorie" defaultValue={r.kategorie}>
                    <option value="seminar">Seminar</option>
                    <option value="projekt">Projekt</option>
                    <option value="unklar">Unklar</option>
                  </select>
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">
                    Setzen
                  </button>
                </form>
              </td>
              <td>
                {r.status === "zugeordnet" ? (
                  <div>
                    <span className="au-badge au-badge-success">
                      {r.seminartermine?.kennung || r.seminartermine?.titel}
                    </span>
                    <br />
                    {r.seminartermin_optionen?.titel}
                    <br />
                    {(positionenByBuchung.get(r.buchung_id) || []).length > 0
                      ? (positionenByBuchung.get(r.buchung_id) || [])
                          .map((p: any) => (p.teilnehmer ? `${p.teilnehmer.vorname} ${p.teilnehmer.nachname}` : null))
                          .filter(Boolean)
                          .join(", ")
                      : r.teilnehmer
                      ? `${r.teilnehmer.vorname} ${r.teilnehmer.nachname}`
                      : "—"}
                    {abweichung && (
                      <div className="au-fb-vorschlag warnung">
                        Rechnungstext nennt <strong>{v.terminText}</strong> – bitte prüfen (nach bewusster Umbuchung ok)
                      </div>
                    )}
                  </div>
                ) : r.status === "ignoriert" ? (
                  <span style={{ color: "var(--color-text-muted)" }}>ignoriert</span>
                ) : (
                  <VorschlagAnzeige v={v} />
                )}
              </td>
              <td>
                {r.status !== "ignoriert" && r.status !== "zugeordnet" && (
                  <FastbillZuordnenForm
                    rechnungId={r.id}
                    termine={alleTermine || []}
                    optionen={alleOptionen || []}
                    teilnehmer={alleTeilnehmer || []}
                    defaultSeminarterminId={v.terminId || r.vorgeschlagener_seminartermin_id}
                    defaultOptionId={v.optionId || r.vorgeschlagene_option_id}
                    defaultPositionen={vorschlagPositionen}
                    neuVorschlag={!ersterTn && r.kunde_vorname && r.kunde_nachname ? { vorname: r.kunde_vorname, nachname: r.kunde_nachname } : undefined}
                  />
                )}
                {r.status === "zugeordnet" && (
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "0.8rem" }}>Bearbeiten / Teilnehmer ergänzen</summary>
                    <div style={{ marginTop: "0.5rem" }}>
                      <FastbillZuordnenForm
                        rechnungId={r.id}
                        termine={alleTermine || []}
                        optionen={alleOptionen || []}
                        teilnehmer={alleTeilnehmer || []}
                        defaultSeminarterminId={r.seminartermin_id}
                        defaultOptionId={r.seminartermin_option_id}
                        defaultPositionen={(positionenByBuchung.get(r.buchung_id) || []).map((p: any) => ({
                          teilnehmerId: p.teilnehmer_id,
                          optionId: p.seminartermin_option_id,
                          vorname: p.teilnehmer?.vorname,
                          nachname: p.teilnehmer?.nachname,
                          email: p.teilnehmer?.email,
                        }))}
                      />
                    </div>
                  </details>
                )}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  {r.status !== "ignoriert" ? (
                    <form action={ignoriereFastbillRechnung}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="au-btn au-btn-secondary au-btn-sm">
                        Ignorieren
                      </button>
                    </form>
                  ) : (
                    <form action={setzeFastbillOffen}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="au-btn au-btn-secondary au-btn-sm">
                        Zurück auf offen
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
            </>
          );})}
        </tbody>
      </table>
    </main>
  );
}

function VorschlagAnzeige({ v }: { v: RechnungsVorschlag }) {
  if (v.art === "buch" || v.art === "projekt") {
    return (
      <div className="au-fb-vorschlag">
        <strong>{v.art === "buch" ? "Buch" : "Beratung/Projekt"}</strong> – {v.gruende[0]}
        <div className="au-klein">{v.art === "buch" ? "Vorschlag: Ignorieren" : "Vorschlag: Kategorie „Projekt“"}</div>
      </div>
    );
  }
  if (v.art === "unbekannt") return <span style={{ color: "var(--color-text-muted)" }}>kein Vorschlag — manuell wählen</span>;
  return (
    <div className="au-fb-vorschlag">
      <div>
        Vorschlag: <strong>{v.terminText || "Termin offen"}</strong>
        {v.optionTitel && <> · {v.optionTitel}</>}
        {v.anzahl > 1 && <> · {v.anzahl} Personen</>}
      </div>
      {v.gruende.length > 0 && <div className="au-klein">{v.gruende.join(" · ")}</div>}
      {v.warnungen.map((w, i) => (
        <div key={i} className="au-fb-warnung">{w}</div>
      ))}
      {v.terminId && <div className="au-klein">Rechts im Formular vorausgefüllt – prüfen und übernehmen.</div>}
    </div>
  );
}
