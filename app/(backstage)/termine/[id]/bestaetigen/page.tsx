export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { updateSeminartermin } from "@/lib/actions";
import { formatDatum, TERMIN_FELD_LABELS } from "@/lib/format";
import BestaetigenButton from "./BestaetigenButton";

const FELDER = Object.keys(TERMIN_FELD_LABELS);

function anzeige(feld: string, wert: string | undefined, ortName?: string | null, trainerName?: string | null): string {
  if (feld === "veranstaltungsort_id") return wert ? ortName || "—" : "—";
  if (feld === "trainer_id") return wert ? trainerName || "—" : "—";
  if (feld === "datum_start" || feld === "datum_ende" || feld === "vorabend_anreise_datum") {
    return wert ? formatDatum(wert) : "—";
  }
  if (!wert) return "—";
  return wert;
}

export default async function TerminBestaetigenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const neueWerte = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name), trainer(name)")
    .eq("id", id)
    .single();

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const { data: orte } = await supabase.from("veranstaltungsorte").select("id, name").order("name");
  const { data: trainerListe } = await supabase.from("trainer").select("id, name").order("name");

  const neuerOrtName = neueWerte.veranstaltungsort_id
    ? orte?.find((o) => o.id === neueWerte.veranstaltungsort_id)?.name
    : null;
  const neuerTrainerName = neueWerte.trainer_id
    ? trainerListe?.find((t) => t.id === neueWerte.trainer_id)?.name
    : null;

  const geaenderteFelder = FELDER.filter((feld) => {
    const alt = (termin as any)[feld] ?? "";
    const neu = neueWerte[feld] ?? "";
    // Zeit-Felder in der DB haben Sekunden (HH:MM:SS), das Formular nur HH:MM.
    const altNormalisiert = typeof alt === "string" && alt.length === 8 && alt.includes(":") ? alt.slice(0, 5) : alt;
    return String(altNormalisiert) !== String(neu);
  });

  return (
    <main>
      <h1>Termin-Änderung bestätigen</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        {termin.titel || termin.seminartypen?.name} — bitte prüfe die Änderungen sorgfältig, bevor du bestätigst.
        Erst nach der Bestätigung wird der Termin tatsächlich verändert.
      </p>

      {geaenderteFelder.length === 0 && (
        <div className="au-card">
          <p style={{ margin: 0 }}>Keine Änderungen erkannt — der Termin bleibt unverändert.</p>
          <div style={{ marginTop: "1rem" }}>
            <Link href={`/termine/${id}`} className="au-btn au-btn-secondary">← Zurück zum Termin</Link>
          </div>
        </div>
      )}

      {geaenderteFelder.length > 0 && (
        <>
          <div className="au-card">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Feld</th>
                  <th>Bisher</th>
                  <th>Neu</th>
                </tr>
              </thead>
              <tbody>
                {geaenderteFelder.map((feld) => {
                  const altWert = (termin as any)[feld];
                  const altAnzeige =
                    feld === "veranstaltungsort_id"
                      ? termin.veranstaltungsorte?.name || "—"
                      : feld === "trainer_id"
                      ? termin.trainer?.name || "—"
                      : anzeige(feld, altWert !== null && altWert !== undefined ? String(altWert) : undefined);
                  return (
                    <tr key={feld}>
                      <td>{TERMIN_FELD_LABELS[feld]}</td>
                      <td>{altAnzeige}</td>
                      <td>
                        <strong>{anzeige(feld, neueWerte[feld], neuerOrtName, neuerTrainerName)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="au-card" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link href={`/termine/${id}`} className="au-btn au-btn-secondary">Abbrechen</Link>
            <form action={updateSeminartermin}>
              <input type="hidden" name="seminartermin_id" value={id} />
              {Object.keys(neueWerte).map((key) =>
                key === "seminartermin_id" ? null : (
                  <input key={key} type="hidden" name={key} value={neueWerte[key] || ""} />
                )
              )}
              <BestaetigenButton anzahlFelder={geaenderteFelder.length} />
            </form>
          </div>
        </>
      )}
    </main>
  );
}
