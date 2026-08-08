export const dynamic = "force-dynamic";

import Link from "next/link";
import { kampagneVersandJetzt, loescheKampagnenEntwurf } from "@/lib/actions";
import { ermittleKampagnenEmpfaenger } from "@/lib/kampagnen";
import BestaetigenButton from "./BestaetigenButton";

export default async function KampagnenVorschauPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { kampagne, empfaenger } = await ermittleKampagnenEmpfaenger(id);

  if (kampagne.status === "versendet") {
    return (
      <main>
        <h1>Vorschau: {kampagne.name}</h1>
        <div className="au-card">
          <p style={{ marginTop: 0 }}>Diese Kampagne wurde bereits versendet.</p>
          <Link href="/kampagnen" className="au-btn au-btn-secondary">← Zurück zu Kampagnen</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Vorschau: {kampagne.name}</h1>
      <p>
        Das hier würde jetzt tatsächlich verschickt werden, wenn du bestätigst. Der Filter wurde gerade eben live
        gegen den aktuellen Teilnehmerbestand ausgewertet.
      </p>

      <div className="au-card au-card-tint">
        <strong>{empfaenger.length}</strong> E-Mail(s) sind jetzt fällig.
      </div>

      {empfaenger.length === 0 && (
        <div className="au-card">
          <p style={{ marginTop: 0 }}>Aktuell gibt es keine passenden Empfänger:innen mehr. Nichts zu verschicken.</p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link href="/kampagnen" className="au-btn au-btn-secondary">← Zurück zu Kampagnen</Link>
            <form action={loescheKampagnenEntwurf}>
              <input type="hidden" name="id" value={kampagne.id} />
              <button type="submit" className="au-btn au-btn-danger au-btn-sm">Entwurf löschen</button>
            </form>
          </div>
        </div>
      )}

      {empfaenger.length > 0 && (
        <>
          <div className="au-card">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Empfänger</th>
                  <th>Betreff</th>
                  <th>Inhalt (Vorschau)</th>
                </tr>
              </thead>
              <tbody>
                {empfaenger.map((e) => (
                  <tr key={e.id}>
                    <td>{e.vorname} {e.nachname} — {e.email}</td>
                    <td>{e.betreff}</td>
                    <td style={{ maxWidth: 420 }}>
                      <details>
                        <summary style={{ color: "#102A4C", fontSize: "0.85rem", fontWeight: 600 }}>Anzeigen</summary>
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

          <div className="au-card" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/kampagnen" className="au-btn au-btn-secondary">Abbrechen</Link>
            <form action={loescheKampagnenEntwurf}>
              <input type="hidden" name="id" value={kampagne.id} />
              <button type="submit" className="au-btn au-btn-danger au-btn-sm">Entwurf löschen</button>
            </form>
            <form action={kampagneVersandJetzt}>
              <input type="hidden" name="id" value={kampagne.id} />
              <BestaetigenButton anzahl={empfaenger.length} />
            </form>
          </div>
        </>
      )}
    </main>
  );
}
