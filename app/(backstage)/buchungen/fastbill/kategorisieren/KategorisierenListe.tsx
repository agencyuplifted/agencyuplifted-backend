"use client";

import { useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import { formatDatum, formatEUR } from "@/lib/format";

type Zeile = { id: string; nummer: string; datum: string; kunde: string; betrag: number; text: string; storno: boolean; ignoriert: boolean };

// Zeile verschwindet sofort (optimistisch); schlaegt das Speichern fehl,
// kommt sie mit Fehlermeldung zurueck.
export default function KategorisierenListe({
  zeilen,
  kategorien,
  action,
}: {
  zeilen: Zeile[];
  kategorien: string[];
  action: (fd: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [gesamt] = useState(zeilen.length);
  const [offen, setOffen] = useState(zeilen);
  const [fehler, setFehler] = useState<string | null>(null);
  const [, starte] = useTransition();
  const erledigt = gesamt - offen.length;

  function zuordnen(z: Zeile, kategorie: string) {
    setFehler(null);
    setOffen((liste) => liste.filter((x) => x.id !== z.id));
    starte(async () => {
      const fd = new FormData();
      fd.set("id", z.id);
      fd.set("kategorie", kategorie);
      try {
        const r = await action(fd);
        if (r.fehler) throw new Error(r.fehler);
      } catch (e: any) {
        setFehler(`${z.nummer}: ${e?.message || "Speichern fehlgeschlagen"}`);
        setOffen((liste) => [...liste, z].sort((a, b) => b.betrag - a.betrag));
      }
    });
  }

  return (
    <div>
      <div className="au-kat-fortschritt" role="status" aria-live="polite">
        <strong>{erledigt} von {gesamt}</strong> kategorisiert
        <span className="au-belegung-balken" style={{ flex: 1, maxWidth: 320 }}>
          <span style={{ width: `${gesamt ? (erledigt / gesamt) * 100 : 0}%` }} />
        </span>
      </div>
      {fehler && <p style={{ color: "var(--color-danger)", fontSize: "0.85rem" }}>{fehler}</p>}
      {!offen.length && <p className="au-leer">Alles kategorisiert. 🎉</p>}
      <ul className="au-kat-liste">
        {offen.map((z) => (
          <li key={z.id} className="au-kat-zeile">
            <div className="au-kat-info">
              <div>
                <strong>{z.kunde}</strong>
                <span className="au-klein"> · {z.nummer} · {formatDatum(z.datum)}</span>
                {z.storno && <span className="au-badge au-badge-danger" style={{ marginLeft: "0.4rem" }}>Storno</span>}
                {z.ignoriert && <span className="au-badge au-badge-neutral" style={{ marginLeft: "0.4rem" }}>ignoriert</span>}
              </div>
              <div className="au-kat-text">{z.text || "—"}</div>
            </div>
            <div className="au-kat-betrag">{formatEUR(z.betrag)}</div>
            <div className="au-kat-pillen">
              {kategorien.map((k) => (
                <button key={k} type="button" className="au-kat-pille" onClick={() => zuordnen(z, k)}>
                  {k}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
