"use client";

import { useState } from "react";

// Freitext einfuegen (z.B. aus einer E-Mail-Signatur oder Bestellnotiz) und
// automatisch in Shopify-taugliche Adressfelder zerlegen. Die erkannten Felder
// bleiben editierbar, bevor der Eintrag angelegt wird - reine Heuristik, kein
// externer Dienst, keine Adressvalidierung.

// Entfernt Satzzeichen (Komma/Punkt/Semikolon) am Zeilenende, die beim
// Kopieren aus E-Mail-Signaturen, Tabellen oder Adressblöcken oft übrig
// bleiben (z.B. "Cherrypicker,", "20457 Hamburg.").
function saubereZeile(z: string) {
  return z.replace(/[.,;]+\s*$/, "").trim();
}

function parseAdresse(text: string) {
  const zeilen = text
    .split(/\r?\n/)
    .map((z) => saubereZeile(z))
    .filter(Boolean);

  const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const email = emailMatch ? emailMatch[0] : "";

  const plzOrtZeile = zeilen.find((z) => /^\d{4,5}\s+.+/.test(z));
  let plz = "";
  let ort = "";
  if (plzOrtZeile) {
    const m = plzOrtZeile.match(/^(\d{4,5})\s+(.+)$/);
    if (m) {
      plz = m[1];
      ort = m[2];
    }
  }

  // Zeilen mit Zahl (Hausnummer), die nicht die PLZ/Ort-Zeile oder die
  // E-Mail sind. Bevorzugt Zeilen mit typischem Straßen-Suffix (-straße,
  // -weg, ...), fällt sonst auf die erste Zahl-Zeile zurück - deckt auch
  // Straßennamen ohne Suffix ab, z.B. "Alt Lage 3b".
  const strasseKandidaten = zeilen.filter((z) => z !== plzOrtZeile && !z.includes("@") && /\d/.test(z));
  const strasseZeileRoh =
    strasseKandidaten.find((z) => /straße|strasse|str\.|weg|allee|platz|gasse|ring/i.test(z)) ||
    strasseKandidaten[0];
  // Hausnummer manchmal durch Komma abgetrennt kopiert (z.B. "Zippelhaus, 3"
  // aus einer Tabelle) - zu "Zippelhaus 3" normalisieren.
  const strasseZeile = strasseZeileRoh
    ? strasseZeileRoh.replace(/,\s*(\d+\s*[a-zA-Z]?)$/, " $1").replace(/\s+/g, " ").trim()
    : "";

  let land = "Deutschland";
  if (/österreich|austria/i.test(text)) land = "Österreich";
  else if (/schweiz|switzerland/i.test(text)) land = "Schweiz";

  // Übrige Zeilen (keine PLZ/Ort-, Straßen- oder E-Mail-Zeile, kein Land,
  // beginnt nicht mit einer Ziffer) sind Firma und/oder Ansprechpartner.
  // In deutschen Geschäftsadressen steht die Firma üblicherweise vor dem
  // Ansprechpartner - bei zwei Kandidaten gilt deshalb der erste als Firma,
  // der zweite als Name; bei nur einem Kandidaten gilt er als Name.
  const nameKandidaten = zeilen.filter(
    (z) =>
      z !== plzOrtZeile &&
      z !== strasseZeileRoh &&
      !z.includes("@") &&
      !/^\d/.test(z) &&
      !/^(deutschland|österreich|schweiz|germany|austria|switzerland)$/i.test(z)
  );
  const firma = nameKandidaten.length > 1 ? nameKandidaten[0] : "";
  const name = nameKandidaten.length > 1 ? nameKandidaten[1] : nameKandidaten[0] || "";

  return {
    name,
    firma,
    strasse: strasseZeile,
    plz,
    ort,
    land,
    email,
  };
}

type Kategorie = { id: string; name: string };

export default function AdressParseFeld({ kategorien }: { kategorien: Kategorie[] }) {
  const [rohtext, setRohtext] = useState("");
  const [felder, setFelder] = useState({ name: "", firma: "", strasse: "", plz: "", ort: "", land: "Deutschland", email: "" });
  const [typ, setTyp] = useState(kategorien.find((k) => k.name === "Agenturunternehmer")?.name || kategorien[0]?.name || "");
  const [status, setStatus] = useState("neu");

  function onRohtextChange(value: string) {
    setRohtext(value);
    const erkannt = parseAdresse(value);
    setFelder((prev) => ({
      name: erkannt.name || prev.name,
      firma: erkannt.firma || prev.firma,
      strasse: erkannt.strasse || prev.strasse,
      plz: erkannt.plz || prev.plz,
      ort: erkannt.ort || prev.ort,
      land: erkannt.land || prev.land,
      email: erkannt.email || prev.email,
    }));
  }

  return (
    <>
      <label className="au-label">Adresse einfügen (Freitext, z.B. aus E-Mail kopiert)</label>
      <textarea
        className="au-textarea"
        rows={5}
        value={rohtext}
        onChange={(e) => onRohtextChange(e.target.value)}
        placeholder={"Firma GmbH (optional)\nMax Mustermann\nMusterstraße 12\n12345 Musterstadt\nmax@example.com"}
        style={{ minHeight: "auto" }}
      />
      <input type="hidden" name="rohtext" value={rohtext} />

      <div className="au-row-2">
        <div>
          <label className="au-label">Firma (optional)</label>
          <input
            className="au-input"
            type="text"
            name="firma"
            value={felder.firma}
            onChange={(e) => setFelder({ ...felder, firma: e.target.value })}
          />
        </div>
        <div>
          <label className="au-label">Name</label>
          <input
            className="au-input"
            type="text"
            name="name"
            required
            value={felder.name}
            onChange={(e) => setFelder({ ...felder, name: e.target.value })}
          />
        </div>
      </div>

      <label className="au-label">E-Mail (optional)</label>
      <input
        className="au-input"
        type="email"
        name="email"
        value={felder.email}
        onChange={(e) => setFelder({ ...felder, email: e.target.value })}
      />

      <label className="au-label">Straße + Hausnummer</label>
      <input
        className="au-input"
        type="text"
        name="strasse"
        required
        value={felder.strasse}
        onChange={(e) => setFelder({ ...felder, strasse: e.target.value })}
      />

      <div className="au-row-3">
        <div>
          <label className="au-label">PLZ</label>
          <input
            className="au-input"
            type="text"
            name="plz"
            required
            value={felder.plz}
            onChange={(e) => setFelder({ ...felder, plz: e.target.value })}
          />
        </div>
        <div>
          <label className="au-label">Ort</label>
          <input
            className="au-input"
            type="text"
            name="ort"
            required
            value={felder.ort}
            onChange={(e) => setFelder({ ...felder, ort: e.target.value })}
          />
        </div>
        <div>
          <label className="au-label">Land</label>
          <input
            className="au-input"
            type="text"
            name="land"
            required
            value={felder.land}
            onChange={(e) => setFelder({ ...felder, land: e.target.value })}
          />
        </div>
      </div>

      <div className="au-row-2">
        <div>
          <label className="au-label">Empfänger ist</label>
          <select className="au-select" name="empfaenger_typ" value={typ} onChange={(e) => setTyp(e.target.value)}>
            {kategorien.map((k) => (
              <option key={k.id} value={k.name}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        {typ === "Agenturunternehmer" && (
          <div>
            <label className="au-label">Kundenstatus</label>
            <select className="au-select" name="empfaenger_status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="neu">Neu (potenzieller Kunde)</option>
              <option value="bestand">Bestand (schon Kunde)</option>
            </select>
          </div>
        )}
      </div>
    </>
  );
}
