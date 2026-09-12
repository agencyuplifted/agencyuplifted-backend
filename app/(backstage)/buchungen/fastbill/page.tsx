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

export default async function FastbillAbgleichPage({
  searchParams,
}: {
  searchParams: Promise<{ importiert?: string; gefunden?: string; jahr?: string; debug?: string; fehler?: string }>;
}) {
  const { importiert, gefunden, jahr, debug, fehler } = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: rechnungen } = await supabase
    .from("fastbill_rechnungen")
    .select(
      "id, fastbill_invoice_number, rechnungsdatum, ist_storno, kunde_firma, kunde_vorname, kunde_nachname, betrag_netto, betrag_brutto, kategorie, status, notiz, vorgeschlagener_seminartermin_id, vorgeschlagene_option_id, seminartermin_id, seminartermin_option_id, teilnehmer_id, buchung_id, seminartermine!fastbill_rechnungen_seminartermin_id_fkey(kennung, titel), seminartermin_optionen!fastbill_rechnungen_seminartermin_option_id_fkey(titel), teilnehmer(vorname, nachname, email)"
    )
    .order("rechnungsdatum", { ascending: false });

  const { data: alleTermine } = await supabase
    .from("seminartermine")
    .select("id, kennung, titel, datum_start")
    .order("datum_start", { ascending: true });

  const { data: alleOptionen } = await supabase
    .from("seminartermin_optionen")
    .select("id, seminartermin_id, titel");

  const { data: alleTeilnehmer } = await supabase.from("teilnehmer").select("id, vorname, nachname, email");

  const rows = rechnungen || [];

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
  const sortiert = [...rows].sort((a: any, b: any) => statusReihenfolge[a.status] - statusReihenfolge[b.status]);

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
              <td colSpan={6}>Noch keine Rechnungen importiert.</td>
            </tr>
          )}
          {sortiert.map((r: any) => (
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
                  </div>
                ) : r.status === "ignoriert" ? (
                  <span style={{ color: "var(--color-text-muted)" }}>ignoriert</span>
                ) : r.vorgeschlagener_seminartermin_id ? (
                  <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                    Vorschlag: Preis passt eindeutig zu einer Option (unten bestätigen)
                  </span>
                ) : (
                  <span style={{ color: "var(--color-text-muted)" }}>kein Vorschlag — manuell wählen</span>
                )}
              </td>
              <td>
                {r.status !== "ignoriert" && r.status !== "zugeordnet" && (
                  <FastbillZuordnenForm
                    rechnungId={r.id}
                    termine={alleTermine || []}
                    optionen={alleOptionen || []}
                    teilnehmer={alleTeilnehmer || []}
                    defaultSeminarterminId={r.vorgeschlagener_seminartermin_id}
                    defaultOptionId={r.vorgeschlagene_option_id}
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
          ))}
        </tbody>
      </table>
    </main>
  );
}
