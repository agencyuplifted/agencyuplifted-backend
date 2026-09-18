import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Dein Seminar", template: "%s · AgencyUplifted" },
  robots: { index: false, follow: false },
};

// Persoenliche Seiten fuer Seminar-Teilnehmer (Links aus den Funnel-Mails).
// Eigenes schlankes Layout, keine Backstage-Navigation.
export default function SeminarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ua-app">
      <header className="ua-kopf">
        <span className="ua-marke"><span className="ua-marke-zeichen">AU</span> AgencyUplifted</span>
      </header>
      <div className="ua-inhalt" style={{ maxWidth: 760 }}>{children}</div>
      <footer className="ua-fuss">AgencyUplifted · persönlicher Link – bitte nicht weitergeben</footer>
    </div>
  );
}
