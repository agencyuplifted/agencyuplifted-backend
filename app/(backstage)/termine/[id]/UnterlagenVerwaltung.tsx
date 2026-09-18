"use client";

import { useRef, useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";

type Aktion = (fd: FormData) => Promise<VorlagenAktionsErgebnis>;

// Unterlagen eines Termins: Datei hochladen (direkt vom Browser in den
// privaten Bucket per signierter Upload-URL) oder externen Link eintragen.
export default function UnterlagenVerwaltung({
  terminId,
  unterlagen,
  uploadVorbereitenAction,
  speichernAction,
  verschiebenAction,
  loeschenAction,
}: {
  terminId: string;
  unterlagen: { id: string; titel: string; datei_url: string }[];
  uploadVorbereitenAction: (fd: FormData) => Promise<VorlagenAktionsErgebnis & { pfad?: string; uploadUrl?: string }>;
  speichernAction: Aktion;
  verschiebenAction: Aktion;
  loeschenAction: Aktion;
}) {
  const [titel, setTitel] = useState("");
  const [link, setLink] = useState("");
  const [meldung, setMeldung] = useState<{ fehler: string | null; info?: string } | null>(null);
  const [fragtLoeschen, setFragtLoeschen] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const dateiRef = useRef<HTMLInputElement>(null);

  function fd(werte: Record<string, string>) {
    const f = new FormData();
    Object.entries(werte).forEach(([k, v]) => f.set(k, v));
    return f;
  }

  function hinzufuegen() {
    const datei = dateiRef.current?.files?.[0];
    starte(async () => {
      setMeldung(null);
      let pfad = "";
      if (datei) {
        const vorbereitet = await uploadVorbereitenAction(fd({ seminartermin_id: terminId, dateiname: datei.name }));
        if (vorbereitet.fehler || !vorbereitet.uploadUrl) return setMeldung({ fehler: vorbereitet.fehler || "Upload fehlgeschlagen." });
        const antwort = await fetch(vorbereitet.uploadUrl, { method: "PUT", body: datei, headers: { "content-type": datei.type || "application/octet-stream", "x-upsert": "false" } });
        if (!antwort.ok) return setMeldung({ fehler: `Upload fehlgeschlagen (${antwort.status}).` });
        pfad = vorbereitet.pfad || "";
      }
      const r = await speichernAction(fd({ seminartermin_id: terminId, titel: titel || datei?.name || "", pfad, link: datei ? "" : link }));
      if (r.fehler) return setMeldung(r);
      setTitel("");
      setLink("");
      if (dateiRef.current) dateiRef.current.value = "";
      setMeldung({ fehler: null, info: "Hinzugefügt." });
    });
  }

  return (
    <div>
      {!unterlagen.length && <p className="au-leer">Noch keine Unterlagen – die Teilnehmer sehen auf ihrer Seite einen „kommt bald“-Hinweis.</p>}
      <ul className="au-kompaktliste">
        {unterlagen.map((u, i) => (
          <li key={u.id}>
            <span>
              {u.titel} <span className="au-klein">· {u.datei_url.startsWith("storage:") ? "Datei" : "Link"}</span>
            </span>
            <span style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" disabled={laeuft || i === 0} onClick={() => starte(async () => { await verschiebenAction(fd({ id: u.id, seminartermin_id: terminId, richtung: "hoch" })); })} aria-label="nach oben">↑</button>
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" disabled={laeuft || i === unterlagen.length - 1} onClick={() => starte(async () => { await verschiebenAction(fd({ id: u.id, seminartermin_id: terminId, richtung: "runter" })); })} aria-label="nach unten">↓</button>
              {fragtLoeschen === u.id ? (
                <>
                  <button type="button" className="au-btn au-btn-danger-solid au-btn-sm" disabled={laeuft} onClick={() => starte(async () => { const r = await loeschenAction(fd({ id: u.id })); setFragtLoeschen(null); if (r.fehler) setMeldung(r); })}>Ja, entfernen</button>
                  <button type="button" className="au-link" onClick={() => setFragtLoeschen(null)}>abbrechen</button>
                </>
              ) : (
                <button type="button" className="au-link-danger" onClick={() => setFragtLoeschen(u.id)}>entfernen</button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="au-formgrid" style={{ marginTop: "1rem" }}>
        <div><label className="au-label">Titel</label><input className="au-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Seminarunterlagen (PDF)" /></div>
        <div><label className="au-label">Datei (bis 50 MB)</label><input className="au-input" type="file" ref={dateiRef} /></div>
        <div><label className="au-label">… oder Link</label><input className="au-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></div>
        <div><button type="button" className="au-btn au-btn-primary au-btn-sm" disabled={laeuft} onClick={hinzufuegen}>{laeuft ? "Lädt …" : "Hinzufügen"}</button></div>
      </div>
      {meldung && <p style={{ fontSize: "0.85rem", color: meldung.fehler ? "var(--color-danger)" : "var(--color-success)" }}>{meldung.fehler || meldung.info}</p>}
    </div>
  );
}
