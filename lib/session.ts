// Edge-kompatible Session-Signierung (Web Crypto API) -- wird sowohl in der
// Middleware (Edge-Runtime) als auch in Server Components/Actions verwendet.
// Enthaelt bewusst keinen next/headers-Import, damit es auch in der
// Middleware sauber laeuft.

const COOKIE_NAME = "au_session";
const SESSION_TTL_SEKUNDEN = 60 * 60 * 24 * 30; // 30 Tage

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_TTL = SESSION_TTL_SEKUNDEN;

export type SessionPayload = { mitarbeiterId: string; name: string; exp: number };

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET ist nicht gesetzt.");
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const enc = new TextEncoder();
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const teile = token.split(".");
  if (teile.length !== 2) return null;
  const [payloadB64, sigB64] = teile;
  try {
    const enc = new TextEncoder();
    const key = await hmacKey();
    const gueltig = await crypto.subtle.verify("HMAC", key, base64UrlDecode(sigB64) as BufferSource, enc.encode(payloadB64) as BufferSource);
    if (!gueltig) return null;
    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
