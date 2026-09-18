export const dynamic = "force-dynamic";

import Link from "next/link";
import { kampagneVersandJetzt, loescheKampagnenEntwurf, setzeKampagnenMindestabstand } from "@/lib/actions";
import { ermittleKampagnenEmpfaenger } from "@/lib/kampagnen";
import BestaetigenButton from "./BestaetigenButton";

export default async function KampagnenVorschauPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { kampagne, empfaenger } = await ermittleKampagnenEmpfaenger(id);
  const inSperrfrist = empfaenger.filter((e) => e.inSperrfrist).length;
  const tagMonat = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

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

      <div className="au-card au-card-tint au-sperrfrist-kopf">
        <div>
          <strong>{empfaenger.length} Empfänger:innen</strong>
          {inSperrfrist > 0 ? (
            <>, davon <strong>{inSperrfrist} innerhalb der Sperrfrist</strong></>
          ) : kampagne.mindestabstand_tage > 0 ? (
            <>, niemand innerhalb der Sperrfrist</>
          ) : null}
          <div className="au-klein">
            {kampagne.mindestabstand_tage > 0
              ? `Sperrfrist: ${kampagne.mindestabstand_tage} Tage seit der letzten Funnel- oder Kampagnen-Mail`
              : "Keine Sperrfrist (Mindestabstand 0)"}
          </div>
        </div>
        <form action={setzeKampagnenMindestabstand} className="au-sperrfrist-form">
          <input type="hidden" name="id" value={kampagne.id} />
          <label className="au-klein" htmlFor="mindestabstand_tage">Mindestabstand (Tage)</label>
          <input className="au-input" id="mindestabstand_tage" name="mindestabstand_tage" type="number" min={0} max={90} defaultValue={kampagne.mindestabstand_tage} />
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Übernehmen</button>
        </form>
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
                  <tr key={e.id} className={e.inSperrfrist ? "au-zeile-sperrfrist" : undefined}>
                    <td>
                      {e.vorname} {e.nachname} — {e.email}
                      {e.vermutlichRuhend && (
                        <div>
                          <span className="au-badge au-badge-neutral" title="Grobe Heuristik: letzte Mail über 180 Tage her oder nie – nur zur Orientierung">vermutlich ruhend</span>
                        </div>
                      )}
                      {e.inSperrfrist && (
                        <div>
                          <span className="au-badge au-badge-warning">innerhalb Sperrfrist, zuletzt am {tagMonat(e.letzteMarketingMailAm!)}</span>
                        </div>
                      )}
                    </td>
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

          <div className="au-card" style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/kampagnen" className="au-btn au-btn-secondary">Abbrechen</Link>
            <form action={loescheKampagnenEntwurf}>
              <input type="hidden" name="id" value={kampagne.id} />
              <button type="submit" className="au-btn au-btn-danger au-btn-sm">Entwurf löschen</button>
            </form>
            <form action={kampagneVersandJetzt}>
              <input type="hidden" name="id" value={kampagne.id} />
              <BestaetigenButton anzahl={empfaenger.length} inSperrfrist={inSperrfrist} />
            </form>
          </div>
        </>
      )}
    </main>
  );
}
