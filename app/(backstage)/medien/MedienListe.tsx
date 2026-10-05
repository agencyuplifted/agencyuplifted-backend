"use client";

import { useState } from "react";
import AktionsFormular from "../AktionsFormular";
import UrlKopieren from "./UrlKopieren";
import { loescheMedium } from "@/lib/actions";
import { formatGroesse } from "@/lib/medien";

export type MedienDatei = { url: string; pathname: string; size: number; uploadedAt: string };

// Clientseitig, damit eine geloeschte Datei sofort verschwindet: list() von
// Vercel Blob liefert sie nach dem Loeschen noch ein paar Sekunden mit
// (beobachtet 10/2026) -- ohne das stand sie bis zum Neuladen weiter da.
export default function MedienListe({ dateien }: { dateien: MedienDatei[] }) {
  const [geloescht, setGeloescht] = useState<Set<string>>(new Set());
  const sichtbar = dateien.filter((d) => !geloescht.has(d.url));
  const gesamt = sichtbar.reduce((s, d) => s + d.size, 0);

  return (
    <section className="au-sz-karte au-medien-liste">
      <header className="au-sz-karte-kopf">
        <h3>Deine Dateien</h3>
        <span>{sichtbar.length} Datei{sichtbar.length === 1 ? "" : "en"} · {formatGroesse(gesamt)}</span>
      </header>
      {!sichtbar.length && <p className="au-ue-fuss" style={{ borderTop: 0 }}>Noch keine Dateien hochgeladen.</p>}
      {sichtbar.map((d) => {
        const name = d.pathname.split("/").pop() || d.pathname;
        const ordner = d.pathname.includes("/") ? d.pathname.split("/")[0] : "";
        const istVideo = /\.(mp4|webm)$/i.test(d.pathname);
        return (
          <div key={d.url} className="au-medien-zeile">
            <div className="au-medien-vorschau">
              {istVideo ? <video src={d.url} preload="metadata" muted controls playsInline /> : <span>Datei</span>}
            </div>
            <div className="au-medien-info">
              <b title={name}>{name}</b>
              <small>
                {ordner && `${ordner} · `}
                {formatGroesse(d.size)} · {new Date(d.uploadedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" })}
              </small>
              <a href={d.url} target="_blank" rel="noreferrer" className="au-medien-url">{d.url}</a>
            </div>
            <div className="au-medien-aktionen">
              <UrlKopieren url={d.url} />
              <AktionsFormular
                action={loescheMedium}
                bestaetigung={`„${name}“ wirklich löschen? Seiten, die das Video einbinden, zeigen es danach nicht mehr.`}
                onErfolg={() => setGeloescht((s) => new Set(s).add(d.url))}
              >
                <input type="hidden" name="url" value={d.url} />
                <button type="submit" className="au-btn au-btn-sm au-btn-secondary">Löschen</button>
              </AktionsFormular>
            </div>
          </div>
        );
      })}
    </section>
  );
}
