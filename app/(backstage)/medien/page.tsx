export const dynamic = "force-dynamic";

import AktionsFormular from "../AktionsFormular";
import MedienUpload from "./MedienUpload";
import UrlKopieren from "./UrlKopieren";
import { loescheMedium } from "@/lib/actions";
import { blobVerbunden, ladeMedien } from "@/lib/medien-server";
import { formatGroesse } from "@/lib/medien";

// Medien fuer die Website (Onepage kann keine Videos speichern): hochladen,
// oeffentliche URL kopieren, in Onepage eintragen.
export default async function MedienSeite() {
  if (!blobVerbunden()) {
    return (
      <main>
        <h1>Medien</h1>
        <div className="au-banner au-banner-warning">
          Der Speicher ist noch nicht verbunden. In Vercel: <strong>Storage → agencyuplifted-media → Connect Project</strong> → agencyuplifted-backend
          (Production, Preview, Development) – danach neu deployen.
        </div>
      </main>
    );
  }

  let dateien: Awaited<ReturnType<typeof ladeMedien>> = [];
  let ladefehler: string | null = null;
  try {
    dateien = await ladeMedien();
  } catch (e: any) {
    ladefehler = e?.message || "Dateien konnten nicht geladen werden.";
  }
  const gesamt = dateien.reduce((s, d) => s + d.size, 0);

  return (
    <main>
      <h1>Medien</h1>
      <p className="au-medien-intro">
        Lade hier Videos für die Website hoch. Nach dem Upload kopierst du die URL und trägst sie in Onepage ein – die Adresse bleibt dauerhaft gleich.
      </p>

      <MedienUpload />

      {ladefehler && <div className="au-banner au-banner-error">{ladefehler}</div>}

      <section className="au-sz-karte au-medien-liste">
        <header className="au-sz-karte-kopf">
          <h3>Deine Dateien</h3>
          <span>{dateien.length} Datei{dateien.length === 1 ? "" : "en"} · {formatGroesse(gesamt)}</span>
        </header>
        {!dateien.length && !ladefehler && <p className="au-ue-fuss" style={{ borderTop: 0 }}>Noch keine Dateien hochgeladen.</p>}
        {dateien.map((d) => {
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
                <AktionsFormular action={loescheMedium} bestaetigung={`„${name}“ wirklich löschen? Seiten, die das Video einbinden, zeigen es danach nicht mehr.`}>
                  <input type="hidden" name="url" value={d.url} />
                  <button type="submit" className="au-btn au-btn-sm au-btn-secondary">Löschen</button>
                </AktionsFormular>
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
