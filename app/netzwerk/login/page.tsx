import { fordereLoginLinkAn } from "@/lib/netzwerk-actions";
import { NETZWERK_NAME } from "@/lib/netzwerk";
import NetzwerkFormular from "../NetzwerkFormular";

export const metadata = { title: "Anmelden" };

export default function NetzwerkLoginPage() {
  return (
    <div className="ua-karte ua-schmal">
      <h1 style={{ marginBottom: "0.5rem" }}>Anmelden</h1>
      <p style={{ marginTop: 0 }}>
        {NETZWERK_NAME} ist ein privates Netzwerk für Agenturunternehmer aus den Agency-Uplifted-Seminaren. Gib deine E-Mail-Adresse ein – du bekommst einen Anmelde-Link, ganz ohne Passwort.
      </p>
      <NetzwerkFormular action={fordereLoginLinkAn}>
        <label className="au-label" htmlFor="email">E-Mail-Adresse</label>
        <input className="au-input" id="email" name="email" type="email" autoComplete="email" required />
        <button type="submit" className="au-btn au-btn-primary" style={{ width: "100%" }}>Anmelde-Link schicken</button>
      </NetzwerkFormular>
    </div>
  );
}
