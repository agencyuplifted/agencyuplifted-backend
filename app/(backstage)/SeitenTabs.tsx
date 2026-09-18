"use client";

import { useEffect, useState, type ReactNode } from "react";

export type SeitenTab = { key: string; label: string; anzahl?: number | null; warnung?: boolean; inhalt: ReactNode };

// Tabs fuer Detailseiten (Termin, Teilnehmer, ...). Alle Tab-Inhalte werden serverseitig gerendert
// und bleiben im DOM (nur versteckt) -- dadurch funktionieren die vielen
// bestehenden Server-Action-Formulare unveraendert. Der aktive Tab steht im
// URL-Hash und zusaetzlich pro Seite in der sessionStorage: viele Actions
// leiten nach dem Speichern auf dieselbe Seite ohne Hash um, und man soll dann
// nicht jedes Mal wieder auf "Uebersicht" landen.
export default function SeitenTabs({ speicherSchluessel, tabs, ariaLabel = "Bereiche" }: { speicherSchluessel: string; tabs: SeitenTab[]; ariaLabel?: string }) {
  const [aktiv, setAktiv] = useState(tabs[0].key);
  const speicher = `au-tab-${speicherSchluessel}`;

  useEffect(() => {
    const ausHash = () => {
      const h = window.location.hash.replace("#", "");
      if (tabs.some((t) => t.key === h)) return h;
      try {
        const s = sessionStorage.getItem(speicher);
        if (s && tabs.some((t) => t.key === s)) return s;
      } catch {}
      return tabs[0].key;
    };
    setAktiv(ausHash());
    const beiHash = () => {
      const h = window.location.hash.replace("#", "");
      if (tabs.some((t) => t.key === h)) {
        setAktiv(h);
        try { sessionStorage.setItem(speicher, h); } catch {}
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener("hashchange", beiHash);
    return () => window.removeEventListener("hashchange", beiHash);
    // tabs aendern sich zwischen Renders nur im Inhalt, nicht in den Keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speicher]);

  function waehle(key: string) {
    setAktiv(key);
    try { sessionStorage.setItem(speicher, key); } catch {}
    history.replaceState(null, "", `#${key}`);
  }

  return (
    <>
      <nav className="au-seitentabs au-termin-tabs" role="tablist" aria-label={ariaLabel}>
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`#${t.key}`}
            role="tab"
            aria-selected={aktiv === t.key}
            className={aktiv === t.key ? "aktiv" : ""}
            onClick={(e) => {
              e.preventDefault();
              waehle(t.key);
            }}
          >
            {t.label}
            {t.anzahl != null && <span className="au-tab-zahl">{t.anzahl}</span>}
            {t.warnung && <span className="au-tab-warnung" title="Hier gibt es etwas zu prüfen">!</span>}
          </a>
        ))}
      </nav>
      {tabs.map((t) => (
        <section key={t.key} role="tabpanel" hidden={aktiv !== t.key} aria-label={t.label}>
          {t.inhalt}
        </section>
      ))}
    </>
  );
}
