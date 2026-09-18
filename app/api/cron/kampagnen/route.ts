import { NextRequest } from "next/server";
import { sendeGeplanteKampagnen } from "@/lib/kampagnen";

export const dynamic = "force-dynamic";
// Batch-Versand grosser Kampagnen braucht mehr als die Standard-Zeitgrenze
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await sendeGeplanteKampagnen());
}
