export const dynamic = "force-dynamic";
// Der Versand (Server Action auf dieser Seite) laeuft in Paketen und kann bei
// grossen Kampagnen laenger dauern als die Standard-Zeitgrenze.
export const maxDuration = 300;

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  kampagneVersandJetzt,
  loescheKampagnenEntwurf,
  setzeKampagnenMindestabstand,
  kampagneTestmail,
  kampagnePlanungAufheben,
  kampagneVersandFortsetzen,
} from "@/lib/actions";
import { ermittleKampagnenEmpfaenger } from "@/lib/kampagnen";
import { formatDatumZeit } from "@/lib/format";
import BestaetigenButton from "./BestaetigenButton";
import LinkChecker from "../../../LinkChecker";
import { ladeBausteine } from "@/lib/mail-bausteine";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function KampagnenVorschauPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ test?: string }>;
}) {
  const { id } = await params;
  const { test } = await searchParams;
  const [{ kampagne, empfaenger, gesperrt }, bausteine] = await Promise.all([ermittleKampagnenEmpfaenger(id), ladeBausteine(getSupabaseAdmin())]);
  if (kampagne.status === "versendet") redirect(`/kampagnen/${id}`);

  const inSperrfrist = empfaenger.filter((e) => e.inSperrfrist).length;
  const variantenB = empfaenger.filter((e) => e.variante === "B").length;
  const gesperrtSumme = gesperrt.abgemeldet + gesperrt.bounce + gesperrt.beschwerde;
  const tagMonat = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
  const beispiel = empfaenger[0];

  return (
    <main>
      <header className="au-dash-kopf">
        <div>
          <p className="au-dash-datum">
            <Link href="/kampagnen" className="au-panel-link">← Kampagnen</Link>
          </p>
          <h1>{kampagne.name}</h1>
          <p style={{ margin: 0 }}>So würde die Kampagne jetzt verschickt – der Filter wurde gerade live gegen den aktuellen Bestand ausgewertet.</p>
        </div>
        <ol className="au-schritte" aria-label="Ablauf">
          <li className="aktiv">1 · Empfänger</li>
          <li className="aktiv">2 · Inhalt</li>
          <li className="aktiv">3 · Vorschau &amp; Versand</li>
        </ol>
      </header>

      {test && <div className="au-banner au-banner-success">Test-Mail an {test} ist unterwegs{kampagne.betreff_b ? " (beide Betreff-Varianten)" : ""}.</div>}

      {kampagne.status === "geplant" && (
        <div className="au-banner au-banner-warning au-sperrfrist-kopf">
          <span>
            Geplant für <strong>{formatDatumZeit(kampagne.geplant_fuer!)}</strong>
            {kampagne.trotz_sperrfrist ? " – inklusive Empfänger in der Sperrfrist" : " – Empfänger in der Sperrfrist werden ausgelassen"}. Die Empfänger werden erst zum Versandzeitpunkt endgültig bestimmt.
          </span>
          <form action={kampagnePlanungAufheben}>
            <input type="hidden" name="id" value={kampagne.id} />
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Planung aufheben</button>
          </form>
        </div>
      )}
      {kampagne.status === "wird_versendet" && (
        <div className="au-banner au-banner-warning au-sperrfrist-kopf">
          <span>Der Versand wurde gestartet, aber nicht abgeschlossen (z. B. Abbruch). {empfaenger.length} Empfänger:innen fehlen noch – wer schon eine Mail hat, bekommt keine zweite.</span>
          <form action={kampagneVersandFortsetzen}>
            <input type="hidden" name="id" value={kampagne.id} />
            <button type="submit" className="au-btn au-btn-primary au-btn-sm">Versand fortsetzen</button>
          </form>
        </div>
      )}

      <div className="au-card au-card-tint au-sperrfrist-kopf">
        <div>
          <strong>{empfaenger.length} Empfänger:innen</strong>
          {inSperrfrist > 0 ? (
            <>, davon <strong>{inSperrfrist} innerhalb der Sperrfrist</strong></>
          ) : kampagne.mindestabstand_tage > 0 ? (
            <>, niemand innerhalb der Sperrfrist</>
          ) : null}
          <div className="au-klein">
            Nur Personen mit Marketing-Einwilligung („abonniert“).
            {gesperrtSumme > 0 &&
              ` Gesperrt und ausgelassen: ${[
                gesperrt.abgemeldet && `${gesperrt.abgemeldet} per Link abgemeldet`,
                gesperrt.bounce && `${gesperrt.bounce} Bounce`,
                gesperrt.beschwerde && `${gesperrt.beschwerde} Spam-Beschwerde`,
              ]
                .filter(Boolean)
                .join(", ")}.`}
          </div>
          <div className="au-klein">
            {kampagne.mindestabstand_tage > 0
              ? `Sperrfrist: ${kampagne.mindestabstand_tage} Tage seit der letzten Funnel- oder Kampagnen-Mail`
              : "Keine Sperrfrist (Mindestabstand 0)"}
            {kampagne.betreff_b && ` · A/B-Test: ${empfaenger.length - variantenB} bekommen Betreff A, ${variantenB} Betreff B`}
          </div>
        </div>
        {kampagne.status === "entwurf" && (
          <form action={setzeKampagnenMindestabstand} className="au-sperrfrist-form">
            <input type="hidden" name="id" value={kampagne.id} />
            <label className="au-klein" htmlFor="mindestabstand_tage">Mindestabstand (Tage)</label>
            <input className="au-input" id="mindestabstand_tage" name="mindestabstand_tage" type="number" min={0} max={90} defaultValue={kampagne.mindestabstand_tage} />
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Übernehmen</button>
          </form>
        )}
      </div>

      <div className="au-kampagne-raster">
        <section className="au-panel">
          <div className="au-panel-kopf">
            <h2 style={{ margin: 0 }}>So sieht die Mail aus</h2>
            <span className="au-klein">{beispiel ? `mit den Daten von ${beispiel.vorname} ${beispiel.nachname}` : ""}</span>
          </div>
          {beispiel ? (
            <div className="au-fe-vorschau" style={{ margin: "1rem 1.15rem" }}>
              <div className="au-fe-vorschau-betreff">
                {kampagne.betreff_b && <span className="au-badge au-badge-neutral" style={{ marginRight: "0.4rem" }}>A</span>}
                {beispiel.variante === "A" ? beispiel.betreff : kampagne.betreff.replace(/\{\{vorname\}\}/g, beispiel.vorname).replace(/\{\{nachname\}\}/g, beispiel.nachname)}
              </div>
              {kampagne.betreff_b && (
                <div className="au-fe-vorschau-betreff">
                  <span className="au-badge au-badge-neutral" style={{ marginRight: "0.4rem" }}>B</span>
                  {kampagne.betreff_b.replace(/\{\{vorname\}\}/g, beispiel.vorname).replace(/\{\{nachname\}\}/g, beispiel.nachname)}
                </div>
              )}
              <div className="au-fe-vorschau-inhalt" dangerouslySetInnerHTML={{ __html: beispiel.inhaltHtml }} />
            </div>
          ) : (
            <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Keine Empfänger – nichts zu zeigen.</p>
          )}
          <div style={{ padding: "0 1.15rem 1rem" }}>
            <LinkChecker
              text={[kampagne.betreff, kampagne.betreff_b || "", kampagne.inhalt].join("\n")}
              zusatzLinks={[
                { label: "Impressum", url: bausteine.impressum_url },
                { label: "Datenschutz", url: bausteine.datenschutz_url },
              ]}
            />
          </div>
          <form action={kampagneTestmail} className="au-kampagne-test">
            <input type="hidden" name="id" value={kampagne.id} />
            <label className="au-klein" htmlFor="test-an">Test-Mail an</label>
            <input className="au-input" id="test-an" name="an" type="email" required defaultValue="markus@agencyuplifted.de" />
            <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Test senden</button>
          </form>
        </section>

        <section className="au-panel">
          <div className="au-panel-kopf">
            <h2 style={{ margin: 0 }}>Empfänger:innen</h2>
            <span className="au-klein">{empfaenger.length}</span>
          </div>
          {empfaenger.length === 0 ? (
            <p className="au-leer" style={{ padding: "1rem 1.15rem", margin: 0 }}>Aktuell gibt es keine passenden Empfänger:innen. Nichts zu verschicken.</p>
          ) : (
            <ul className="au-kampagne-empfaengerliste">
              {empfaenger.map((e) => (
                <li key={e.id} className={e.inSperrfrist ? "au-zeile-sperrfrist" : undefined}>
                  <span>
                    {e.vorname} {e.nachname} <span className="au-klein">· {e.email}</span>
                  </span>
                  <span className="au-kampagne-empfaenger-badges">
                    {kampagne.betreff_b && <span className="au-badge au-badge-neutral">{e.variante}</span>}
                    {e.vermutlichRuhend && <span className="au-badge au-badge-neutral" title="Grobe Heuristik: letzte Mail über 180 Tage her oder nie – nur zur Orientierung">vermutlich ruhend</span>}
                    {e.inSperrfrist && <span className="au-badge au-badge-warning">innerhalb Sperrfrist, zuletzt am {tagMonat(e.letzteMarketingMailAm!)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {kampagne.status === "entwurf" && (
        <section className="au-panel" style={{ marginTop: "1.25rem" }}>
          <div className="au-panel-kopf"><h2 style={{ margin: 0 }}>Versand</h2></div>
          <div className="au-kampagne-panel-inhalt">
            {empfaenger.length > 0 ? (
              <form action={kampagneVersandJetzt} className="au-kampagne-versand">
                <input type="hidden" name="id" value={kampagne.id} />
                <BestaetigenButton anzahl={empfaenger.length} inSperrfrist={inSperrfrist} />
              </form>
            ) : null}
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "1rem" }}>
              <Link href="/kampagnen" className="au-link">Abbrechen</Link>
              <form action={loescheKampagnenEntwurf}>
                <input type="hidden" name="id" value={kampagne.id} />
                <button type="submit" className="au-link-danger">Entwurf löschen</button>
              </form>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
