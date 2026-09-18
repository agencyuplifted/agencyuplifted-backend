import { createHmac, timingSafeEqual } from "crypto";
import { STANDARD_BAUSTEINE, type MailBausteine } from "./mail-html";

export { baueMailHtml, schalterAus, STANDARD_BAUSTEINE, type MailBausteine, type BausteinSchalter } from "./mail-html";

// Gemeinsame Bausteine unter jeder Funnel-/System-Mail: Signatur,
// Rechtliches (Firmenangaben, Impressum, Datenschutz) und Abmeldelink.
// Gepflegt einmal zentral (Tabelle mail_bausteine), pro Mail abschaltbar
// (funnel_mails.baustein_*). Vorher musste jede Mail ihren Gruss selbst
// enthalten, und Impressum/Abmeldung fehlten ueberall.

const BASIS = process.env.BACKSTAGE_URL || "https://backstage.agencyuplifted.com";

export async function ladeBausteine(supabase: any): Promise<MailBausteine> {
  const { data } = await supabase.from("mail_bausteine").select("*").eq("id", 1).maybeSingle();
  return { ...STANDARD_BAUSTEINE, ...(data || {}) };
}

// ---------- Abmeldelink ----------
// Token bindet Empfaenger-Art + Datensatz-ID (Teilnehmer/Lead/Warteliste),
// nicht die E-Mail-Adresse -- so steht keine Adresse in der URL.

export type AbmeldeTyp = "t" | "l" | "w";

function getSecret(): string {
  const secret = process.env.SEMINAR_LINK_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET ist nicht gesetzt (wird fuer die Abmeldelinks gebraucht).");
  return secret;
}

function sig(typ: AbmeldeTyp, id: string) {
  return createHmac("sha256", getSecret()).update(`abmelden:${typ}:${id}`).digest("base64url").slice(0, 22);
}

export function abmeldeToken(typ: AbmeldeTyp, id: string): string {
  return `${typ}${Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url")}.${sig(typ, id)}`;
}

export function pruefeAbmeldeToken(token: string): { typ: AbmeldeTyp; id: string } | null {
  const [kopf, s] = String(token || "").split(".");
  if (!kopf || !s) return null;
  const typ = kopf[0] as AbmeldeTyp;
  if (!["t", "l", "w"].includes(typ)) return null;
  const hex = Buffer.from(kopf.slice(1), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const a = Buffer.from(sig(typ, id));
  const b = Buffer.from(s);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { typ, id };
}

export function abmeldeUrl(typ: AbmeldeTyp, id: string) {
  return `${BASIS}/abmelden/${abmeldeToken(typ, id)}`;
}

/** Header fuer Gmail/Apple Mail ("Abmelden"-Knopf direkt im Postfach, RFC 8058 One-Click). */
export function abmeldeHeader(typ: AbmeldeTyp, id: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${BASIS}/api/public/abmelden/${abmeldeToken(typ, id)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Welche dieser Adressen haben sich ueber einen Abmeldelink abgemeldet? */
export async function abgemeldeteAdressen(supabase: any, emails: string[]): Promise<Set<string>> {
  const liste = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!liste.length) return new Set();
  const { data } = await supabase.from("mail_abmeldungen").select("email").in("email", liste);
  return new Set((data || []).map((d: any) => d.email));
}


/**
 * Adressen, die keine Funnel-/Kampagnen-Mail mehr bekommen: per Link
 * abgemeldet, hart gebounct oder als Spam gemeldet (Resend-Webhook). Vorher
 * wurden Bounces/Beschwerden nur protokolliert und die naechste Mail ging
 * trotzdem raus -- das kostet Zustellbarkeit der ganzen Absender-Domain.
 */
export async function ladeSperrliste(supabase: any): Promise<Map<string, "abgemeldet" | "bounce" | "beschwerde">> {
  const liste = new Map<string, "abgemeldet" | "bounce" | "beschwerde">();
  const alle = async (abfrage: (von: number, bis: number) => any) => {
    const zeilen: any[] = [];
    for (let von = 0; ; von += 1000) {
      const { data } = await abfrage(von, von + 999);
      zeilen.push(...(data || []));
      if (!data || data.length < 1000) return zeilen;
    }
  };
  const [abgemeldet, ...logs] = await Promise.all([
    alle((v, b) => supabase.from("mail_abmeldungen").select("email").range(v, b)),
    alle((v, b) => supabase.from("funnel_versand_log").select("empfaenger_email, bounced_am, beschwerde_am").or("bounced_am.not.is.null,beschwerde_am.not.is.null").range(v, b)),
    alle((v, b) => supabase.from("kampagnen_versand_log").select("empfaenger_email, bounced_am, beschwerde_am").or("bounced_am.not.is.null,beschwerde_am.not.is.null").range(v, b)),
  ]);
  for (const z of logs.flat()) {
    const key = String(z.empfaenger_email).trim().toLowerCase();
    liste.set(key, z.beschwerde_am ? "beschwerde" : liste.get(key) || "bounce");
  }
  for (const z of abgemeldet) liste.set(String(z.email).trim().toLowerCase(), "abgemeldet");
  return liste;
}
