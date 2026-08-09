"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Spiegelt bewusst 1:1 den Header der Haupt-Marketingseite
// (agencyuplifted.com, dahinter die Onepage-Seite), damit Wissen-Seiten und
// Marketingseite wie aus einem Guss wirken -- gleiches Logo, gleiche
// Nav-Punkte, gleiche Schrift (Archivo) und Farben. "Start"/"Preisfindung"/
// "Blog" sind echte, funktionierende Links. "Leistungen" (Dropdown),
// "Ueber uns", "Branchen", "Karriere" und der CTA-Button sind technisch 1:1
// nachgebaut, zeigen auf der Onepage-Seite aber selbst noch auf onepage.io
// (Platzhalter des Baukastens, noch nicht von Markus final verlinkt) -- hier
// daher bewusst mit "#" als Platzhalter-Ziel, damit die Struktur steht und
// nur noch die echten URLs eingetragen werden muessen, sobald sie feststehen.
//
// Hinweis: agencyuplifted.com zeigt aktuell komplett auf die Onepage-Seite;
// /wissen ist dort (Stand jetzt) noch NICHT durchgereicht (liefert Onepages
// eigene 404-Seite). Diese Links funktionieren trotzdem unabhaengig davon,
// da sie extern auf agencyuplifted.com verweisen, nicht auf einen /wissen-Pfad.
const NAV_LINKS = [
  { href: "https://agencyuplifted.com/", label: "Start", extern: true },
  {
    href: "https://agencyuplifted.com/seminare-preisfindung",
    label: "Preisfindung",
    extern: true,
  },
  { href: "/wissen", label: "Blog", extern: false },
];

// 1:1 aus dem Leistungen-Dropdown auf onepage.me uebernommen (dort ebenfalls
// noch mit Platzhalter-Titeln "Erster/Zweiter/Dritter/Vierter Service").
const LEISTUNGEN_ITEMS = [
  { href: "#", label: "Erster Service" },
  { href: "#", label: "Zweiter Service" },
  { href: "#", label: "Dritter Service" },
  { href: "#", label: "Vierter Service" },
];

const PLATZHALTER_LINKS = [
  { href: "#", label: "Über uns" },
  { href: "#", label: "Branchen" },
  { href: "#", label: "Karriere" },
];

function PlatzhalterHinweis(e: React.MouseEvent<HTMLAnchorElement>) {
  // Verhindert Sprung nach oben bei href="#" -- das Ziel ist noch nicht final.
  e.preventDefault();
}

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
                    title="Platzhalter – noch nicht final verlinkt"
                    onClick={PlatzhalterHinweis}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {PLATZHALTER_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="wp-nav-link"
              title="Platzhalter – noch nicht final verlinkt"
              onClick={PlatzhalterHinweis}
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
            href="#"
            className="wp-cta-button"
            title="Platzhalter – noch nicht final verlinkt"
            onClick={PlatzhalterHinweis}
          >
            Call-to-Action
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
                  title="Platzhalter – noch nicht final verlinkt"
                  onClick={PlatzhalterHinweis}
                >
                  {item.label}
                </a>
              ))}
            </div>
          )}

          {PLATZHALTER_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="wp-nav-mobile-link"
              title="Platzhalter – noch nicht final verlinkt"
              onClick={PlatzhalterHinweis}
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
            href="#"
            className="wp-cta-button wp-cta-button-mobile"
            title="Platzhalter – noch nicht final verlinkt"
            onClick={PlatzhalterHinweis}
          >
            Call-to-Action
          </a>
        </nav>
      )}
    </header>
  );
}
