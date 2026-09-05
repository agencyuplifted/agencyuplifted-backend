export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getBroadcastInfo } from "@/lib/webinargeek";
import { monatsName } from "@/lib/format";

// Oeffentliche, rein lesende Schnittstelle fuer Titel und Terminzeile eines
// WebinarGeek-Broadcasts (konkreter Webinar-Termin), z.B. fuer eine
// Onepage-Landingpage, die Termindetails ohne WebinarGeek-Iframe anzeigen
// will. Von der Login-Middleware ausgenommen (siehe middleware.ts).

function berlinTeile(datum: Date) {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(datum);
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? "";
  return { tag: wert("day"), monat: wert("month"), stunde: wert("hour"), minute: wert("minute") };
}

function formatDateTimeLine(startEpochSeconds: number, durationSeconds: number): string {
  const start = berlinTeile(new Date(startEpochSeconds * 1000));
  const ende = berlinTeile(new Date((startEpochSeconds + durationSeconds) * 1000));
  const monatsname = monatsName(Number(start.monat) - 1);
  return `${Number(start.tag)}. ${monatsname} ${start.stunde}.${start.minute} – ${ende.stunde}.${ende.minute} Uhr`;
}

export async function GET(request: NextRequest) {
  const broadcastId = request.nextUrl.searchParams.get("broadcastId");
  if (!broadcastId) {
    return NextResponse.json({ error: "missing_broadcast_id" }, { status: 400 });
  }

  let result;
  try {
    result = await getBroadcastInfo(Number(broadcastId));
  } catch (e: any) {
    console.error("WebinarGeek-Terminabruf fehlgeschlagen (Konfigurationsfehler):", e?.message);
    return NextResponse.json({ error: "server_config" }, { status: 500 });
  }

  if (!result.ok) {
    console.error("WebinarGeek-Terminabruf fehlgeschlagen:", result.status, result.error);
    return NextResponse.json({ error: "webinargeek_fehler", detail: result.error }, { status: 502 });
  }

  return NextResponse.json({
    title: result.title,
    dateTimeLine: formatDateTimeLine(result.startEpochSeconds, result.durationSeconds),
  });
}
