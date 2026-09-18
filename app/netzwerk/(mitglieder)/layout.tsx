import Link from "next/link";
import { requireMitglied } from "@/lib/netzwerk";
import { abmelden } from "@/lib/netzwerk-actions";

export const dynamic = "force-dynamic";

// Alles hier drin nur fuer AKTIVE Mitglieder (requireMitglied leitet sonst zu
// Login bzw. Willkommen um). Die Daten selbst kommen zusaetzlich durch RLS.
export default async function MitgliederLayout({ children }: { children: React.ReactNode }) {
  await requireMitglied();
  return (
    <>
      <nav className="ua-nav">
        <Link href="/netzwerk">Verzeichnis</Link>
        <Link href="/netzwerk/gesuche">Gesuche &amp; Angebote</Link>
        <Link href="/netzwerk/einstellungen">Mein Profil</Link>
        <form action={abmelden} style={{ marginLeft: "auto" }}>
          <button type="submit" className="ua-link">Abmelden</button>
        </form>
      </nav>
      {children}
    </>
  );
}
