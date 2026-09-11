"use client";

// Bestaetigung vor dem Deaktivieren einer Option -- ersetzt das fruehere
// harte Loeschen (deleteSeminarOption), das ohne Rueckfrage sofort
// Preisstaffeln/Features mitgeloescht haette (CASCADE) bzw. bei
// bestehenden Buchungen nur mit einem kryptischen DB-Fehler abgebrochen
// waere (buchungspositionen ist NO ACTION). Deaktivieren ist reversibel
// (siehe ReaktivierenOptionButton) und loescht nichts.
export default function DeaktivierenOptionButton({ titel }: { titel: string }) {
  return (
    <button
      type="submit"
      className="au-btn au-btn-danger au-btn-sm"
      onClick={(e) => {
        const ok = window.confirm(
          `Option "${titel}" wirklich deaktivieren? Sie verschwindet dann aus der öffentlichen Preisanzeige/Buchung, bleibt aber inkl. Historie (Buchungen, Preisstaffeln, Features) erhalten und kann jederzeit wieder aktiviert werden.`
        );
        if (!ok) e.preventDefault();
      }}
    >
      Deaktivieren
    </button>
  );
}
