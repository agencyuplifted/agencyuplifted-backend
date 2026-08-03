"use client";

export default function BestaetigenButton({ anzahl }: { anzahl: number }) {
  return (
    <button
      type="submit"
      className="au-btn au-btn-danger-solid"
      onClick={(e) => {
        const ok = window.confirm(
          `Wirklich ${anzahl} E-Mail(s) jetzt endgültig verschicken?\n\nDieser Schritt kann nicht rückgängig gemacht werden.`
        );
        if (!ok) {
          e.preventDefault();
        }
      }}
    >
      Ja, {anzahl} E-Mail(s) jetzt endgültig verschicken
    </button>
  );
}
