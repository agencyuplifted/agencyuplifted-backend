"use client";

import { useFormStatus } from "react-dom";

// Verhindert Doppelklicks waehrend die Server Action laeuft - sonst koennte
// ein zweiter Klick vor der ersten Antwort einen zweiten echten Mailversand
// ausloesen (der Log-Eintrag verhindert zwar einen zweiten Log-Eintrag im
// selben Jahr, aber die Mail selbst waere schon raus, bevor das greift).
export default function SendenButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="au-btn au-btn-primary" disabled={pending}>
      {pending ? "Wird gesendet…" : "Jetzt senden"}
    </button>
  );
}
