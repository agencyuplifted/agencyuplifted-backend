export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { ladeHotelliste } from "@/lib/hotelliste";
import ZimmerKontingent from "../ZimmerKontingent";

const GRUPPEN = [
  { typ: "Teilnehmer", titel: "Teilnehmer", infoSpalte: "Option" },
  { typ: "Mitarbeiter", titel: "Mitarbeiter", infoSpalte: "Rolle" },
  { typ: "Referent", titel: "Referenten", infoSpalte: null },
] as const;

export default async function TeilnehmerlistePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [{ data: termin }, liste] = await Promise.all([
    supabase.from("seminartermine").select("*, seminartypen(name)").eq("id", id).single(),
    ladeHotelliste(supabase, id),
  ]);

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const { zeilen } = liste;
  const anzahl = (typ: string) => zeilen.filter((z) => z.typ === typ).length;
  const copyText = zeilen.map((z) => `${z.vorname}; ${z.nachname}`).join("\n");
  const titelAnzeige = termin.titel || termin.seminartypen?.name;

  return (
    <main>
      <p><Link href={`/termine/${id}`}>← Zurück zum Termin</Link></p>
      <h1>Teilnehmerliste für Hotel</h1>
      <p>
        {titelAnzeige} · {formatDatum(termin.datum_start)}
        {termin.datum_ende && termin.datum_ende !== termin.datum_start ? ` – ${formatDatum(termin.datum_ende)}` : ""}
        {" "}· {zeilen.length} Personen ({anzahl("Teilnehmer")} Teilnehmer · {anzahl("Mitarbeiter")} Mitarbeiter · {anzahl("Referent")} Referent)
      </p>

      <ZimmerKontingent terminId={id} liste={liste} />

      <div className="au-card">
        <h2>Zum Kopieren</h2>
        <p style={{ fontSize: "0.85rem", marginTop: 0 }}>
          Format „Vorname; Nachname", eine Person pro Zeile — Feld anklicken, alles markieren (Strg/Cmd+A) und kopieren.
        </p>
        <textarea
          readOnly
          value={copyText}
          rows={Math.max(zeilen.length, 3) + 1}
          className="au-textarea"
          style={{ fontFamily: "monospace", minHeight: "auto" }}
        />
      </div>

      <div className="au-card">
        <h2>Übersicht</h2>
        {!zeilen.length && <p className="au-leer">Noch keine Personen für diesen Termin.</p>}
        {GRUPPEN.map(({ typ, titel, infoSpalte }) => {
          const gruppe = zeilen.filter((z) => z.typ === typ);
          if (!gruppe.length) return null;
          return (
            <div key={typ} style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ margin: "0 0 0.5rem" }}>{titel} · {gruppe.length}</h3>
              <table className="au-table">
                <thead>
                  <tr>
                    <th>Vorname</th>
                    <th>Nachname</th>
                    {infoSpalte && <th>{infoSpalte}</th>}
                    <th>Zimmer</th>
                  </tr>
                </thead>
                <tbody>
                  {gruppe.map((z) => (
                    <tr key={z.schluessel}>
                      <td>{z.vorname}</td>
                      <td>{z.nachname}</td>
                      {infoSpalte && <td>{z.info || "—"}</td>}
                      <td>{z.zimmerpartner ? `teilt mit ${z.zimmerpartner}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </main>
  );
}
