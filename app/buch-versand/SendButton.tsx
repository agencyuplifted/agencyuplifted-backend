"use client";

import { useFormStatus } from "react-dom";

// Verhindert Doppelklicks waehrend die Server Action laeuft - sonst kann ein
// zweiter Klick vor der ersten Antwort eine zweite echte Shopify-Bestellung
// fuer denselben Eintrag anlegen.
export default function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="au-btn au-btn-secondary au-btn-sm" disabled={pending}>
      {pending ? "Wird angelegt…" : "Als Shopify-Bestellung anlegen"}
    </button>
  );
}
