export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { ladeHotelliste } from "@/lib/hotelliste";
import ZimmerKontingent from "../ZimmerKontingent";

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
        {" "}· {zeilen.length} Personen ({anzahl("Referent")} Referent · {anzahl("Mitarbeiter")} Mitarbeiter · {anzahl("Teilnehmer")} Teilnehmer)
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
        <table className="au-table">
          <thead>
            <tr>
              <th>Vorname</th>
              <th>Nachname</th>
              <th>Typ</th>
              <th>Option / Rolle</th>
              <th>Zimmer</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.schluessel}>
                <td>{z.vorname}</td>
                <td>{z.nachname}</td>
                <td>{z.typ}</td>
                <td>{z.info || "—"}</td>
                <td>{z.zimmerpartner ? `teilt mit ${z.zimmerpartner}` : "—"}</td>
              </tr>
            ))}
            {!zeilen.length && (
              <tr className="au-table-empty"><td colSpan={5}>Noch keine Personen für diesen Termin.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
