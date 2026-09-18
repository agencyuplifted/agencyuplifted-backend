"use client";

import { useMemo, useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import AktionsFormular from "../AktionsFormular";

type Aktion = (fd: FormData) => Promise<VorlagenAktionsErgebnis & { info?: string }>;

export type EinladenZeile = {
  id: string;
  name: string;
  email: string | null;
  consent: string;
  unternehmer: string | null;
  agenturen: { verknuepfungId: string; name: string; rolle: string }[];
  pilotStatus: string | null;
  vorgemerkt: boolean;
  seminare: number;
  letztesJahr: number | null;
  verknuepft: boolean;
};

const PILOT_LABEL: Record<string, string> = { eingeladen: "eingeladen", aktiv: "aktiv im Netzwerk", abgelehnt: "gesperrt" };

// Kuratierte Auswahl wie bei Kampagnen: Filter -> Liste -> Auswahl -> Aktion.
// Zwei strikt getrennte Aktionen; vor jeder erscheint eine sichtbare
// Rueckfrage mit den konkreten Namen (kein versehentlicher Massenversand).
export default function EinladenListe({
  zeilen,
  einladenAction,
  vormerkenAction,
  erneutAction,
  vormerklisteEntfernenAction,
  zugangAction,
  rolleAction,
}: {
  zeilen: EinladenZeile[];
  einladenAction: Aktion;
  vormerkenAction: Aktion;
  erneutAction: Aktion;
  vormerklisteEntfernenAction: Aktion;
  zugangAction: Aktion;
  rolleAction: Aktion;
}) {
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [frage, setFrage] = useState<"einladen" | "vormerken" | null>(null);
  const [meldung, setMeldung] = useState<{ fehler: string | null; info?: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const gewaehlt = useMemo(() => zeilen.filter((z) => auswahl.has(z.id)), [zeilen, auswahl]);
  const einladbar = gewaehlt.filter((z) => z.email && !z.pilotStatus);

  function umschalten(id: string) {
    setAuswahl((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function ausfuehren(art: "einladen" | "vormerken") {
    const personen = art === "einladen" ? einladbar : gewaehlt;
    const fd = new FormData();
    personen.forEach((p) => fd.append("teilnehmer_id", p.id));
    setFrage(null);
    starte(async () => {
      const r = await (art === "einladen" ? einladenAction : vormerkenAction)(fd);
      setMeldung(r);
      if (!r.fehler) setAuswahl(new Set());
    });
  }

  return (
    <div>
      <div className="au-card" style={{ position: "sticky", top: 0, zIndex: 5, padding: "0.9rem 1.1rem", display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
        <strong>{auswahl.size} ausgewählt</strong>
        <button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={!einladbar.length || laeuft} onClick={() => setFrage("einladen")}>
          In Pilotkreis einladen{einladbar.length !== gewaehlt.length && gewaehlt.length ? ` (${einladbar.length})` : ""}
        </button>
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" disabled={!gewaehlt.length || laeuft} onClick={() => setFrage("vormerken")}>
          Auf Vormerkliste setzen
        </button>
        {auswahl.size > 0 && <button type="button" className="au-link" onClick={() => setAuswahl(new Set())}>Auswahl leeren</button>}
        {laeuft && <span className="au-klein">läuft …</span>}
        {frage && (
          <div style={{ flexBasis: "100%", background: "var(--color-warning-soft)", border: "1px solid var(--color-warning-border)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.75rem" }}>
            <p style={{ margin: "0 0 0.5rem", color: "var(--color-text)", fontSize: "0.9rem" }}>
              {frage === "einladen" ? (
                <>Jetzt <strong>eine persönliche Einladungs-Mail</strong> an {einladbar.map((p) => p.name).join(", ")} senden? Sie bekommen damit Zugang zum Netzwerk.</>
              ) : (
                <>{gewaehlt.map((p) => p.name).join(", ")} auf die Vormerkliste setzen? Es wird <strong>nichts verschickt</strong>.</>
              )}
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={() => ausfuehren(frage)}>{frage === "einladen" ? "Ja, Einladung senden" : "Ja, vormerken"}</button>
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setFrage(null)}>Abbrechen</button>
            </div>
          </div>
        )}
        {meldung && (
          <p style={{ flexBasis: "100%", margin: 0, fontSize: "0.85rem", color: meldung.fehler ? "var(--color-danger)" : "var(--color-success)" }}>
            {meldung.fehler || meldung.info}
          </p>
        )}
      </div>

      <table className="au-table">
        <thead>
          <tr>
            <th style={{ width: 36 }}></th>
            <th>Person</th>
            <th>Agentur</th>
            <th>Seminare</th>
            <th>Netzwerk</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.id} style={auswahl.has(z.id) ? { background: "var(--color-accent-soft)" } : undefined}>
              <td><input type="checkbox" checked={auswahl.has(z.id)} onChange={() => umschalten(z.id)} aria-label={`${z.name} auswählen`} /></td>
              <td>
                <a href={`/teilnehmer/${z.id}`}><strong>{z.name}</strong></a>
                <div className="au-klein">
                  {z.email || <span className="au-text-danger">keine E-Mail</span>}
                  {z.consent === "unbekannt" && <> · <span className="au-text-warning">Einwilligung unbekannt</span></>}
                  {z.unternehmer === "unternehmer" && " · Unternehmer"}
                </div>
              </td>
              <td>
                {z.agenturen.map((a) => (
                  <div key={a.verknuepfungId} style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span>{a.name}</span>
                    {z.pilotStatus && (
                      <AktionsFormular action={rolleAction}>
                        <input type="hidden" name="id" value={a.verknuepfungId} />
                        <select name="agentur_rolle" defaultValue={a.rolle} className="au-select au-inbox-select" onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Rolle in der Agentur">
                          <option value="unbekannt">Rolle?</option>
                          <option value="inhaber">Inhaber</option>
                          <option value="mitinhaber">Mitinhaber</option>
                          <option value="angestellt">angestellt</option>
                        </select>
                      </AktionsFormular>
                    )}
                  </div>
                ))}
              </td>
              <td className="au-klein">{z.seminare}{z.letztesJahr ? ` · zuletzt ${z.letztesJahr}` : ""}</td>
              <td>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
                  {z.pilotStatus && (
                    <span className={`au-badge ${z.pilotStatus === "aktiv" ? "au-badge-success" : z.pilotStatus === "abgelehnt" ? "au-badge-danger" : "au-badge-warning"}`}>
                      Pilot: {PILOT_LABEL[z.pilotStatus] || z.pilotStatus}
                    </span>
                  )}
                  {z.vorgemerkt && <span className="au-badge au-badge-neutral">vorgemerkt</span>}
                  <span style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    {z.pilotStatus === "eingeladen" && (
                      <AktionsFormular action={erneutAction} bestaetigung={`Einladung an ${z.name} erneut senden?`}>
                        <input type="hidden" name="teilnehmer_id" value={z.id} />
                        <button type="submit" className="au-link">erneut senden</button>
                      </AktionsFormular>
                    )}
                    {z.pilotStatus && (
                      <AktionsFormular action={zugangAction} bestaetigung={z.pilotStatus === "abgelehnt" ? `Zugang für ${z.name} wieder freigeben?` : `Zugang für ${z.name} sperren? Wirkt sofort.`}>
                        <input type="hidden" name="teilnehmer_id" value={z.id} />
                        <input type="hidden" name="sperren" value={String(z.pilotStatus !== "abgelehnt")} />
                        <button type="submit" className={z.pilotStatus === "abgelehnt" ? "au-link" : "au-link-danger"}>{z.pilotStatus === "abgelehnt" ? "freigeben" : "sperren"}</button>
                      </AktionsFormular>
                    )}
                    {z.vorgemerkt && (
                      <AktionsFormular action={vormerklisteEntfernenAction}>
                        <input type="hidden" name="teilnehmer_id" value={z.id} />
                        <button type="submit" className="au-link">nicht mehr vormerken</button>
                      </AktionsFormular>
                    )}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!zeilen.length && <p className="au-leer">Keine Personen für diese Filter.</p>}
    </div>
  );
}
