export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { subscribeToBroadcast } from "@/lib/webinargeek";

// Oeffentliche, schreibende Schnittstelle fuer das wiederverwendbare
// Onepage-Webinar-Anmeldemodul. Ersetzt das bisherige WebinarGeek-Iframe:
// die Registrierung laeuft weiterhin komplett ueber WebinarGeek (inkl.
// Double-Opt-in-Mail, Erinnerungen, Replay-Zugang und der bestehenden
// Zapier-Weitergabe an Quentn als Hard-Opt-in) - nur die Eingabemaske
// selbst ist jetzt eine native Onepage-Sektion statt eines eingebetteten
// Formulars. broadcastId identifiziert den konkreten Webinar-Termin und
// wird pro Onepage-Sektion als Control gepflegt, wodurch dasselbe Modul
// fuer beliebig viele Webinare wiederverwendet werden kann.
// Von der Login-Middleware ausgenommen (siehe middleware.ts), da ohne
// Session erreichbar sein muss.

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: "invalid_json" }, { status: 400 }));
  }

  const broadcastId = Number(body?.broadcastId);
  const firstname = String(body?.firstname || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();

  if (!broadcastId || !firstname || !email) {
    return withCors(NextResponse.json({ error: "missing_fields" }, { status: 400 }));
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return withCors(NextResponse.json({ error: "invalid_email" }, { status: 400 }));
  }

  const registrationIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  let result;
  try {
    result = await subscribeToBroadcast({ broadcastId, firstname, email, registrationIp });
  } catch (e: any) {
    console.error("WebinarGeek-Anmeldung fehlgeschlagen (Konfigurationsfehler):", e?.message);
    return withCors(NextResponse.json({ error: "server_config" }, { status: 500 }));
  }

  if (!result.ok) {
    console.error("WebinarGeek-Anmeldung fehlgeschlagen:", result.status, result.error);
    // 409 = i.d.R. bereits angemeldet - fuer den Nutzer trotzdem kein harter Fehler,
    // WebinarGeek verschickt in dem Fall ueblicherweise die bestehende Bestaetigung erneut.
    return withCors(
      NextResponse.json({ error: "webinargeek_fehler", detail: result.error }, { status: result.status >= 400 && result.status < 500 ? 400 : 502 })
    );
  }

  return withCors(
    NextResponse.json({
      ok: true,
      confirmationLink: result.confirmationLink,
      watchLink: result.watchLink,
      emailVerified: result.emailVerified,
    })
  );
}
