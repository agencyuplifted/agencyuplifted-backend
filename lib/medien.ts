// Medien-Upload (Vercel Blob, Store "agencyuplifted-media"): Regeln, die
// Upload-Seite (Browser) und Token-Route (Server) gemeinsam nutzen -- deshalb
// ohne Server-Abhaengigkeiten.
//
// Bewusst nur Videos: Onepage speichert Bilder, PDF und SVG selbst, nur
// Videos nicht (Markus 10/2026). Weitere Typen hier eintragen; der Ordner
// ergibt sich aus dem Typ, die Route prueft beides.

export const MEDIEN_TYPEN: Record<string, string> = {
  "video/mp4": "videos",
  "video/webm": "videos",
};

export const MEDIEN_MAX_BYTES = 200 * 1024 * 1024;
export const MEDIEN_CACHE_SEKUNDEN = 365 * 24 * 60 * 60;

export const medienOrdner = (typ: string): string | null => MEDIEN_TYPEN[typ] || null;

// Lesbare, URL-taugliche Dateinamen ("Hero Video Ü.mp4" -> "hero-video-ue.mp4");
// den Zufallsanhang haengt Blob selbst an (addRandomSuffix).
export function sichererDateiname(name: string): string {
  const punkt = name.lastIndexOf(".");
  const basis = punkt > 0 ? name.slice(0, punkt) : name;
  const endung = punkt > 0 ? name.slice(punkt + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const sauber =
    basis
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "datei";
  return endung ? `${sauber}.${endung}` : sauber;
}

export function formatGroesse(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
