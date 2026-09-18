import Link from "next/link";
import { speichereGesuch } from "@/lib/netzwerk-actions";
import NetzwerkFormular from "../../../NetzwerkFormular";

export const metadata = { title: "Neuer Eintrag" };

export default function NeuesGesuchPage() {
  return (
    <main>
      <p className="ua-klein" style={{ margin: "0 0 0.75rem" }}><Link href="/netzwerk/gesuche">← Gesuche &amp; Angebote</Link></p>
      <div className="ua-karte" style={{ maxWidth: 640 }}>
        <h1>Neuer Eintrag</h1>
        <NetzwerkFormular action={speichereGesuch}>
          <div style={{ display: "flex", gap: "1.25rem", marginBottom: "0.9rem" }}>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}><input type="radio" name="typ" value="gesuch" defaultChecked /> Ich suche</label>
            <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}><input type="radio" name="typ" value="angebot" /> Ich biete</label>
          </div>
          <label className="au-label" htmlFor="titel">Titel</label>
          <input className="au-input" id="titel" name="titel" maxLength={160} required placeholder="z. B. Suche erfahrene Shopware-Freelancer für Q1" />
          <label className="au-label" htmlFor="beschreibung">Beschreibung</label>
          <textarea className="au-textarea" id="beschreibung" name="beschreibung" rows={6} maxLength={4000} />
          <label className="au-label" htmlFor="tags">Schlagworte (mit Komma getrennt)</label>
          <input className="au-input" id="tags" name="tags" placeholder="z. B. Shopware, Freelancer, Entwicklung" />
          <button type="submit" className="au-btn au-btn-primary">Veröffentlichen</button>
          <p className="ua-klein">Sichtbar für alle Mitglieder von Uplifted Agencies.</p>
        </NetzwerkFormular>
      </div>
    </main>
  );
}
