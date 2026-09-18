import Link from "next/link";
import { bestaetigeAnmeldung } from "@/lib/netzwerk-actions";
import NetzwerkFormular from "../../NetzwerkFormular";

export const metadata = { title: "Anmeldung bestätigen" };

// Bewusst ein Klick statt automatischer Anmeldung beim Aufruf: Mail-Scanner
// oeffnen Links vorab und wuerden den Einmal-Token sonst verbrauchen.
export default async function BestaetigenPage({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type } = await searchParams;
  if (!token_hash || !type) {
    return (
      <div className="ua-karte ua-schmal">
        <h1>Link unvollständig</h1>
        <p>Bitte öffne den Link direkt aus der E-Mail oder <Link href="/netzwerk/login">fordere einen neuen an</Link>.</p>
      </div>
    );
  }
  return (
    <div className="ua-karte ua-schmal" style={{ textAlign: "center" }}>
      <h1>Willkommen!</h1>
      <p>Ein Klick noch, dann bist du angemeldet.</p>
      <NetzwerkFormular action={bestaetigeAnmeldung}>
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <button type="submit" className="au-btn au-btn-primary" style={{ width: "100%" }}>Jetzt anmelden</button>
      </NetzwerkFormular>
      <p className="ua-klein" style={{ marginTop: "1rem" }}>Link abgelaufen? <Link href="/netzwerk/login">Neuen Link anfordern</Link></p>
    </div>
  );
}
