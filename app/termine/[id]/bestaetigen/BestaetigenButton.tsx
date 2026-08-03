"use client";

export default function BestaetigenButton({ anzahlFelder }: { anzahlFelder: number }) {
  return (
    <button
      type="submit"
      className="au-btn au-btn-primary"
      onClick={(e) => {
        const ok = window.confirm(
          `${anzahlFelder} Feld(er) werden jetzt geändert. Bist du sicher, dass die neuen Werte korrekt sind?`
        );
        if (!ok) e.preventDefault();
      }}
    >
      Ja, Änderungen jetzt endgültig speichern
    </button>
  );
}
