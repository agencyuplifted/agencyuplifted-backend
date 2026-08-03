export const dynamic = "force-dynamic";

import { sendeTestMail } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.5rem", marginBottom: "0.75rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.25rem", marginBottom: "1.5rem" };

export default async function EmailTestPage({
  searchParams,
}: {
  searchParams: Promise<{ erfolg?: string; fehler?: string }>;
}) {
  const { erfolg, fehler } = await searchParams;

  return (
    <main>
      <h1>E-Mail-Versand testen</h1>
      <p style={{ color: "#666" }}>
        Testet die Resend-Integration. Absender: hallo@agencyuplifted.de (verifizierte Domain) — Mails
        koennen an beliebige Empfaenger verschickt werden.
      </p>

      {erfolg && (
        <div style={{ ...card, background: "#eef7ee", borderColor: "#3a7d3a", color: "#245c24" }}>
          Test-Mail wurde erfolgreich verschickt.
        </div>
      )}
      {fehler && (
        <div style={{ ...card, background: "#fbeaea", borderColor: "#8a1f1f", color: "#8a1f1f" }}>
          Fehler beim Versand: {fehler}
        </div>
      )}

      <div style={card}>
        <form action={sendeTestMail}>
          <label style={labelStyle}>An (E-Mail-Adresse)</label>
          <input style={inputStyle} name="an" type="email" required defaultValue="markus.hartmann@gmail.com" />

          <label style={labelStyle}>Betreff</label>
          <input style={inputStyle} name="betreff" defaultValue="Test-Mail von AgencyUplifted" />

          <label style={labelStyle}>Nachricht</label>
          <textarea style={{ ...inputStyle, minHeight: 120 }} name="nachricht" defaultValue={"Das ist eine Testmail aus der Seminarverwaltung."} />

          <button type="submit" style={{ background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer" }}>
            Test-Mail senden
          </button>
        </form>
      </div>
    </main>
  );
}
