export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, splitName } from "@/lib/format";

const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };

type Zeile = { vorname: string; nachname: string; typ: "Teilnehmer" | "Mitarbeiter"; info: string };

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
    .select("teilnehmer(vorname, nachname), buchungen(status), seminartermin_optionen(titel)")
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
      vorname: p.teilnehmer.vorname,
      nachname: p.teilnehmer.nachname,
      typ: "Teilnehmer",
      info: p.seminartermin_optionen?.titel || "",
    });
  });

  (terminMitarbeiter || []).forEach((tm: any) => {
    if (!tm.mitarbeiter?.name) return;
    const { vorname, nachname } = splitName(tm.mitarbeiter.name);
    zeilen.push({ vorname, nachname, typ: "Mitarbeiter", info: tm.rolle || "" });
  });

  zeilen.sort((a, b) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de"));

  const copyText = zeilen.map((z) => `${z.vorname}; ${z.nachname}`).join("\n");
  const titelAnzeige = termin.titel || termin.seminartypen?.name;

  return (
    <main>
      <p><Link href={`/termine/${id}`} style={{ color: "#102A4C" }}>← Zurück zum Termin</Link></p>
      <h1>Teilnehmerliste für Hotel</h1>
      <p style={{ color: "#666" }}>
        {titelAnzeige} · {formatDatum(termin.datum_start)}
        {termin.datum_ende && termin.datum_ende !== termin.datum_start ? ` – ${formatDatum(termin.datum_ende)}` : ""}
        {" "}· {zeilen.length} Personen (Teilnehmer + Mitarbeiter — alle benötigen ein Zimmer)
      </p>

      <div style={card}>
        <h2>Zum Kopieren</h2>
        <p style={{ color: "#666", fontSize: "0.85rem", marginTop: 0 }}>
          Format „Vorname; Nachname", eine Person pro Zeile — Feld anklicken, alles markieren (Strg/Cmd+A) und kopieren.
        </p>
        <textarea
          readOnly
          value={copyText}
          rows={Math.max(zeilen.length, 3) + 1}
          style={{ width: "100%", padding: "0.75rem", fontFamily: "monospace", fontSize: "0.9rem" }}
        />
      </div>

      <div style={card}>
        <h2>Übersicht</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "0.4rem" }}>Vorname</th>
              <th style={{ padding: "0.4rem" }}>Nachname</th>
              <th style={{ padding: "0.4rem" }}>Typ</th>
              <th style={{ padding: "0.4rem" }}>Option / Rolle</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem" }}>{z.vorname}</td>
                <td style={{ padding: "0.4rem" }}>{z.nachname}</td>
                <td style={{ padding: "0.4rem" }}>{z.typ}</td>
                <td style={{ padding: "0.4rem", color: "#666" }}>{z.info || "—"}</td>
              </tr>
            ))}
            {!zeilen.length && (
              <tr><td colSpan={4} style={{ padding: "0.4rem", color: "#888" }}>Noch keine Teilnehmer oder Mitarbeiter für diesen Termin.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
