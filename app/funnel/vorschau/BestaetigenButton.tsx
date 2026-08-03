"use client";

export default function BestaetigenButton({ anzahl }: { anzahl: number }) {
  return (
    <button
      type="submit"
      style={{
        background: "#8a1f1f",
        color: "white",
        padding: "0.65rem 1.1rem",
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
      }}
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
