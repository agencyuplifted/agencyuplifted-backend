"use client";

import { useEffect, useState, useTransition } from "react";
import { ladeFunnelHandversand, sendeFunnelHandversand } from "@/lib/actions";
import { formatDatum } from "@/lib/format";

type Daten = NonNullable<Awaited<ReturnType<typeof ladeFunnelHandversand>>["daten"]>;
type Ergebnis = NonNullable<Awaited<ReturnType<typeof sendeFunnelHandversand>>["ergebnis"]>;

// Seminar-Mail gezielt fuer EINEN Termin jetzt verschicken (z. B. verpasster
// Stichtag). Zwei Bestaetigungen: erst Zusammenfassung, dann Kennung des
// Seminars eintippen -- ein Fehlklick schickt so nie Mails an echte Teilnehmer.
export default function Handversand({
  mailId,
  termine,
  vorauswahl,
}: {
  mailId: string;
  termine: { id: string; label: string }[];
  vorauswahl: string | null;
}) {
  const [terminId, setTerminId] = useState(vorauswahl || "");
  const [daten, setDaten] = useState<Daten | null>(null);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [schritt, setSchritt] = useState<"auswahl" | "frage" | "kennung">("auswahl");
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<Ergebnis | null>(null);
  const [vorschauOffen, setVorschauOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  function laden(id: string) {
    setDaten(null);
    setErgebnis(null);
    setFehler(null);
    setSchritt("auswahl");
    setEingabe("");
    if (!id) return;
    starte(async () => {
      const r = await ladeFunnelHandversand(mailId, id);
      if (r.fehler || !r.daten) return setFehler(r.fehler || "Konnte nicht geladen werden.");
      setDaten(r.daten);
      setAuswahl(new Set(r.daten.empfaenger.filter((e) => e.vorausgewaehlt).map((e) => e.teilnehmerId)));
    });
  }

  useEffect(() => {
    if (vorauswahl) laden(vorauswahl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function senden() {
    if (!daten) return;
    starte(async () => {
      setFehler(null);
      const r = await sendeFunnelHandversand(mailId, daten.termin.id, [...auswahl], eingabe);
      if (r.fehler || !r.ergebnis) return setFehler(r.fehler || "Versand fehlgeschlagen.");
      setErgebnis(r.ergebnis);
      setSchritt("auswahl");
      setEingabe("");
      // Liste neu laden: jetzt mit "bereits erhalten"
      const neu = await ladeFunnelHandversand(mailId, daten.termin.id);
      if (neu.daten) {
        setDaten(neu.daten);
        setAuswahl(new Set());
      }
    });
  }

  const umschalten = (id: string) =>
    setAuswahl((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const anzahl = auswahl.size;

  return (
    <section className="au-handversand">
      <h3>Jetzt an ein Seminar senden</h3>
      <p className="au-klein" style={{ marginTop: 0 }}>
        Unabhängig von Zeitschalter und „aktiv“ – z. B. wenn ein Stichtag verpasst wurde. Wer die Mail für dieses Seminar schon bekommen hat, ist markiert; der
        automatische Versand schickt sie danach nicht noch einmal.
      </p>

      <label className="au-handversand-termin">
        <span className="au-klein">Seminar</span>
        <select
          className="au-select"
          value={terminId}
          onChange={(e) => {
            setTerminId(e.target.value);
            laden(e.target.value);
          }}
          disabled={laeuft}
        >
          <option value="">Seminar wählen …</option>
          {termine.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>

      {laeuft && !daten && <p className="au-klein">Lade Empfänger …</p>}
      {fehler && <div className="au-banner au-banner-error">{fehler}</div>}
      {ergebnis && (
        <div className={`au-banner ${ergebnis.fehler ? "au-banner-warning" : "au-banner-success"}`}>
          {ergebnis.gesendet} Mail{ergebnis.gesendet === 1 ? "" : "s"} verschickt ✓
          {ergebnis.uebersprungen ? ` · ${ergebnis.uebersprungen} übersprungen (gesperrt oder schon erhalten)` : ""}
          {ergebnis.fehler ? ` · ${ergebnis.fehler} Fehler: ${ergebnis.fehlerText.join("; ")}` : ""}
        </div>
      )}

      {daten && (
        <>
          {!daten.empfaenger.length && <p className="au-klein">Für dieses Seminar gibt es keine Teilnehmer.</p>}
          {daten.empfaenger.length > 0 && (
            <ul className="au-handversand-liste">
              {daten.empfaenger.map((e) => {
                const gesperrt = !!e.gesperrt;
                return (
                  <li key={e.teilnehmerId} className={gesperrt ? "gesperrt" : ""}>
                    <label>
                      <input type="checkbox" checked={auswahl.has(e.teilnehmerId)} disabled={gesperrt || !!e.bereitsAm || schritt !== "auswahl"} onChange={() => umschalten(e.teilnehmerId)} />
                      <span className="au-handversand-name">
                        <b>{e.name || e.email}</b>
                        <small>{e.email || "—"}</small>
                      </span>
                      <span className="au-handversand-info">
                        {e.option && <span className="au-badge au-badge-neutral">{e.option}</span>}
                        {e.freiplatz && <span className="au-badge au-badge-neutral">Freiplatz</span>}
                        {e.buchungsstatus === "angefragt" && <span className="au-badge au-badge-warning">noch nicht bezahlt</span>}
                        {e.bereitsAm && <span className="au-badge au-badge-success">erhalten {formatDatum(e.bereitsAm)}</span>}
                        {e.gesperrt && <span className="au-badge au-badge-danger">{e.gesperrt}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {daten.vorschau && (
            <div className="au-handversand-vorschau">
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setVorschauOffen((v) => !v)}>
                {vorschauOffen ? "Vorschau schließen" : `Vorschau ansehen (mit Daten von ${daten.vorschau.fuer})`}
              </button>
              {vorschauOffen && (
                <div className="au-handversand-mail">
                  <div className="au-klein"><b>Betreff:</b> {daten.vorschau.betreff}</div>
                  <iframe title="Vorschau der Mail" srcDoc={daten.vorschau.html} sandbox="" />
                </div>
              )}
            </div>
          )}

          {schritt === "auswahl" && (
            <button type="button" className="au-btn au-btn-primary" disabled={!anzahl || laeuft} onClick={() => setSchritt("frage")}>
              {anzahl ? `An ${anzahl} Person${anzahl === 1 ? "" : "en"} senden …` : "Empfänger auswählen"}
            </button>
          )}

          {schritt === "frage" && (
            <div className="au-handversand-bestaetigung">
              <p>
                <b>Wirklich senden?</b> Die Mail geht jetzt an <b>{anzahl} Person{anzahl === 1 ? "" : "en"}</b> aus <b>{daten.termin.kennung}</b> ({daten.termin.titel}, {daten.termin.datum}).
                Das lässt sich nicht zurückholen.
              </p>
              <div className="au-handversand-knoepfe">
                <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={() => setSchritt("kennung")}>Ja, weiter</button>
                <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setSchritt("auswahl")}>Abbrechen</button>
              </div>
            </div>
          )}

          {schritt === "kennung" && (
            <form
              className="au-handversand-bestaetigung"
              onSubmit={(e) => {
                e.preventDefault();
                senden();
              }}
            >
              <p>
                Zur zweiten Bestätigung tippe <b>{daten.termin.kennung}</b> ein:
              </p>
              <div className="au-handversand-knoepfe">
                <input className="au-input" value={eingabe} onChange={(e) => setEingabe(e.target.value)} autoFocus placeholder={daten.termin.kennung} aria-label="Kennung des Seminars" />
                <button type="submit" className="au-btn au-btn-danger au-btn-sm" disabled={laeuft || eingabe.trim().toUpperCase() !== daten.termin.kennung.toUpperCase()}>
                  {laeuft ? "Sende …" : `Jetzt an ${anzahl} senden`}
                </button>
                <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setSchritt("auswahl")} disabled={laeuft}>Abbrechen</button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
