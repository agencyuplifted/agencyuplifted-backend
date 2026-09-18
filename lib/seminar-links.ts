import { createHmac, timingSafeEqual } from "crypto";

// Persoenliche Links aus den Seminar-Mails (Unterlagen, Teilnehmerliste,
// Freigabe). Der Token bindet genau EINEN Teilnehmer an genau EINEN Termin und
// ist per HMAC signiert -- eine blosse Termin-ID in der URL wuerde jede
// weitergeleitete Mail zum Schluessel fuer die Teilnehmerliste machen. Die
// Seiten pruefen zusaetzlich, dass die Person den Termin wirklich gebucht hat.

const BASIS = process.env.BACKSTAGE_URL || "https://backstage.agencyuplifted.com";

function getSeminarLinkSecret(): string {
  const secret = process.env.SEMINAR_LINK_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET ist nicht gesetzt (wird fuer die Seminar-Links in Funnel-Mails gebraucht).");
  return secret;
}

function signatur(teilnehmerId: string, terminId: string): string {
  return createHmac("sha256", getSeminarLinkSecret())
    .update(`seminar-link:${teilnehmerId}:${terminId}`)
    .digest("base64url")
    .slice(0, 22);
}

export function erzeugeSeminarToken(teilnehmerId: string, terminId: string): string {
  const nutzlast = Buffer.from(`${teilnehmerId}:${terminId}`).toString("base64url");
  return `${nutzlast}.${signatur(teilnehmerId, terminId)}`;
}

export function pruefeSeminarToken(token: string): { teilnehmerId: string; terminId: string } | null {
  const [nutzlast, sig] = String(token || "").split(".");
  if (!nutzlast || !sig) return null;
  let text: string;
  try {
    text = Buffer.from(nutzlast, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [teilnehmerId, terminId] = text.split(":");
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(teilnehmerId || "") || !uuid.test(terminId || "")) return null;
  const erwartet = Buffer.from(signatur(teilnehmerId, terminId));
  const gesendet = Buffer.from(sig);
  if (erwartet.length !== gesendet.length || !timingSafeEqual(erwartet, gesendet)) return null;
  return { teilnehmerId, terminId };
}

export function seminarLinks(teilnehmerId: string, terminId: string) {
  const token = erzeugeSeminarToken(teilnehmerId, terminId);
  return {
    unterlagen_link: `${BASIS}/seminar/${token}/unterlagen`,
    teilnehmerliste_link: `${BASIS}/seminar/${token}/teilnehmer`,
    freigabe_link: `${BASIS}/seminar/${token}/freigabe`,
  };
}
