import { Archivo, Public_Sans } from "next/font/google";
import PremiumUpdatesBar from "./PremiumUpdatesBar";
import WissenHeader from "./WissenHeader";
import "./wissen.css";

// Dieselben Google Fonts wie die Haupt-Marketingseite (onepage.me): Archivo
// fuer Nav/Ueberschriften, Public Sans fuer Fliesstext -- als CSS-Variablen
// nur auf den .wp-shell-Bereich angewendet, damit das Backstage-Systemfont
// unangetastet bleibt.
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-archivo" });
const publicSans = Public_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-public-sans" });

// Schlankes, eigenstaendiges Layout fuer den oeffentlichen Wissen-Bereich --
// bewusst OHNE Backstage-Sidebar/au-container (siehe app/(backstage)/layout.tsx
// fuer den Admin-Bereich). Kein Login noetig, keine Benutzerabfrage.
// Der Header spiegelt bewusst 1:1 den Header von agencyuplifted-seminare.onepage.me
// (Logo, Nav, Schrift, Farben, Hamburger-Menu), damit beide Domains wie aus
// einem Guss wirken.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`wp-shell ${archivo.variable} ${publicSans.variable}`}>
      <PremiumUpdatesBar />
      <WissenHeader />
      <main className="wp-main">{children}</main>
      <footer className="wp-footer">
        <div className="wp-footer-inner">
          <span>
            © {new Date().getFullYear()} –{" "}
            <a href="https://agencyuplifted.com/" className="wp-footer-brand">
              AgencyUplifted
            </a>
          </span>
          <nav className="wp-footer-links">
            <a href="https://agencyuplifted.com/impressum">Impressum</a>
            {/* Datenschutz und AGB gibt es auf agencyuplifted.com (Onepage) noch
                nicht als eigene Seite -- bis dahin bleiben die .de-Seiten das
                Ziel, damit die Pflichtlinks nicht ins Leere laufen. */}
            <a href="https://www.agencyuplifted.de/datenschutz">Datenschutz</a>
            <a href="https://www.agencyuplifted.de/agb">AGB</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
