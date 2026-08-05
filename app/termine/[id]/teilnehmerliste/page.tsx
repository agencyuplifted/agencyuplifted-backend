export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, splitName } from "@/lib/format";

type Zeile = { teilnehmerId: string | null; vorname: string; nachname: string; typ: "Teilnehmer" | "Mitarbeiter"; info: string; zimmerpartner: string | null };

export default async function TeilnehmerlistePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .eq("id", id)
    .single();

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("teilnehmer(id, vorname, nachname), buchungen(status), seminartermin_optionen(titel)")
    .eq("seminartermin_id", id);

  const { data: zimmerpartner } = await supabase
    .from("seminartermin_zimmerpartner")
    .select("teilnehmer_a:teilnehmer_id_a(id, vorname, nachname), teilnehmer_b:teilnehmer_id_b(id, vorname, nachname)")
    .eq("seminartermin_id", id);

  const { data: terminMitarbeiter } = await supabase
    .from("seminartermin_mitarbeiter")
    .select("rolle, mitarbeiter(name)")
    .eq("seminartermin_id", id);

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const zeilen: Zeile[] = [];

  (positionen || []).forEach((p: any) => {
    if (p.buchungen?.status === "storniert") return;
    if (!p.teilnehmer) return;
    zeilen.push({
      teilnehmerId: p.teilnehmer.id,
      vorname: p.teilnehmer.vorname,
      nachname: p.teilnehmer.nachname,
      typ: "Teilnehmer",
      info: p.seminartermin_optionen?.titel || "",
      zimmerpartner: null,
    });
  });

  (terminMitarbeiter || []).forEach((tm: any) => {
    if (!tm.mitarbeiter?.name) return;
    const { vorname, nachname } = splitName(tm.mitarbeiter.name);
    zeilen.push({ teilnehmerId: null, vorname, nachname, typ: "Mitarbeiter", info: tm.rolle || "", zimmerpartner: null });
  });

  const partnerName = new Map<string, string>();
  (zimmerpartner || []).forEach((z: any) => {
    if (!z.teilnehmer_a || !z.teilnehmer_b) return;
    partnerName.set(z.teilnehmer_a.id, `${z.teilnehmer_b.vorname} ${z.teilnehmer_b.nachname}`);
    partnerName.set(z.teilnehmer_b.id, `${z.teilnehmer_a.vorname} ${z.teilnehmer_a.nachname}`);
  });
  zeilen.forEach((z) => {
    if (z.teilnehmerId && partnerName.has(z.teilnehmerId)) {
      z.zimmerpartner = partnerName.get(z.teilnehmerId)!;
    }
  });
  const anzahlZimmer = zeilen.length - (zimmerpartner?.length || 0);

  zeilen.sort((a, b) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"));

  const copyText = zeilen.map((z) => `${z.vorname}; ${z.nachname}`).join("\n");
  const titelAnzeige = termin.titel || termin.seminartypen?.name;

  return (
    <main>
      <p><Link href={`/termine/${id}`}>← Zurück zum Termin</Link></p>
      <h1>Teilnehmerliste für Hotel</h1>
      <p>
        {titelAnzeige} · {formatDatum(termin.datum_start)}
        {termin.datum_ende && termin.datum_ende !== termin.datum_start ? ` – ${formatDatum(termin.datum_ende)}` : ""}
        {" "}· {zeilen.length} Personen (Teilnehmer + Mitarbeiter) · {anzahlZimmer} Zimmer benötigt
        {(zimmerpartner?.length || 0) > 0 && <> ({zimmerpartner!.length} geteilt)</>}
      </p>

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
            {zeilen.map((z, i) => (
              <tr key={i}>
                <td>{z.vorname}</td>
                <td>{z.nachname}</td>
                <td>{z.typ}</td>
                <td>{z.info || "—"}</td>
                <td>{z.zimmerpartner ? `teilt mit ${z.zimmerpartner}` : "—"}</td>
              </tr>
            ))}
            {!zeilen.length && (
              <tr className="au-table-empty"><td colSpan={5}>Noch keine Teilnehmer oder Mitarbeiter für diesen Termin.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
