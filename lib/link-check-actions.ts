"use server";

import { isIP } from "net";
import { getAktuellerBenutzer } from "./auth";

export type LinkErgebnis = {
  url: string;
  ok: boolean;
  status: number | null;
  /** Ziel nach Weiterleitungen, falls anders als die URL */
  ziel: string | null;
  hinweis: string | null;
};

// Interne Adressen nie abrufen (der Server soll nicht als Tuer ins eigene Netz dienen)
function istIntern(host: string) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (isIP(h) === 4) return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  if (isIP(h) === 6) return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  return false;
}

async function pruefeEinen(url: string): Promise<LinkErgebnis> {
  let aktuell = url;
  for (let schritt = 0; schritt < 6; schritt++) {
    let u: URL;
    try {
      u = new URL(aktuell);
    } catch {
      return { url, ok: false, status: null, ziel: null, hinweis: "Ungültige Adresse" };
    }
    if (!["http:", "https:"].includes(u.protocol) || istIntern(u.hostname)) {
      return { url, ok: false, status: null, ziel: null, hinweis: "Adresse wird nicht geprüft" };
    }
    let antwort: Response;
    try {
      const signal = AbortSignal.timeout(8000);
      const kopf = { "user-agent": "Mozilla/5.0 (AgencyUplifted Link-Check)", accept: "text/html,*/*" };
      antwort = await fetch(aktuell, { method: "HEAD", redirect: "manual", signal, headers: kopf });
      // Manche Server kennen kein HEAD -- dann ein normales GET
      if (antwort.status === 405 || antwort.status === 403 || antwort.status === 501) {
        antwort = await fetch(aktuell, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), headers: kopf });
      }
    } catch (e: any) {
      const zeit = e?.name === "TimeoutError";
      return { url, ok: false, status: null, ziel: aktuell !== url ? aktuell : null, hinweis: zeit ? "Keine Antwort (Zeitüberschreitung)" : "Nicht erreichbar" };
    }
    const ort = antwort.headers.get("location");
    if (antwort.status >= 300 && antwort.status < 400 && ort) {
      aktuell = new URL(ort, aktuell).toString();
      continue;
    }
    const ok = antwort.status < 400;
    return {
      url,
      ok,
      status: antwort.status,
      ziel: aktuell !== url ? aktuell : null,
      hinweis: ok
        ? url.startsWith("http://")
          ? "Unverschlüsselt (http://) – besser https:// verwenden"
          : null
        : antwort.status === 404
          ? "Seite nicht gefunden"
          : `Fehler ${antwort.status}`,
    };
  }
  return { url, ok: false, status: null, ziel: aktuell, hinweis: "Zu viele Weiterleitungen" };
}

export async function pruefeLinks(urls: string[]): Promise<LinkErgebnis[]> {
  // Server Actions sind von ueberall aufrufbar -- ohne Backstage-Login nichts abrufen
  if (!(await getAktuellerBenutzer())) throw new Error("Nicht angemeldet.");
  const liste = Array.from(new Set(urls)).slice(0, 40);
  return Promise.all(liste.map(pruefeEinen));
}
