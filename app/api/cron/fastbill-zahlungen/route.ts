import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { pruefeRechnungszahlungen } from "@/lib/rechnungen";

export const dynamic = "force-dynamic";

// Taeglicher Zahlungsabgleich der Seminar-Rechnungen (lib/rechnungen.ts):
// bezahlt/teilbezahlt in FastBill -> Buchung automatisch bestaetigen.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const ergebnis = await pruefeRechnungszahlungen(getSupabaseAdmin());
  return Response.json(ergebnis);
}
