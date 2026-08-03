export const dynamic = "force-dynamic";

import { loginAction } from "@/lib/actions";

const inputStyle: React.CSSProperties = { display: "block", width: "100%", padding: "0.6rem", marginBottom: "1rem" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", fontWeight: 600 };
const btn: React.CSSProperties = { background: "#102A4C", color: "white", padding: "0.6rem 1.2rem", border: "none", cursor: "pointer", width: "100%" };
const card: React.CSSProperties = { border: "1px solid #e2e2e2", padding: "1.5rem" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; weiter?: string }>;
}) {
  const { fehler, weiter } = await searchParams;

  return (
    <main style={{ maxWidth: 380, margin: "4rem auto" }}>
      <h1 style={{ textAlign: "center" }}>Anmelden</h1>
      <p style={{ color: "#666", textAlign: "center", marginBottom: "1.5rem" }}>
        AgencyUplifted Seminarverwaltung — nur für Mitarbeiter.
      </p>
      <div style={card}>
        {fehler && (
          <p style={{ color: "#8a1f1f", background: "#fbeaea", padding: "0.6rem 0.8rem", fontSize: "0.9rem" }}>
            E-Mail oder Passwort falsch.
          </p>
        )}
        <form action={loginAction}>
          <input type="hidden" name="weiter" value={weiter || "/"} />
          <label style={labelStyle}>E-Mail</label>
          <input style={inputStyle} name="email" type="email" required autoFocus />
          <label style={labelStyle}>Passwort</label>
          <input style={inputStyle} name="passwort" type="password" required />
          <button type="submit" style={btn}>Anmelden</button>
        </form>
      </div>
    </main>
  );
}
