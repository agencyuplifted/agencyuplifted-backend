"use client";

import { useState } from "react";
import { baueMailHtml, type MailBausteine } from "@/lib/mail-html";

// Zentrale Mail-Bausteine mit Live-Vorschau: so sieht das Ende jeder
// Funnel-Mail aus (einzelne Mails koennen Bausteine im Editor abwaehlen).
export default function BausteinEditor({ bausteine, speichernAction }: { bausteine: MailBausteine; speichernAction: (fd: FormData) => Promise<void> }) {
  const [b, setB] = useState(bausteine);
  const feld = (k: keyof MailBausteine) => ({
    name: k,
    value: b[k],
    onChange: (e: { target: { value: string } }) => setB({ ...b, [k]: e.target.value }),
  });
  return (
    <div className="au-bs-raster">
      <form action={speichernAction}>
        <h3 className="au-bs-titel">Signatur</h3>
        <textarea className="au-textarea" rows={5} {...feld("signatur")} />

        <h3 className="au-bs-titel">Impressum &amp; Datenschutz</h3>
        <label className="au-label">Firmenangaben (Name, Anschrift, ggf. Geschäftsführung / Register)</label>
        <textarea className="au-textarea" rows={4} {...feld("firmenangaben")} placeholder={"AgencyUplifted …\nStraße Nr., PLZ Ort"} />
        <label className="au-label">Link Impressum</label>
        <input className="au-input" type="url" {...feld("impressum_url")} />
        <label className="au-label">Link Datenschutzerklärung</label>
        <input className="au-input" type="url" {...feld("datenschutz_url")} />

        <h3 className="au-bs-titel">Abmeldelink</h3>
        <label className="au-label">Text vor dem Link „Hier abmelden“</label>
        <input className="au-input" {...feld("abmelde_text")} />
        <p className="au-klein" style={{ marginTop: "-0.5rem" }}>
          Der Link ist für jeden Empfänger persönlich. Ein Klick führt auf eine Bestätigungsseite; danach bekommt die Adresse keine
          Funnel-Mails, Kampagnen und Geburtstagsmails mehr. Gmail und Apple Mail zeigen zusätzlich oben einen „Abmelden“-Knopf.
        </p>

        <button type="submit" className="au-btn au-btn-primary">Bausteine speichern</button>
      </form>

      <div>
        <h3 className="au-bs-titel">Vorschau Mail-Ende</h3>
        <div className="au-fe-vorschau" style={{ marginTop: 0 }}>
          <div
            className="au-fe-vorschau-inhalt"
            dangerouslySetInnerHTML={{ __html: baueMailHtml("Hallo Anna,\n\n… Text der Mail …", b, { signatur: true, rechtliches: true, abmelden: true }, null) }}
          />
        </div>
      </div>
    </div>
  );
}
