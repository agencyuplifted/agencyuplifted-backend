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

// agencyuplifted.de ist bei Resend verifiziert (DKIM + SPF ueber die
// send.agencyuplifted.de Subdomain) -- Versand an beliebige Empfaenger moeglich.
export const ABSENDER = process.env.RESEND_FROM || "AgencyUplifted <hallo@agencyuplifted.de>";
