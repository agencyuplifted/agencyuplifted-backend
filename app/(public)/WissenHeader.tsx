"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Spiegelt optisch den Header der Haupt-Marketingseite (agencyuplifted.com,
// dahinter Onepage), damit Wissen-Seiten und Marketingseite wie aus einem Guss
// wirken -- gleiches Logo, gleiche Schrift (Archivo) und Farben. Die Nav-Punkte
// waren urspruenglich 1:1 aus der Onepage-Vorlage kopiert ("Erster Service",
// "Ueber uns", "Branchen", "Karriere", "Call-to-Action", alle mit "#") und
// sind jetzt auf die tatsaechlich existierenden Onepage-Seiten verlinkt.
// Neue Ziele immer gegen die veroeffentlichten Seiten der Onepage-Site
// pruefen -- /seminare-preisfindung z.B. war ein falscher Slug.
const NAV_LINKS = [
  { href: "https://agencyuplifted.com/", label: "Start", extern: true },
  {
    href: "https://agencyuplifted.com/seminar-wertorientierte-preisfindung",
    label: "Preisfindung",
    extern: true,
  },
  { href: "/wissen", label: "Blog", extern: false },
];

const LEISTUNGEN_ITEMS = [
  { href: "https://agencyuplifted.com/seminare", label: "Alle Seminare" },
  { href: "https://agencyuplifted.com/seminar-wertorientierte-preisfindung", label: "Wertorientierte Preisfindung" },
  { href: "https://agencyuplifted.com/seminar-fokussierung-kundengewinnung-und-vertrieb", label: "Fokussierung und Kundengewinnung" },
  { href: "https://agencyuplifted.com/seminar-fuhrung-fur-agenturunternehmer", label: "Führung für Agenturunternehmer" },
];

const ANGEBOT_LINKS = [
  { href: "https://agencyuplifted.com/training", label: "Training" },
  { href: "https://agencyuplifted.com/coaching", label: "Coaching" },
  { href: "https://agencyuplifted.com/buch-preisfindung-in-agenturen", label: "Buch" },
];

const KONTAKT_URL = "https://agencyuplifted.com/kontakt";

export default function WissenHeader() {
  const [offen, setOffen] = useState(false);
  const [leistungenOffen, setLeistungenOffen] = useState(false);
  const [mobileLeistungenOffen, setMobileLeistungenOffen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!leistungenOffen) return;
    function schliesseBeiAussenklick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLeistungenOffen(false);
      }
    }
    function schliesseBeiEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setLeistungenOffen(false);
    }
    document.addEventListener("mousedown", schliesseBeiAussenklick);
    document.addEventListener("keydown", schliesseBeiEscape);
    return () => {
      document.removeEventListener("mousedown", schliesseBeiAussenklick);
      document.removeEventListener("keydown", schliesseBeiEscape);
    };
  }, [leistungenOffen]);

  return (
    <header className="wp-header">
      <div className="wp-header-inner">
        <a href="https://agencyuplifted.com/" className="wp-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://onecdn.io/media/cd724ffc-e672-4e72-b6d4-5a217d1249ec/full"
            alt="AgencyUplifted"
            className="wp-logo-img"
          />
        </a>

        <nav className="wp-nav-links" aria-label="Hauptnavigation">
          <div className="wp-nav-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className="wp-nav-link wp-nav-dropdown-trigger"
              aria-expanded={leistungenOffen}
              onClick={() => setLeistungenOffen((o) => !o)}
            >
              Leistungen
              <span className={`wp-nav-caret ${leistungenOffen ? "wp-nav-caret-offen" : ""}`} />
            </button>
            {leistungenOffen && (
              <div className="wp-nav-dropdown-panel" role="menu">
                {LEISTUNGEN_ITEMS.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="wp-nav-dropdown-item"
                    role="menuitem"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {ANGEBOT_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="wp-nav-link"
            >
              {item.label}
            </a>
          ))}

          {NAV_LINKS.map((item) =>
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

        <div className="wp-header-actions">
          <a
            href={KONTAKT_URL}
            className="wp-cta-button"
          >
            Kontakt
          </a>

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
      </div>

      {offen && (
        <nav className="wp-nav-mobile" aria-label="Mobile Navigation">
          <button
            type="button"
            className="wp-nav-mobile-link wp-nav-mobile-accordion-trigger"
            aria-expanded={mobileLeistungenOffen}
            onClick={() => setMobileLeistungenOffen((o) => !o)}
          >
            Leistungen
            <span
              className={`wp-nav-caret ${mobileLeistungenOffen ? "wp-nav-caret-offen" : ""}`}
            />
          </button>
          {mobileLeistungenOffen && (
            <div className="wp-nav-mobile-sub">
              {LEISTUNGEN_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="wp-nav-mobile-sub-link"
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}

          {ANGEBOT_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="wp-nav-mobile-link"
            >
              {item.label}
            </a>
          ))}

          {NAV_LINKS.map((item) =>
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

          <a
            href={KONTAKT_URL}
            className="wp-cta-button wp-cta-button-mobile"
          >
            Kontakt
          </a>
        </nav>
      )}
    </header>
  );
}
