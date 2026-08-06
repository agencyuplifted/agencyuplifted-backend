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
        rows={5}
        value={rohtext}
        onChange={(e) => onRohtextChange(e.target.value)}
        placeholder={"Max Mustermann\nMusterstraße 12\n12345 Musterstadt\nmax@example.com"}
        style={{ marginBottom: "1rem" }}
      />
      <input type="hidden" name="rohtext" value={rohtext} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <label>
          Name
          <input type="text" name="name" required value={felder.name} onChange={(e) => setFelder({ ...felder, name: e.target.value })} />
        </label>
        <label>
          E-Mail (optional)
          <input type="email" name="email" value={felder.email} onChange={(e) => setFelder({ ...felder, email: e.target.value })} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          Straße + Hausnummer
          <input type="text" name="strasse" required value={felder.strasse} onChange={(e) => setFelder({ ...felder, strasse: e.target.value })} />
        </label>
        <label>
          PLZ
          <input type="text" name="plz" required value={felder.plz} onChange={(e) => setFelder({ ...felder, plz: e.target.value })} />
        </label>
        <label>
          Ort
          <input type="text" name="ort" required value={felder.ort} onChange={(e) => setFelder({ ...felder, ort: e.target.value })} />
        </label>
        <label>
          Land
          <input type="text" name="land" required value={felder.land} onChange={(e) => setFelder({ ...felder, land: e.target.value })} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: typ === "agenturunternehmer" ? "1fr 1fr" : "1fr", gap: "0.75rem", marginTop: "0.75rem" }}>
        <label>
          Empfänger ist
          <select name="empfaenger_typ" value={typ} onChange={(e) => setTyp(e.target.value)}>
            <option value="agenturunternehmer">Agenturunternehmer</option>
            <option value="mitarbeiter">Mitarbeiter</option>
          </select>
        </label>
        {typ === "agenturunternehmer" && (
          <label>
            Kundenstatus
            <select name="empfaenger_status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="neu">Neu (potenzieller Kunde)</option>
              <option value="bestand">Bestand (schon Kunde)</option>
            </select>
          </label>
        )}
      </div>
    </>
  );
}
