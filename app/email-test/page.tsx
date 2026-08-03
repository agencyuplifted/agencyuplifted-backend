export const dynamic = "force-dynamic";

import { sendeTestMail } from "@/lib/actions";

export default async function EmailTestPage({
  searchParams,
}: {
  searchParams: Promise<{ erfolg?: string; fehler?: string }>;
}) {
  const { erfolg, fehler } = await searchParams;

  return (
    <main>
      <h1>E-Mail-Versand testen</h1>
      <p>
        Testet die Resend-Integration. Absender: hallo@agencyuplifted.de (verifizierte Domain) — Mails
        koennen an beliebige Empfaenger verschickt werden.
      </p>

      {erfolg && (
        <div className="au-banner au-banner-success">Test-Mail wurde erfolgreich verschickt.</div>
      )}
      {fehler && (
        <div className="au-banner au-banner-error">Fehler beim Versand: {fehler}</div>
      )}

      <div className="au-card">
        <form action={sendeTestMail}>
          <label className="au-label">An (E-Mail-Adresse)</label>
          <input className="au-input" name="an" type="email" required defaultValue="markus.hartmann@gmail.com" />

          <label className="au-label">Betreff</label>
          <input className="au-input" name="betreff" defaultValue="Test-Mail von AgencyUplifted" />

          <label className="au-label">Nachricht</label>
          <textarea className="au-textarea" name="nachricht" defaultValue={"Das ist eine Testmail aus der Seminarverwaltung."} />

          <button type="submit" className="au-btn au-btn-primary">Test-Mail senden</button>
        </form>
      </div>
    </main>
  );
}
