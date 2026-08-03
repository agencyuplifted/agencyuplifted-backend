import { Resend } from "resend";

// Nutzt den Resend-API-Key aus den Umgebungsvariablen (in Vercel unter
// Project Settings -> Environment Variables als RESEND_API_KEY hinterlegen).
export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY ist nicht gesetzt. Bitte in Vercel unter Project Settings -> Environment Variables hinterlegen."
    );
  }
  return new Resend(apiKey);
}

// Solange keine eigene Domain bei Resend verifiziert ist (resend.com/domains),
// funktioniert nur die Test-Adresse onboarding@resend.dev, und Mails koennen
// nur an die E-Mail-Adresse des Resend-Accounts selbst verschickt werden.
export const ABSENDER = process.env.RESEND_FROM || "AgencyUplifted <onboarding@resend.dev>";
