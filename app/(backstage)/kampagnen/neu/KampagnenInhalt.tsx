"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { baueMailHtml, type MailBausteine } from "@/lib/mail-html";
import LinkChecker from "../../LinkChecker";

const PLATZHALTER = [
  { key: "{{vorname}}", label: "Vorname" },
  { key: "{{nachname}}", label: "Nachname" },
];

// Schritt 2 "Inhalt": links schreiben, rechts sofort sehen, wie die Mail beim
// ersten Empfaenger ankommt (inkl. Signatur, Fusszeile, Abmeldelink).
// Versandeinstellungen (Signatur, Sperrfrist) sind eingeklappt, weil sie
// selten vom Standard abweichen.
export default function KampagnenInhalt({
  speichernAction,
  regelnJson,
  segmentId,
  anzahl,
  beispiel,
  bausteine,
}: {
  speichernAction: (fd: FormData) => Promise<void>;
  regelnJson: string;
  segmentId: string | null;
  anzahl: number;
  beispiel: { vorname: string; nachname: string } | null;
  bausteine: MailBausteine;
}) {
  const [name, setName] = useState("");
  const [betreff, setBetreff] = useState("");
  const [abTest, setAbTest] = useState(false);
  const [betreffB, setBetreffB] = useState("");
  const [inhalt, setInhalt] = useState("");
  const [signatur, setSignatur] = useState(true);
  const [abstand, setAbstand] = useState("4");
  const [vorschauB, setVorschauB] = useState(false);
  const betreffRef = useRef<HTMLInputElement>(null);
  const inhaltRef = useRef<HTMLTextAreaElement>(null);
  const zuletzt = useRef<"betreff" | "inhalt">("inhalt");

  const werte = beispiel || { vorname: "Anna", nachname: "Beispiel" };
  const ersetze = (t: string) => t.replace(/\{\{\s*vorname\s*\}\}/g, werte.vorname).replace(/\{\{\s*nachname\s*\}\}/g, werte.nachname);

  function einfuegen(key: string) {
    const istBetreff = zuletzt.current === "betreff";
    const feld = istBetreff ? betreffRef.current : inhaltRef.current;
    const wert = istBetreff ? betreff : inhalt;
    const start = feld?.selectionStart ?? wert.length;
    const ende = feld?.selectionEnd ?? wert.length;
    (istBetreff ? setBetreff : setInhalt)(wert.slice(0, start) + key + wert.slice(ende));
    requestAnimationFrame(() => {
      feld?.focus();
      feld?.setSelectionRange(start + key.length, start + key.length);
    });
  }

  const vorschauBetreff = ersetze(vorschauB && betreffB ? betreffB : betreff);

  return (
    <form action={speichernAction} className="au-kinhalt">
      <input type="hidden" name="regeln" value={regelnJson} />
      {segmentId && <input type="hidden" name="segment_id" value={segmentId} />}

      <div className="au-kinhalt-editor">
        <section className="au-panel">
          <div className="au-kampagne-panel-inhalt">
            <label className="au-label" htmlFor="k-name">Name der Kampagne <span className="au-klein">(nur intern)</span></label>
            <input id="k-name" className="au-input" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Upgrade-Angebot Shift Herbst 2026" />

            <label className="au-label" htmlFor="k-betreff">Betreff</label>
            <input
              id="k-betreff"
              ref={betreffRef}
              className="au-input"
              name="betreff"
              required
              value={betreff}
              onChange={(e) => setBetreff(e.target.value)}
              onFocus={() => (zuletzt.current = "betreff")}
              placeholder="z. B. {{vorname}}, dein nächster Schritt nach der Preisfindung"
            />
            {abTest ? (
              <div className="au-kinhalt-ab">
                <label className="au-label" htmlFor="k-betreff-b">
                  Betreff B <span className="au-klein">– die Empfänger werden zufällig 50/50 aufgeteilt</span>
                </label>
                <input id="k-betreff-b" className="au-input" name="betreff_b" value={betreffB} onChange={(e) => setBetreffB(e.target.value)} placeholder="Alternative Betreffzeile" />
                <button type="button" className="au-link" onClick={() => { setAbTest(false); setBetreffB(""); setVorschauB(false); }}>A/B-Test entfernen</button>
              </div>
            ) : (
              <button type="button" className="au-link au-kinhalt-abknopf" onClick={() => setAbTest(true)}>+ Zweiten Betreff testen (A/B)</button>
            )}

            <div className="au-kinhalt-inhaltkopf">
              <label className="au-label" htmlFor="k-inhalt" style={{ margin: 0 }}>Text</label>
              <span className="au-chips" style={{ margin: 0 }}>
                {PLATZHALTER.map((p) => (
                  <button key={p.key} type="button" className="au-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => einfuegen(p.key)} title={`${p.key} einfügen`}>
                    + {p.label}
                  </button>
                ))}
              </span>
            </div>
            <textarea
              id="k-inhalt"
              ref={inhaltRef}
              className="au-textarea au-kinhalt-text"
              name="inhalt"
              required
              value={inhalt}
              onChange={(e) => setInhalt(e.target.value)}
              onFocus={() => (zuletzt.current = "inhalt")}
              placeholder={"Hallo {{vorname}},\n\n…"}
            />
            <LinkChecker
              text={`${betreff}\n${betreffB}\n${inhalt}`}
              zusatzLinks={[
                { label: "Impressum", url: bausteine.impressum_url },
                { label: "Datenschutz", url: bausteine.datenschutz_url },
              ]}
            />

            <details className="au-kinhalt-einstellungen">
              <summary>
                Versandeinstellungen <span className="au-klein">· Signatur {signatur ? "an" : "aus"} · Sperrfrist {abstand || 0} Tage</span>
              </summary>
              <label className="au-kinhalt-check">
                <input type="checkbox" name="baustein_signatur" checked={signatur} onChange={(e) => setSignatur(e.target.checked)} />
                <span>
                  Signatur anhängen
                  <span className="au-klein" style={{ display: "block" }}>Impressum, Datenschutz und der persönliche Abmeldelink kommen immer darunter – Pflicht bei Werbe-Mails.</span>
                </span>
              </label>
              <label className="au-label" htmlFor="k-abstand">Mindestabstand zur letzten Mail (Tage)</label>
              <input id="k-abstand" className="au-input" name="mindestabstand_tage" type="number" min={0} max={90} value={abstand} onChange={(e) => setAbstand(e.target.value)} style={{ maxWidth: 110 }} />
              <p className="au-klein" style={{ marginTop: "-0.5rem" }}>
                Wer in dieser Zeit schon eine Funnel- oder Kampagnen-Mail bekommen hat, wird standardmäßig ausgelassen. 0 = keine Sperrfrist (z. B. dringende Programmänderung).
              </p>
            </details>
          </div>
          <div className="au-kinhalt-fuss">
            <span className="au-klein">Es wird noch nichts verschickt – im nächsten Schritt prüfst du Empfänger und Mail und bestätigst ausdrücklich.</span>
            <Weiter anzahl={anzahl} />
          </div>
        </section>
      </div>

      <aside className="au-kinhalt-vorschau">
        <div className="au-kinhalt-vorschau-kopf">
          <span className="au-label" style={{ margin: 0 }}>So kommt die Mail an</span>
          {abTest && betreffB && (
            <span className="au-segment">
              <button type="button" className={!vorschauB ? "aktiv" : ""} onClick={() => setVorschauB(false)}>A</button>
              <button type="button" className={vorschauB ? "aktiv" : ""} onClick={() => setVorschauB(true)}>B</button>
            </span>
          )}
        </div>
        <div className="au-mailvorschau">
          <div className="au-mailvorschau-kopf">
            <div className="au-mailvorschau-zeile"><span>Von</span>AgencyUplifted</div>
            <div className="au-mailvorschau-zeile"><span>An</span>{werte.vorname} {werte.nachname}</div>
            <div className="au-mailvorschau-betreff">{vorschauBetreff || <span className="au-klein">(noch kein Betreff)</span>}</div>
          </div>
          <div
            className="au-mailvorschau-inhalt"
            dangerouslySetInnerHTML={{
              __html: inhalt.trim()
                ? baueMailHtml(ersetze(inhalt), bausteine, { signatur, rechtliches: true, abmelden: true }, "#")
                : '<p style="color:#a1a1a6">Hier erscheint deine Mail, während du schreibst.</p>',
            }}
          />
        </div>
        <p className="au-klein">Beispiel mit den Daten von {werte.vorname} {werte.nachname}{beispiel ? " (erste Person der Auswahl)" : ""}.</p>
      </aside>
    </form>
  );
}

function Weiter({ anzahl }: { anzahl: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="au-btn au-btn-primary" disabled={pending}>
      {pending ? "Speichert …" : `Weiter: Vorschau & Versand (${anzahl}) →`}
    </button>
  );
}
