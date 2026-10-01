"use client";

import { useRef, useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import { formatEUR } from "@/lib/format";

type Beleg = { id: string; betrag_netto: number; beschreibung: string | null; dateiname: string | null; datei_pfad: string | null };
type Aktion = (fd: FormData) => Promise<VorlagenAktionsErgebnis>;

// Echte Fremdkosten eines Termins (Hotelrechnung u. a.): Betrag netto plus
// optional das PDF. Upload direkt vom Browser in den privaten Bucket
// "kostenbelege" per signierter URL -- wie bei den Unterlagen, aber getrennt,
// weil Hotelrechnungen Gaestenamen enthalten.
export default function KostenbelegeVerwaltung({
  terminId,
  belege,
  uploadVorbereitenAction,
  speichernAction,
  loeschenAction,
}: {
  terminId: string;
  belege: Beleg[];
  uploadVorbereitenAction: (fd: FormData) => Promise<VorlagenAktionsErgebnis & { pfad?: string; uploadUrl?: string }>;
  speichernAction: Aktion;
  loeschenAction: Aktion;
}) {
  const [betrag, setBetrag] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [meldung, setMeldung] = useState<{ fehler: string | null; info?: string } | null>(null);
  const [fragtLoeschen, setFragtLoeschen] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const dateiRef = useRef<HTMLInputElement>(null);
  const nachreichenRef = useRef<Record<string, HTMLInputElement | null>>({});

  function fd(werte: Record<string, string>) {
    const f = new FormData();
    Object.entries(werte).forEach(([k, v]) => f.set(k, v));
    return f;
  }

  async function hochladen(datei: File): Promise<{ pfad?: string; fehler?: string }> {
    const v = await uploadVorbereitenAction(fd({ seminartermin_id: terminId, dateiname: datei.name }));
    if (v.fehler || !v.uploadUrl) return { fehler: v.fehler || "Upload fehlgeschlagen." };
    const antwort = await fetch(v.uploadUrl, { method: "PUT", body: datei, headers: { "content-type": datei.type || "application/pdf", "x-upsert": "false" } });
    if (!antwort.ok) return { fehler: `Upload fehlgeschlagen (${antwort.status}).` };
    return { pfad: v.pfad };
  }

  function hinzufuegen() {
    const datei = dateiRef.current?.files?.[0];
    starte(async () => {
      setMeldung(null);
      let pfad = "";
      if (datei) {
        const r = await hochladen(datei);
        if (r.fehler) return setMeldung({ fehler: r.fehler });
        pfad = r.pfad || "";
      }
      const r = await speichernAction(fd({ seminartermin_id: terminId, betrag_netto: betrag, beschreibung, pfad, dateiname: datei?.name || "" }));
      if (r.fehler) return setMeldung(r);
      setBetrag("");
      setBeschreibung("");
      if (dateiRef.current) dateiRef.current.value = "";
      setMeldung({ fehler: null, info: "Beleg gespeichert." });
    });
  }

  function nachreichen(belegId: string) {
    const datei = nachreichenRef.current[belegId]?.files?.[0];
    if (!datei) return;
    starte(async () => {
      setMeldung(null);
      const r = await hochladen(datei);
      if (r.fehler) return setMeldung({ fehler: r.fehler });
      const s = await speichernAction(fd({ seminartermin_id: terminId, beleg_id: belegId, pfad: r.pfad || "", dateiname: datei.name }));
      setMeldung(s.fehler ? s : { fehler: null, info: "Datei angehängt." });
    });
  }

  return (
    <div>
      {!belege.length && <p className="au-leer">Noch keine Belege – der Deckungsbeitrag rechnet mit den geschätzten Pauschalen.</p>}
      <ul className="au-kompaktliste">
        {belege.map((b) => (
          <li key={b.id}>
            <span>
              <strong>{formatEUR(Number(b.betrag_netto))}</strong> netto
              {b.beschreibung && <> · {b.beschreibung}</>}
              {b.datei_pfad ? (
                <> · <a href={`/api/kostenbelege/${b.id}`} target="_blank" rel="noreferrer">{b.dateiname || "Datei"} ↗</a></>
              ) : (
                <span className="au-klein">
                  {" "}· keine Datei –{" "}
                  <label style={{ cursor: "pointer", textDecoration: "underline" }}>
                    PDF anhängen
                    <input type="file" accept="application/pdf,image/png,image/jpeg" style={{ display: "none" }} ref={(el) => { nachreichenRef.current[b.id] = el; }} onChange={() => nachreichen(b.id)} />
                  </label>
                </span>
              )}
            </span>
            <span>
              {fragtLoeschen === b.id ? (
                <>
                  <button type="button" className="au-btn au-btn-danger-solid au-btn-sm" disabled={laeuft} onClick={() => starte(async () => { const r = await loeschenAction(fd({ id: b.id })); setFragtLoeschen(null); if (r.fehler) setMeldung(r); })}>Ja, entfernen</button>{" "}
                  <button type="button" className="au-link" onClick={() => setFragtLoeschen(null)}>abbrechen</button>
                </>
              ) : (
                <button type="button" className="au-link-danger" onClick={() => setFragtLoeschen(b.id)}>entfernen</button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="au-formgrid" style={{ marginTop: "1rem" }}>
        <div><label className="au-label">Betrag netto (€)</label><input className="au-input" inputMode="decimal" value={betrag} onChange={(e) => setBetrag(e.target.value)} placeholder="z. B. 9246,92" /></div>
        <div><label className="au-label">Beschreibung</label><input className="au-input" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="z. B. Hotelrechnung 200.787.127" /></div>
        <div><label className="au-label">PDF (optional)</label><input className="au-input" type="file" accept="application/pdf,image/png,image/jpeg" ref={dateiRef} /></div>
        <div><button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={laeuft || !betrag} onClick={hinzufuegen}>{laeuft ? "Speichert …" : "Beleg hinzufügen"}</button></div>
      </div>
      {meldung && <p style={{ fontSize: "0.85rem", color: meldung.fehler ? "var(--color-danger)" : "var(--color-success)" }}>{meldung.fehler || meldung.info}</p>}
    </div>
  );
}
