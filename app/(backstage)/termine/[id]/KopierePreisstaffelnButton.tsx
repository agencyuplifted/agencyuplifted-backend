"use client";

// Bestaetigung nur, wenn die Zieloption bereits Preisstaffeln hat -- das
// Kopieren ersetzt diese dann unwiderruflich durch die der Quelloption
// (siehe copyPreisstaffelnFromOption in lib/actions.ts). Ohne bestehende
// Preisstaffeln ist es eine reine Ergaenzung, keine Bestaetigung noetig.
export default function KopierePreisstaffelnButton({ ersetztBestehende }: { ersetztBestehende: boolean }) {
  return (
    <button
      type="submit"
      className="au-btn au-btn-secondary au-btn-sm"
      onClick={(e) => {
        if (!ersetztBestehende) return;
        const ok = window.confirm(
          "Das ersetzt alle bestehenden Preisstaffeln dieser Option unwiderruflich durch die der ausgewählten Quelloption. Fortfahren?"
        );
        if (!ok) e.preventDefault();
      }}
    >
      {ersetztBestehende ? "Preisstaffeln ersetzen" : "Preisstaffeln übernehmen"}
    </button>
  );
}
