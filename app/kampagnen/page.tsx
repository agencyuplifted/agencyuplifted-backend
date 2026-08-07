export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatumZeit } from "@/lib/format";
import { loescheKampagnenEntwurf } from "@/lib/actions";

export default async function KampagnenPage({
  searchParams,
}: {
  searchParams: Promise<{ versendet?: string; gesendet?: string; fehler?: string }>;
}) {
  const { versendet, gesendet, fehler } = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: kampagnen } = await supabase.from("kampagnen").select("*").order("erstellt_am", { ascending: false });
  const { data: logZeilen } = await supabase
    .from("kampagnen_versand_log")
    .select("kampagne_id, status, geoeffnet_am, geklickt_am");

  const statsProKampagne = new Map<string, { gesendet: number; fehler: number; geoeffnet: number; geklickt: number }>();
  (logZeilen || []).forEach((z: any) => {
    const s = statsProKampagne.get(z.kampagne_id) || { gesendet: 0, fehler: 0, geoeffnet: 0, geklickt: 0 };
    if (z.status === "gesendet") s.gesendet++;
    if (z.status === "fehler") s.fehler++;
    if (z.geoeffnet_am) s.geoeffnet++;
    if (z.geklickt_am) s.geklickt++;
    statsProKampagne.set(z.kampagne_id, s);
  });

  const entwuerfe = (kampagnen || []).filter((k: any) => k.status === "entwurf");
  const versendetListe = (kampagnen || []).filter((k: any) => k.status === "versendet");

  return (
    <main>
      <h1>Kampagnen</h1>
      <p>
        Gezielter E-Mail-Versand an eine gefilterte Teilnehmer-Auswahl (z. B. „Arbeitsgruppe Unternehmerinnen“) —
        getrennt von den automatischen Funnel-Mails. Filter, Filtergruppen speichern und Kampagne starten geht auch
        direkt von der{" "}
        <Link href="/teilnehmer" style={{ color: "#102A4C", fontWeight: 600 }}>Teilnehmerliste</Link> aus.
      </p>

      {versendet && (
        <div className="au-banner au-banner-success">
          Kampagne versendet: {gesendet} E-Mail(s) verschickt, {fehler} Fehler.
        </div>
      )}

      <div className="au-card">
        <Link href="/kampagnen/neu" className="au-btn au-btn-primary">Neue Kampagne</Link>
      </div>

      <div className="au-card">
        <h2>Entwürfe ({entwuerfe.length})</h2>
        {entwuerfe.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Keine offenen Entwürfe.</p>}
        {entwuerfe.map((k: any) => (
          <div key={k.id} className="au-subcard" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <div>
              <strong>{k.name}</strong>
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>{k.betreff}</div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Link href={`/kampagnen/${k.id}/vorschau`} className="au-btn au-btn-secondary au-btn-sm">Vorschau &amp; Versand</Link>
              <form action={loescheKampagnenEntwurf}>
                <input type="hidden" name="id" value={k.id} />
                <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <div className="au-card">
        <h2>Versendet ({versendetListe.length})</h2>
        {versendetListe.length === 0 && <p style={{ color: "var(--color-text-muted)" }}>Noch keine Kampagne versendet.</p>}
        {versendetListe.length > 0 && (
          <table className="au-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Betreff</th>
                <th>Versendet am</th>
                <th>Gesendet</th>
                <th>Geöffnet</th>
                <th>Geklickt</th>
                <th>Fehler</th>
              </tr>
            </thead>
            <tbody>
              {versendetListe.map((k: any) => {
                const s = statsProKampagne.get(k.id) || { gesendet: 0, fehler: 0, geoeffnet: 0, geklickt: 0 };
                return (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td>{k.betreff}</td>
                    <td>{k.versendet_am ? formatDatumZeit(k.versendet_am) : "—"}</td>
                    <td>{s.gesendet}</td>
                    <td>{s.geoeffnet}</td>
                    <td>{s.geklickt}</td>
                    <td>{s.fehler || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
