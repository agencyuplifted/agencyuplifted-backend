import Link from "next/link";

export const metadata = { title: "AgencyUplifted Backend" };

const navStyle: React.CSSProperties = {
  display: "flex",
  gap: "1.25rem",
  padding: "1rem 2rem",
  borderBottom: "1px solid #e2e2e2",
  fontFamily: "system-ui, sans-serif",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#102A4C" }}>
        <nav style={navStyle}>
          <Link href="/" style={{ fontWeight: 700, textDecoration: "none", color: "#102A4C" }}>
            AgencyUplifted
          </Link>
          <Link href="/termine" style={{ textDecoration: "none", color: "#102A4C" }}>Termine</Link>
          <Link href="/teilnehmer" style={{ textDecoration: "none", color: "#102A4C" }}>Teilnehmer</Link>
          <Link href="/organisationen" style={{ textDecoration: "none", color: "#102A4C" }}>Organisationen</Link>
          <Link href="/buchungen" style={{ textDecoration: "none", color: "#102A4C" }}>Buchungen</Link>
          <Link href="/warteliste" style={{ textDecoration: "none", color: "#102A4C" }}>Warteliste</Link>
          <Link href="/trainer" style={{ textDecoration: "none", color: "#102A4C" }}>Trainer</Link>
          <Link href="/mitarbeiter" style={{ textDecoration: "none", color: "#102A4C" }}>Mitarbeiter</Link>
          <Link href="/orte" style={{ textDecoration: "none", color: "#102A4C" }}>Orte</Link>
          <Link href="/community" style={{ textDecoration: "none", color: "#102A4C" }}>Community</Link>
          <Link href="/leads" style={{ textDecoration: "none", color: "#102A4C" }}>Leads</Link>
        </nav>
        <div style={{ padding: "2rem", maxWidth: 960, margin: "0 auto" }}>{children}</div>
      </body>
    </html>
  );
}
