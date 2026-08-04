"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/actions";

type NavLink = { href: string; label: string };
type NavGroup = { title?: string; links: NavLink[] };

const GROUPS: NavGroup[] = [
  { links: [{ href: "/dashboard", label: "Dashboard" }] },
  {
    title: "Verwaltung",
    links: [
      { href: "/termine", label: "Termine" },
      { href: "/teilnehmer", label: "Teilnehmer" },
      { href: "/organisationen", label: "Organisationen" },
      { href: "/buchungen", label: "Buchungen" },
      { href: "/referenzen", label: "Referenzen" },
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
      { href: "/email-test", label: "E-Mail-Test" },
    ],
  },
];

export default function Sidebar({ benutzerName }: { benutzerName?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="au-sidebar">
      <Link href="/dashboard" className="au-sidebar-brand">AgencyUplifted</Link>

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
  );
}
