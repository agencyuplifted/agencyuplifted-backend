export const dynamic = "force-dynamic";

import { loginAction } from "@/lib/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; weiter?: string }>;
}) {
  const { fehler, weiter } = await searchParams;

  return (
    <main style={{ maxWidth: 380, margin: "5rem auto 0" }}>
      <h1 style={{ textAlign: "center", marginBottom: "0.35rem" }}>AgencyUplifted</h1>
      <p style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        Seminarverwaltung — nur für Mitarbeiter.
      </p>
      <div className="au-card" style={{ boxShadow: "var(--shadow-md)" }}>
        {fehler && (
          <div className="au-banner au-banner-error" style={{ marginBottom: "1.25rem", padding: "0.7rem 0.9rem" }}>
            E-Mail oder Passwort falsch.
          </div>
        )}
        <form action={loginAction}>
          <input type="hidden" name="weiter" value={weiter || "/"} />
          <label className="au-label">E-Mail</label>
          <input className="au-input" name="email" type="email" required autoFocus />
          <label className="au-label">Passwort</label>
          <input className="au-input" name="passwort" type="password" required />
          <button type="submit" className="au-btn au-btn-primary" style={{ width: "100%", marginTop: "0.25rem" }}>
            Anmelden
          </button>
        </form>
      </div>
    </main>
  );
}
