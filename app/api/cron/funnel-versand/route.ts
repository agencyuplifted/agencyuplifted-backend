import { NextRequest } from "next/server";
import { pruefeUndSendeFaelligeFunnelMails } from "@/lib/funnel";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const ergebnis = await pruefeUndSendeFaelligeFunnelMails();
  return Response.json(ergebnis);
}
