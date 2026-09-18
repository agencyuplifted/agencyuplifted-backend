"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { baueMailHtml, type MailBausteine } from "@/lib/mail-html";
import LinkChecker from "../../LinkChecker";
import VorlagenWahl, { type Vorlage } from "./VorlagenWahl";

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
  kampagneId,
  start,
  vorlagen,
}: {
  speichernAction: (fd: FormData) => Promise<void>;
  regelnJson: string;
  segmentId: string | null;
  anzahl: number;
  beispiel: { vorname: string; nachname: string } | null;
  bausteine: MailBausteine;
  /** gesetzt = bestehender Entwurf wird bearbeitet */
  kampagneId: string | null;
  start: Entwurf;
  vorlagen: Vorlage[];
}) {
  const [name, setName] = useState(start.name);
  const [betreff, setBetreff] = useState(start.betreff);
  const [betreffB, setBetreffB] = useState(start.betreffB);
  const [abTest, setAbTest] = useState(!!start.betreffB);
  const [inhalt, setInhalt] = useState(start.inhalt);
  const [signatur, setSignatur] = useState(start.signatur);
  const [abstand, setAbstand] = useState(start.abstand);
  const [wiederhergestellt, setWiederhergestellt] = useState(false);
  const geladen = useRef(false);

  // Zwischenspeicher im Browser: wer zu den Empfaengern zurueckgeht und wieder
  // vor kommt, findet seinen Text unveraendert vor. Pro Entwurf ein eigener
  // Schluessel; nach dem Speichern wird er geloescht.
  const schluessel = `au-kampagne-entwurf-${kampagneId || "neu"}`;
  useEffect(() => {
    try {
      const roh = localStorage.getItem(schluessel);
      const e = roh ? (JSON.parse(roh) as Entwurf) : null;
      if (e && JSON.stringify(e) !== JSON.stringify(start)) {
        setName(e.name); setBetreff(e.betreff); setBetreffB(e.betreffB); setAbTest(!!e.betreffB);
        setInhalt(e.inhalt); setSignatur(e.signatur); setAbstand(e.abstand);
        setWiederhergestellt(true);
      }
    } catch {}
    geladen.current = true;
    // nur beim ersten Anzeigen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!geladen.current) return;
    try {
      localStorage.setItem(schluessel, JSON.stringify({ name, betreff, betreffB, inhalt, signatur, abstand } satisfies Entwurf));
    } catch {}
  }, [schluessel, name, betreff, betreffB, inhalt, signatur, abstand]);

  function verwerfen() {
    setName(start.name); setBetreff(start.betreff); setBetreffB(start.betreffB); setAbTest(!!start.betreffB);
    setInhalt(start.inhalt); setSignatur(start.signatur); setAbstand(start.abstand);
    setWiederhergestellt(false);
    try { localStorage.removeItem(schluessel); } catch {}
  }
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
  // Kampagnen kennen nur {{vorname}}/{{nachname}} -- alles andere (z. B. aus
  // einer Funnel-Mail uebernommen) ginge woertlich raus.
  const fremdePlatzhalter = Array.from(
    new Set((`${betreff} ${betreffB} ${inhalt}`.match(/\{\{\s*\w+\s*\}\}/g) || []).filter((p) => !/\{\{\s*(vorname|nachname)\s*\}\}/.test(p)))
  );

  function vorlageUebernehmen(v: { betreff: string; inhalt: string; titel?: string }) {
    if ((betreff.trim() || inhalt.trim()) && !window.confirm("Betreff und Text durch die Vorlage ersetzen?")) return;
    setBetreff(v.betreff);
    setInhalt(v.inhalt);
    if (!name.trim() && v.titel) setName(`${v.titel} (Kopie)`);
  }

  return (
    // Zwischenspeicher wird erst auf der Vorschau-Seite geloescht (EntwurfAufraeumen),
    // damit bei einem Fehler beim Speichern nichts verloren geht.
    <form action={speichernAction} className="au-kinhalt">
      <input type="hidden" name="regeln" value={regelnJson} />
      {kampagneId && <input type="hidden" name="kampagne_id" value={kampagneId} />}
      {segmentId && <input type="hidden" name="segment_id" value={segmentId} />}

      <div className="au-kinhalt-editor">
        {wiederhergestellt && (
          <div className="au-banner au-banner-success au-sperrfrist-kopf" style={{ marginTop: 0 }}>
            <span>Dein zuletzt geschriebener Text ist wieder da.</span>
            <button type="button" className="au-link" onClick={verwerfen}>{kampagneId ? "Gespeicherte Fassung laden" : "Verwerfen und leer beginnen"}</button>
          </div>
        )}
        <section className="au-panel">
          <div className="au-kampagne-panel-inhalt">
            <VorlagenWahl vorlagen={vorlagen} onUebernehmen={vorlageUebernehmen} />
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
            {fremdePlatzhalter.length > 0 && (
              <p className="au-fe-warnung">
                {fremdePlatzhalter.join(", ")} gibt es in Kampagnen nicht (nur Vorname und Nachname) – würde wörtlich so verschickt. Bitte ersetzen.
              </p>
            )}
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

export type Entwurf = { name: string; betreff: string; betreffB: string; inhalt: string; signatur: boolean; abstand: string };

export const LEERER_ENTWURF: Entwurf = { name: "", betreff: "", betreffB: "", inhalt: "", signatur: true, abstand: "4" };

function Weiter({ anzahl }: { anzahl: number }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="au-btn au-btn-primary" disabled={pending}>
      {pending ? "Speichert …" : `Weiter: Vorschau & Versand (${anzahl}) →`}
    </button>
  );
}
