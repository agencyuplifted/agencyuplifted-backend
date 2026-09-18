import { notFound } from "next/navigation";
import { ladeAbmeldeEmpfaenger, istAbgemeldet } from "@/lib/abmelden";
import { bestaetigeAbmeldung } from "@/lib/abmelden-actions";
import NetzwerkFormular from "../../netzwerk/NetzwerkFormular";

export const dynamic = "force-dynamic";
export const metadata = { title: "Abmelden · AgencyUplifted", robots: { index: false, follow: false } };

export default async function AbmeldenSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const empf = await ladeAbmeldeEmpfaenger(token);
  if (!empf) notFound();
  const schon = await istAbgemeldet(empf.email);
  // Adresse nur teilweise zeigen -- der Link kann weitergeleitet worden sein
  const [lokal, domain] = empf.email.split("@");
  const maskiert = `${lokal.slice(0, 2)}…@${domain}`;
  return (
    <div className="ua-app">
      <header className="ua-kopf">
        <span className="ua-marke"><span className="ua-marke-zeichen">AU</span> AgencyUplifted</span>
      </header>
      <div className="ua-inhalt" style={{ maxWidth: 560 }}>
        <div className="ua-karte">
          <h2 style={{ marginTop: 0 }}>{schon ? "Du bist abgemeldet" : "Von unseren Mails abmelden"}</h2>
          {schon ? (
            <p>Für {maskiert} verschicken wir keine automatischen Mails mehr. Wenn du es dir anders überlegst, antworte einfach auf eine unserer Mails.</p>
          ) : (
            <>
              <p>
                {empf.vorname ? `Hallo ${empf.vorname}, ` : ""}möchtest du für {maskiert} keine automatischen Mails mehr von AgencyUplifted bekommen
                (Erinnerungen, Infos rund ums Seminar, Newsletter)?
              </p>
              <NetzwerkFormular action={bestaetigeAbmeldung}>
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="au-btn au-btn-primary">Ja, abmelden</button>
              </NetzwerkFormular>
              <p className="ua-klein">Rechnungen und direkte Antworten auf deine Anfragen bekommst du natürlich weiterhin.</p>
            </>
          )}
        </div>
      </div>
      <footer className="ua-fuss">AgencyUplifted</footer>
    </div>
  );
}
