"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions";

type NavLink = { href: string; label: string };
type NavGroup = { title?: string; links: NavLink[] };

const GROUPS: NavGroup[] = [
  { links: [{ href: "/dashboard", label: "Dashboard" }] },
  { links: [{ href: "/insights", label: "Insights" }] },
  {
    title: "Verwaltung",
    links: [
      { href: "/termine", label: "Termine" },
      { href: "/teilnehmer", label: "Teilnehmer" },
      { href: "/organisationen", label: "Organisationen" },
      { href: "/buchungen", label: "Buchungen" },
      { href: "/buchungen/alte-seminare", label: "Alte Seminare zuordnen" },
      { href: "/referenzen", label: "Referenzen" },
      { href: "/seminartypen", label: "Seminarkategorien & Farben" },
    ],
  },
  {
    title: "Vertrieb",
    links: [
      { href: "/leads", label: "Leads" },
      { href: "/warteliste", label: "Warteliste" },
    ],
  },
  {
    title: "Personal",
    links: [
      { href: "/trainer", label: "Trainer" },
      { href: "/mitarbeiter", label: "Mitarbeiter" },
      { href: "/orte", label: "Orte" },
    ],
  },
  {
    title: "Kommunikation",
    links: [
      { href: "/community", label: "Community" },
      { href: "/funnel", label: "Funnel-Mails" },
      { href: "/kampagnen", label: "Kampagnen" },
      { href: "/email-test", label: "E-Mail-Test" },
    ],
  },
  {
    title: "Marketing",
    links: [
      { href: "/content-creation", label: "Content Creation" },
      { href: "/buch-versand", label: "Buch-Versand" },
      { href: "/buch-empfaenger", label: "Buch-Empfänger" },
    ],
  },
];

export default function Sidebar({ benutzerName }: { benutzerName?: string | null }) {
  const pathname = usePathname();
  const [mobileOffen, setMobileOffen] = useState(false);

  useEffect(() => {
    setMobileOffen(false);
  }, [pathname]);

  return (
    <>
      <div className="au-mobile-topbar">
        <button
          type="button"
          className="au-mobile-menu-btn"
          onClick={() => setMobileOffen((v) => !v)}
          aria-label="Menü öffnen"
        >
          ☰
        </button>
        <span className="au-mobile-topbar-title">AgencyUplifted</span>
      </div>

      {mobileOffen && <div className="au-mobile-overlay" onClick={() => setMobileOffen(false)} />}

      <aside className={`au-sidebar ${mobileOffen ? "au-sidebar-open" : ""}`}>
        {/* prefetch={false}: Next.js prefetcht sonst ALLE sichtbaren Sidebar-Links
            gleichzeitig bei jedem Seitenaufruf -- bei 17 Verwaltungsseiten mit
            jeweils mehreren DB-Abfragen ergab das einen Burst von 15-20+
            gleichzeitigen serverseitigen Renders, der zu sporadischen 503-Fehlern
            fuehrte (auch auf Seiten, die man gar nicht angeklickt hat). Da dies ein
            internes Tool ist, bringt Prefetching kaum etwas -- der Klick selbst ist
            schnell genug. */}
        <Link href="/dashboard" className="au-sidebar-brand" prefetch={false}>AgencyUplifted</Link>

        {GROUPS.map((group, i) => (
          <div className="au-sidebar-group" key={group.title || i}>
            {group.title && <div className="au-sidebar-group-title">{group.title}</div>}
            {group.links.map((l) => {
              const aktiv = pathname === l.href || pathname?.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`au-sidebar-link ${aktiv ? "au-sidebar-link-active" : ""}`}
                  prefetch={false}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}

        {benutzerName && (
          <div className="au-sidebar-footer">
            <div className="au-sidebar-user">Eingeloggt als {benutzerName}</div>
            <form action={logoutAction} style={{ padding: "0 0.6rem" }}>
              <button type="submit" className="au-btn au-btn-secondary au-btn-sm" style={{ width: "100%" }}>
                Abmelden
              </button>
            </form>
          </div>
        )}
      </aside>
    </>
  );
}
