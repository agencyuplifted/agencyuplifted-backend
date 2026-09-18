import { NextRequest } from "next/server";
import { pruefeUndSendeErinnerungen } from "@/lib/erinnerungen";

export const dynamic = "force-dynamic";

// Einmal taeglich morgens (vercel.json). Welche Erinnerung heute dran ist,
// entscheidet die Konfiguration in der Tabelle erinnerungen -- nicht der Cron.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await pruefeUndSendeErinnerungen());
}
