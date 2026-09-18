import type { Metadata } from "next";
import Link from "next/link";
import { NETZWERK_NAME } from "@/lib/netzwerk";

export const metadata: Metadata = {
  title: { default: NETZWERK_NAME, template: `%s · ${NETZWERK_NAME}` },
  appleWebApp: { capable: true, title: NETZWERK_NAME, statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

// Eigenes Erscheinungsbild fuer das Mitgliedernetzwerk -- bewusst NICHT die
// Backstage-Sidebar. Laeuft technisch noch unter der Backstage-Domain, soll
// sich aber wie ein eigenes Produkt anfuehlen (spaeter upliftedagencies.com).
export default function NetzwerkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ua-app">
      <header className="ua-kopf">
        <Link href="/netzwerk" className="ua-marke" prefetch={false}>
          <span className="ua-marke-zeichen">UA</span> {NETZWERK_NAME}
        </Link>
      </header>
      <div className="ua-inhalt">{children}</div>
      <footer className="ua-fuss">Ein Angebot von Agency Uplifted</footer>
    </div>
  );
}
