"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/lib/actions";

// Navigation der Backstage. Aufbau nach dem ueblichen Muster fuer
// Admin-Oberflaechen: das Taegliche ganz oben (ohne Klappen), darunter wenige
// aufklappbare Bereiche mit Icon, Seltenes (Stammdaten/Abgleiche/Technik)
// gebuendelt und standardmaessig zu, plus Schnellsuche (Cmd/Strg+K) ueber
// alle Seiten. Vorher waren es 7 Gruppen mit 30 gleichrangigen Links.

type NavLink = { href: string; label: string; stichworte?: string };
type IconName = "home" | "clock" | "inbox" | "calendar" | "network" | "megaphone" | "mail" | "settings";
type NavBereich = { key: string; titel: string; icon: IconName; links: NavLink[]; standardOffen?: boolean };

const SCHNELLZUGRIFF: (NavLink & { icon: IconName })[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/wiedervorlage", label: "Wiedervorlage", icon: "clock", stichworte: "fällig aufgaben erinnerungen kalender" },
  { href: "/inbox", label: "Ideen-Inbox", icon: "inbox", stichworte: "ideen themen notizen" },
];

const BEREICHE: NavBereich[] = [
  {
    key: "seminare",
    titel: "Seminare",
    icon: "calendar",
    standardOffen: true,
    links: [
      { href: "/termine", label: "Termine", stichworte: "seminartermine optionen preise" },
      { href: "/buchungen", label: "Buchungen" },
      { href: "/teilnehmer", label: "Teilnehmer" },
      { href: "/organisationen", label: "Organisationen", stichworte: "agenturen firmen" },
      { href: "/warteliste", label: "Warteliste" },
      { href: "/leads", label: "Leads", stichworte: "interessenten" },
    ],
  },
  {
    key: "netzwerk",
    titel: "Netzwerk",
    icon: "network",
    links: [
      { href: "/netzwerk-einladen", label: "Uplifted Agencies", stichworte: "netzwerk pilotkreis einladen vormerkliste" },
      { href: "/kontakte", label: "Kontakte" },
      { href: "/events", label: "Events", stichworte: "konferenzen cfp" },
    ],
  },
  {
    key: "marketing",
    titel: "Marketing & Inhalte",
    icon: "megaphone",
    links: [
      { href: "/insights", label: "Insights", stichworte: "wissen blog artikel" },
      { href: "/content-creation", label: "Content Creation", stichworte: "themen radar" },
      { href: "/buch-versand", label: "Buch-Versand" },
      { href: "/buch-empfaenger", label: "Buch-Empfänger" },
    ],
  },
  {
    key: "kommunikation",
    titel: "Kommunikation",
    icon: "mail",
    links: [
      { href: "/funnel", label: "Funnel-Mails" },
      { href: "/kampagnen", label: "Kampagnen", stichworte: "newsletter mailing" },
      { href: "/geburtstage", label: "Geburtstage" },
      { href: "/community", label: "Community" },
    ],
  },
  {
    key: "verwaltung",
    titel: "Verwaltung",
    icon: "settings",
    links: [
      { href: "/seminartypen", label: "Seminarkategorien & Farben" },
      { href: "/preisstaffel-vorlagen", label: "Preisstaffel-Vorlagen" },
      { href: "/trainer", label: "Trainer" },
      { href: "/orte", label: "Orte", stichworte: "hotels veranstaltungsorte" },
      { href: "/referenzen", label: "Referenzen" },
      { href: "/buchungen/alte-seminare", label: "Alte Seminare zuordnen", stichworte: "legacy" },
      { href: "/buchungen/fastbill", label: "FastBill-Abgleich", stichworte: "rechnungen" },
      { href: "/redirects", label: "Weiterleitungen" },
      { href: "/email-test", label: "E-Mail-Test" },
      { href: "/mitarbeiter", label: "Mitarbeiter" },
      { href: "/einstellungen", label: "Einstellungen" },
    ],
  },
];

const ALLE_LINKS: (NavLink & { bereich: string })[] = [
  ...SCHNELLZUGRIFF.map((l) => ({ ...l, bereich: "Schnellzugriff" })),
  ...BEREICHE.flatMap((b) => b.links.map((l) => ({ ...l, bereich: b.titel }))),
];

// Laengster passender Pfad gewinnt -- sonst waere bei /buchungen/fastbill
// auch "Buchungen" markiert.
function aktiverHref(pathname: string | null): string | null {
  if (!pathname) return null;
  let bester: string | null = null;
  for (const l of ALLE_LINKS) {
    if ((pathname === l.href || pathname.startsWith(l.href + "/")) && (!bester || l.href.length > bester.length)) bester = l.href;
  }
  return bester;
}

const SPEICHER_SCHLUESSEL = "au-nav-offen";

function Icon({ name }: { name: IconName }) {
  const pfade: Record<IconName, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    inbox: (<><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></>),
    calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
    network: (<><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M10.8 7.2 6.2 15.8M13.2 7.2l4.6 8.6M7.5 18h9" /></>),
    megaphone: (<><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" /></>),
    mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
    settings: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>),
  };
  return (
    <svg className="au-nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {pfade[name]}
    </svg>
  );
}

function Schnellsuche({ offen, schliessen }: { offen: boolean; schliessen: () => void }) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [markiert, setMarkiert] = useState(0);
  const eingabe = useRef<HTMLInputElement>(null);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return ALLE_LINKS;
    return ALLE_LINKS.filter((l) => `${l.label} ${l.bereich} ${l.stichworte || ""}`.toLowerCase().includes(q));
  }, [suche]);

  useEffect(() => {
    if (offen) {
      setSuche("");
      setMarkiert(0);
      setTimeout(() => eingabe.current?.focus(), 0);
    }
  }, [offen]);
  useEffect(() => setMarkiert(0), [suche]);

  if (!offen) return null;

  function oeffnen(href: string) {
    schliessen();
    router.push(href);
  }

  return (
    <div className="au-suche-overlay" onMouseDown={schliessen}>
      <div className="au-suche" role="dialog" aria-modal="true" aria-label="Seite suchen" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={eingabe}
          className="au-suche-eingabe"
          placeholder="Seite suchen …"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setMarkiert((m) => Math.min(m + 1, treffer.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setMarkiert((m) => Math.max(m - 1, 0)); }
            else if (e.key === "Enter" && treffer[markiert]) { e.preventDefault(); oeffnen(treffer[markiert].href); }
            else if (e.key === "Escape") schliessen();
          }}
          aria-activedescendant={treffer[markiert] ? `suche-${treffer[markiert].href}` : undefined}
        />
        <ul className="au-suche-liste" role="listbox">
          {treffer.map((l, i) => (
            <li
              key={l.href}
              id={`suche-${l.href}`}
              role="option"
              aria-selected={i === markiert}
              className={i === markiert ? "aktiv" : ""}
              onMouseEnter={() => setMarkiert(i)}
              onClick={() => oeffnen(l.href)}
            >
              <span>{l.label}</span>
              <span className="au-suche-bereich">{l.bereich}</span>
            </li>
          ))}
          {!treffer.length && <li className="au-suche-leer">Keine Seite gefunden.</li>}
        </ul>
        <div className="au-suche-hinweis">↑↓ auswählen · Enter öffnen · Esc schließen</div>
      </div>
    </div>
  );
}

export default function Sidebar({ benutzerName }: { benutzerName?: string | null }) {
  const pathname = usePathname();
  const [mobileOffen, setMobileOffen] = useState(false);
  const [sucheOffen, setSucheOffen] = useState(false);
  const [offen, setOffen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BEREICHE.map((b) => [b.key, !!b.standardOffen]))
  );
  const [istMac, setIstMac] = useState(true);
  const aktiv = aktiverHref(pathname);
  const aktiverBereich = BEREICHE.find((b) => b.links.some((l) => l.href === aktiv))?.key;

  // Gespeicherten Klappzustand erst nach dem Mount lesen (sonst Hydration-Mismatch).
  useEffect(() => {
    try {
      const gespeichert = JSON.parse(localStorage.getItem(SPEICHER_SCHLUESSEL) || "null");
      if (gespeichert && typeof gespeichert === "object") setOffen((o) => ({ ...o, ...gespeichert }));
    } catch {}
    setIstMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  useEffect(() => {
    setMobileOffen(false);
    setSucheOffen(false);
  }, [pathname]);

  useEffect(() => {
    function taste(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSucheOffen((s) => !s);
      }
    }
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, []);

  function umschalten(key: string) {
    setOffen((o) => {
      const neu = { ...o, [key]: !o[key] };
      try {
        localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(neu));
      } catch {}
      return neu;
    });
  }

  return (
    <>
      <div className="au-mobile-topbar">
        <button type="button" className="au-mobile-menu-btn" onClick={() => setMobileOffen((v) => !v)} aria-label="Menü öffnen">
          ☰
        </button>
        <span className="au-mobile-topbar-title">AgencyUplifted</span>
        <button type="button" className="au-mobile-menu-btn" style={{ marginLeft: "auto" }} onClick={() => setSucheOffen(true)} aria-label="Seite suchen">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
      </div>

      {mobileOffen && <div className="au-mobile-overlay" onClick={() => setMobileOffen(false)} />}

      <aside className={`au-sidebar ${mobileOffen ? "au-sidebar-open" : ""}`}>
        {/* prefetch={false}: Next.js prefetcht sonst ALLE sichtbaren Sidebar-Links
            gleichzeitig bei jedem Seitenaufruf -- das ergab einen Burst von 15-20+
            gleichzeitigen serverseitigen Renders und sporadische 503-Fehler. Bei
            einem internen Tool bringt Prefetching kaum etwas. */}
        <Link href="/dashboard" className="au-sidebar-brand" prefetch={false}>AgencyUplifted</Link>

        <button type="button" className="au-nav-suche" onClick={() => setSucheOffen(true)}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span>Suchen …</span>
          <kbd>{istMac ? "⌘" : "Strg"} K</kbd>
        </button>

        <nav aria-label="Hauptnavigation" className="au-nav">
          <div className="au-nav-schnell">
            {SCHNELLZUGRIFF.map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} className={`au-sidebar-link au-nav-hauptlink ${aktiv === l.href ? "au-sidebar-link-active" : ""}`} aria-current={aktiv === l.href ? "page" : undefined}>
                <Icon name={l.icon} />
                {l.label}
              </Link>
            ))}
          </div>

          {BEREICHE.map((b) => {
            const istOffen = offen[b.key] || aktiverBereich === b.key;
            return (
              <div key={b.key} className="au-nav-bereich">
                <button
                  type="button"
                  className={`au-nav-bereich-kopf ${aktiverBereich === b.key ? "enthaelt-aktiv" : ""}`}
                  onClick={() => umschalten(b.key)}
                  aria-expanded={istOffen}
                  aria-controls={`nav-${b.key}`}
                >
                  <Icon name={b.icon} />
                  <span>{b.titel}</span>
                  <svg className={`au-nav-pfeil ${istOffen ? "offen" : ""}`} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </button>
                {istOffen && (
                  <div id={`nav-${b.key}`} className="au-nav-unterlinks">
                    {b.links.map((l) => (
                      <Link key={l.href} href={l.href} prefetch={false} className={`au-sidebar-link ${aktiv === l.href ? "au-sidebar-link-active" : ""}`} aria-current={aktiv === l.href ? "page" : undefined}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {benutzerName && (
          <div className="au-sidebar-footer">
            <div className="au-nav-benutzer">
              <span className="au-nav-avatar" aria-hidden="true">{benutzerName.trim().charAt(0).toUpperCase()}</span>
              <span className="au-nav-benutzer-name">{benutzerName}</span>
              <form action={logoutAction}>
                <button type="submit" className="au-nav-abmelden" title="Abmelden" aria-label="Abmelden">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" /></svg>
                </button>
              </form>
            </div>
          </div>
        )}
      </aside>

      <Schnellsuche offen={sucheOffen} schliessen={() => setSucheOffen(false)} />
    </>
  );
}
