import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { baueKalender, type KalenderAbo } from "@/lib/erinnerungen";

export const dynamic = "force-dynamic";

// Kalender-Abo (webcal/ICS) fuer Apple/Google Kalender. Kein Login moeglich
// (Kalender-Apps schicken keine Cookies) -- der zufaellige Token in der URL ist
// das Geheimnis, deshalb Ausnahme in middleware.ts. ".ics" am Ende ist
// optional, manche Kalender-Apps erwarten es.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rein = token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{48}$/.test(rein)) return new Response("Nicht gefunden", { status: 404 });

  const { data: abo, error } = await getSupabaseAdmin().from("kalender_abos").select("*").eq("token", rein).eq("aktiv", true).maybeSingle();
  if (error) return new Response("Fehler", { status: 500 });
  if (!abo) return new Response("Nicht gefunden", { status: 404 });

  try {
    const ics = await baueKalender(abo as KalenderAbo);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="agencyuplifted-wiedervorlage.ics"`,
        "Cache-Control": "private, max-age=900",
      },
    });
  } catch (e: any) {
    console.error("Kalender-Feed:", e.message);
    return new Response("Fehler", { status: 500 });
  }
}
