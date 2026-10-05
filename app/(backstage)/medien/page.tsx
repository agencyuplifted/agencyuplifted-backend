export const dynamic = "force-dynamic";

import MedienUpload from "./MedienUpload";
import MedienListe from "./MedienListe";
import { blobVerbunden, ladeMedien } from "@/lib/medien-server";

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

  return (
    <main>
      <h1>Medien</h1>
      <p className="au-medien-intro">
        Lade hier Videos für die Website hoch. Nach dem Upload kopierst du die URL und trägst sie in Onepage ein – die Adresse bleibt dauerhaft gleich.
      </p>

      <MedienUpload />

      {ladefehler && <div className="au-banner au-banner-error">{ladefehler}</div>}

      <MedienListe dateien={dateien.map((d) => ({ url: d.url, pathname: d.pathname, size: d.size, uploadedAt: new Date(d.uploadedAt).toISOString() }))} />
    </main>
  );
}
