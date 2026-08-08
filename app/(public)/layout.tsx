import Link from "next/link";
import "./wissen.css";

// Schlankes, eigenstaendiges Layout fuer den oeffentlichen Wissen-Bereich --
// bewusst OHNE Backstage-Sidebar/au-container (siehe app/(backstage)/layout.tsx
// fuer den Admin-Bereich). Kein Login noetig, keine Benutzerabfrage.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wp-shell">
      <header className="wp-header">
        <div className="wp-header-inner">
          <Link href="/wissen" className="wp-brand">
            AgencyUplifted
            <span className="wp-brand-sub">Wissen</span>
          </Link>
        </div>
      </header>
      <main className="wp-main">{children}</main>
      <footer className="wp-footer">
        <div className="wp-footer-inner">
          <span>
            © {new Date().getFullYear()} –{" "}
            {/* Zeigt aktuell auf agencyuplifted.de, da www.agencyuplifted.com
                noch nicht auf die Website geschaltet ist (siehe Backlog-Task
                "Eigene Domain + Cloudflare-CDN vor Onepage-Seite schalten"). */}
            <a href="https://www.agencyuplifted.de" className="wp-footer-brand">
              AgencyUplifted
            </a>
          </span>
          <nav className="wp-footer-links">
            <a href="https://www.agencyuplifted.de/impressum">Impressum</a>
            <a href="https://www.agencyuplifted.de/datenschutz">Datenschutz</a>
            <a href="https://www.agencyuplifted.de/agb">AGB</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
