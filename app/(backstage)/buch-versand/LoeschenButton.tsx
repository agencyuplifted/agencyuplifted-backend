"use client";

// Verhindert versehentliches Löschen eines Buch-Versand-Eintrags per Klick -
// das entfernt den internen Datensatz (und den verknüpften Buch-Empfänger-
// Eintrag) endgültig, rührt aber eine ggf. bereits angelegte Shopify-
// Bestellung nicht an.
export default function LoeschenButton({ name }: { name: string }) {
  return (
    <button
      type="submit"
      className="au-btn au-btn-danger au-btn-sm"
      onClick={(e) => {
        const ok = window.confirm(
          `Eintrag "${name}" wirklich endgültig löschen? Eine bereits angelegte Shopify-Bestellung bleibt davon unberührt.`
        );
        if (!ok) e.preventDefault();
      }}
    >
      Löschen
    </button>
  );
}
