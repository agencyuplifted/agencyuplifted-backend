"use client";

import { useState } from "react";
import Link from "next/link";

// Spiegelt bewusst 1:1 den Header der Haupt-Marketingseite
// (agencyuplifted-seminare.onepage.me), damit Wissen-Seiten und Onepage-Seite
// wie aus einem Guss wirken -- gleiches Logo, gleiche Nav-Punkte, gleiche
// Schrift (Archivo) und Farben. "Start"/"Preisfindung" fuehren bewusst
// zurueck auf die Onepage-Seite (dort liegt die eigentliche Marketingseite),
// "Blog" bleibt intern auf /wissen, da das hier der aktuelle Bereich ist.
const NAV_ITEMS = [
  { href: "https://agencyuplifted-seminare.onepage.me/", label: "Start", extern: true },
  {
    href: "https://agencyuplifted-seminare.onepage.me/seminare-preisfindung",
    label: "Preisfindung",
    extern: true,
  },
  { href: "/wissen", label: "Blog", extern: false },
];

export default function WissenHeader() {
  const [offen, setOffen] = useState(false);

  return (
    <header className="wp-header">
      <div className="wp-header-inner">
        <a href="https://agencyuplifted-seminare.onepage.me/" className="wp-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://onecdn.io/media/cd724ffc-e672-4e72-b6d4-5a217d1249ec/full"
            alt="AgencyUplifted"
            className="wp-logo-img"
          />
        </a>

        <nav className="wp-nav-links" aria-label="Hauptnavigation">
          {NAV_ITEMS.map((item) =>
            item.extern ? (
              <a key={item.href} href={item.href} className="wp-nav-link">
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className="wp-nav-link">
                {item.label}
              </Link>
            )
          )}
        </nav>

        <button
          type="button"
          className="wp-nav-toggle"
          aria-label={offen ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={offen}
          onClick={() => setOffen((o) => !o)}
        >
          <span className="wp-nav-toggle-bar" />
          <span className="wp-nav-toggle-bar" />
          <span className="wp-nav-toggle-bar" />
        </button>
      </div>

      {offen && (
        <nav className="wp-nav-mobile" aria-label="Mobile Navigation">
          {NAV_ITEMS.map((item) =>
            item.extern ? (
              <a key={item.href} href={item.href} className="wp-nav-mobile-link">
                {item.label}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="wp-nav-mobile-link"
                onClick={() => setOffen(false)}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
      )}
    </header>
  );
}
