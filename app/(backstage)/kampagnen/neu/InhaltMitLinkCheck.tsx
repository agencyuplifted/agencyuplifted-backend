"use client";

import { useState } from "react";
import LinkChecker from "../../LinkChecker";

// Inhaltsfeld der neuen Kampagne mit Live-Link-Sammlung darunter
export default function InhaltMitLinkCheck({ fusszeile }: { fusszeile: { label: string; url: string }[] }) {
  const [inhalt, setInhalt] = useState("");
  return (
    <>
      <textarea className="au-textarea" name="inhalt" required value={inhalt} onChange={(e) => setInhalt(e.target.value)} placeholder={"Hallo {{vorname}},\n\n..."} />
      <LinkChecker text={inhalt} zusatzLinks={fusszeile} />
    </>
  );
}
