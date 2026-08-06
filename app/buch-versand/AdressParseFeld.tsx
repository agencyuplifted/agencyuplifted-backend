"use client";

import { useState } from "react";

// Freitext einfuegen (z.B. aus einer E-Mail-Signatur oder Bestellnotiz) und
// automatisch in Shopify-taugliche Adressfelder zerlegen. Die erkannten Felder
// bleiben editierbar, bevor der Eintrag angelegt wird - reine Heuristik, kein
// externer Dienst, keine Adressvalidierung.
function parseAdresse(text: string) {
  const zeilen = text
    .split("\n")
    .map((z) => z.trim())
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

  const strasseZeile = zeilen.find(
    (z) =>
      z !== plzOrtZeile &&
      !z.includes("@") &&
      /\d/.test(z) &&
      /straße|strasse|str\.|weg|allee|platz|gasse|ring/i.test(z)
  );

  let land = "Deutschland";
  if (/österreich|austria/i.test(text)) land = "Österreich";
  else if (/schweiz|switzerland/i.test(text)) land = "Schweiz";

  const nameZeile = zeilen.find(
    (z) =>
      z !== plzOrtZeile &&
      z !== strasseZeile &&
      !z.includes("@") &&
      !/^\d/.test(z) &&
      !/^(deutschland|österreich|schweiz|germany|austria|switzerland)$/i.test(z)
  );

  return {
    name: nameZeile || "",
    strasse: strasseZeile || "",
    plz,
    ort,
    land,
    email,
  };
}

export default function AdressParseFeld() {
  const [rohtext, setRohtext] = useState("");
  const [felder, setFelder] = useState({ name: "", strasse: "", plz: "", ort: "", land: "Deutschland", email: "" });
  const [typ, setTyp] = useState("agenturunternehmer");
  const [status, setStatus] = useState("neu");

  function onRohtextChange(value: string) {
    setRohtext(value);
    const erkannt = parseAdresse(value);
    setFelder((prev) => ({
      name: erkannt.name || prev.name,
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
        placeholder={"Max Mustermann\nMusterstraße 12\n12345 Musterstadt\nmax@example.com"}
        style={{ minHeight: "auto" }}
      />
      <input type="hidden" name="rohtext" value={rohtext} />

      <div className="au-row-2">
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
        <div>
          <label className="au-label">E-Mail (optional)</label>
          <input
            className="au-input"
            type="email"
            name="email"
            value={felder.email}
            onChange={(e) => setFelder({ ...felder, email: e.target.value })}
          />
        </div>
      </div>

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
            <option value="agenturunternehmer">Agenturunternehmer</option>
            <option value="mitarbeiter">Mitarbeiter</option>
          </select>
        </div>
        {typ === "agenturunternehmer" && (
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
