import Link from "next/link";

// Unterpunkte des Terminverzeichnisses: der Planer ist die Vorstufe, deshalb
// hier als Reiter statt als eigener Navigationspunkt.
export default function TermineNav({ aktiv }: { aktiv: "termine" | "planer" }) {
  return (
    <nav className="au-seitentabs au-termine-nav" aria-label="Termine">
      <Link href="/termine" className={aktiv === "termine" ? "aktiv" : undefined} aria-current={aktiv === "termine" ? "page" : undefined}>
        Kalender &amp; Liste
      </Link>
      <Link href="/termine/planer" className={aktiv === "planer" ? "aktiv" : undefined} aria-current={aktiv === "planer" ? "page" : undefined}>
        Terminplaner
      </Link>
    </nav>
  );
}
