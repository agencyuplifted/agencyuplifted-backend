import Link from "next/link";
import { getAktuellerBenutzer } from "@/lib/auth";
import { logoutAction } from "@/lib/actions";
import "./globals.css";

export const metadata = { title: "AgencyUplifted Backend" };

const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/termine", label: "Termine" },
  { href: "/teilnehmer", label: "Teilnehmer" },
  { href: "/organisationen", label: "Organisationen" },
  { href: "/buchungen", label: "Buchungen" },
  { href: "/warteliste", label: "Warteliste" },
  { href: "/trainer", label: "Trainer" },
  { href: "/mitarbeiter", label: "Mitarbeiter" },
  { href: "/orte", label: "Orte" },
  { href: "/community", label: "Community" },
  { href: "/leads", label: "Leads" },
  { href: "/funnel", label: "Funnel-Mails" },
  { href: "/email-test", label: "E-Mail-Test" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await getAktuellerBenutzer();

  return (
    <html lang="de">
      <body>
        <nav className="au-nav">
          <Link href="/" className="au-nav-brand">AgencyUplifted</Link>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="au-nav-link">{l.label}</Link>
          ))}
          {benutzer && (
            <span className="au-nav-spacer">
              <span className="au-nav-user">Eingeloggt als {benutzer.name}</span>
              <form action={logoutAction}>
                <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Abmelden</button>
              </form>
            </span>
          )}
        </nav>
        <div className="au-container">{children}</div>
      </body>
    </html>
  );
}
