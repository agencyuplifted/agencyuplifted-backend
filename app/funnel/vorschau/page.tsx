export const dynamic = "force-dynamic";

import Link from "next/link";
import { funnelVersandJetzt } from "@/lib/actions";
import { ermittleFaelligeVorschau } from "@/lib/funnel";
import BestaetigenButton from "./BestaetigenButton";

const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };
const btnSecondary: React.CSSProperties = { background: "transparent", color: "#102A4C", border: "1px solid #102A4C", padding: "0.55rem 1rem", cursor: "pointer", fontSize: "0.9rem", textDecoration: "none", display: "inline-block" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = { padding: "0.4rem", textAlign: "left", borderBottom: "1px solid #ccc" };
const td: React.CSSProperties = { padding: "0.5rem 0.4rem", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };

export default async function FunnelVorschauPage() {
  const { eintraege, uebersprungen, geprueft } = await ermittleFaelligeVorschau();

  return (
    <main>
      <h1>Vorschau: Fälliger Funnel-Versand</h1>
      <p style={{ color: "#666" }}>
        Das hier würde jetzt tatsächlich verschickt werden, wenn du bestätigst. Bereits einmal verschickte
        Mails an dieselbe Person zum selben Anlass sind hier nicht mehr aufgeführt (Dopplungsschutz).
      </p>

      <div style={{ ...card, background: "#f7f9fc" }}>
        {geprueft} aktive Funnel-Mail(s) geprüft — <strong>{eintraege.length}</strong> E-Mail(s) sind jetzt fällig,{" "}
        {uebersprungen} bereits zuvor verschickt (werden übersprungen).
      </div>

      {eintraege.length === 0 && (
        <div style={card}>
          <p>Aktuell ist nichts fällig. Nichts zu verschicken.</p>
          <Link href="/funnel" style={btnSecondary}>← Zurück zu Funnel-Mails</Link>
        </div>
      )}

      {eintraege.length > 0 && (
        <>
          <div style={card}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Funnel-Mail</th>
                  <th style={th}>Empfänger</th>
                  <th style={th}>Betreff</th>
                  <th style={th}>Inhalt (Vorschau)</th>
                </tr>
              </thead>
              <tbody>
                {eintraege.map((e, i) => (
                  <tr key={i}>
                    <td style={td}>{e.funnelName}</td>
                    <td style={td}>{e.empfaengerEmail}</td>
                    <td style={td}>{e.betreff}</td>
                    <td style={{ ...td, maxWidth: 420 }}>
                      <details>
                        <summary style={{ cursor: "pointer", color: "#102A4C", fontSize: "0.85rem" }}>
                          Anzeigen
                        </summary>
                        <div
                          style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "#333" }}
                          dangerouslySetInnerHTML={{ __html: e.inhaltHtml }}
                        />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ ...card, display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link href="/funnel" style={btnSecondary}>Abbrechen</Link>
            <form action={funnelVersandJetzt}>
              <BestaetigenButton anzahl={eintraege.length} />
            </form>
          </div>
        </>
      )}
    </main>
  );
}
