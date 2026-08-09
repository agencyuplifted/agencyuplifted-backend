export const dynamic = "force-dynamic";

import Link from "next/link";
import { funnelVersandJetzt } from "@/lib/actions";
import { ermittleFaelligeVorschau } from "@/lib/funnel";
import BestaetigenButton from "./BestaetigenButton";

export default async function FunnelVorschauPage() {
  const { eintraege, uebersprungen, geprueft } = await ermittleFaelligeVorschau();

  return (
    <main>
      <h1>Vorschau: Fälliger Funnel-Versand</h1>
      <p>
        Das hier würde jetzt tatsächlich verschickt werden, wenn du bestätigst. Bereits einmal verschickte
        Mails an dieselbe Person zum selben Anlass sind hier nicht mehr aufgeführt (Dopplungsschutz).
      </p>

      <div className="au-card au-card-tint">
        {geprueft} aktive Funnel-Mail(s) geprüft — <strong>{eintraege.length}</strong> E-Mail(s) sind jetzt fällig,{" "}
        {uebersprungen} bereits zuvor verschickt (werden übersprungen).
      </div>

      {eintraege.length === 0 && (
        <div className="au-card">
          <p style={{ marginTop: 0 }}>Aktuell ist nichts fällig. Nichts zu verschicken.</p>
          <Link href="/funnel" className="au-btn au-btn-secondary">← Zurück zu Funnel-Mails</Link>
        </div>
      )}

      {eintraege.length > 0 && (
        <>
          <div className="au-card">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Funnel-Mail</th>
                  <th>Empfänger</th>
                  <th>Betreff</th>
                  <th>Inhalt (Vorschau)</th>
                </tr>
              </thead>
              <tbody>
                {eintraege.map((e, i) => (
                  <tr key={i}>
                    <td>{e.funnelName}</td>
                    <td>{e.empfaengerEmail}</td>
                    <td>{e.betreff}</td>
                    <td style={{ maxWidth: 420 }}>
                      <details>
                        <summary style={{ color: "#0B1B33", fontSize: "0.85rem", fontWeight: 600 }}>Anzeigen</summary>
                        <div
                          style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: "var(--color-text)" }}
                          dangerouslySetInnerHTML={{ __html: e.inhaltHtml }}
                        />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="au-card" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <Link href="/funnel" className="au-btn au-btn-secondary">Abbrechen</Link>
            <form action={funnelVersandJetzt}>
              <BestaetigenButton anzahl={eintraege.length} />
            </form>
          </div>
        </>
      )}
    </main>
  );
}
