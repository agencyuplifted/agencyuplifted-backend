export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getResend } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";

// Empfaengt Resend-Webhook-Events (Zustellung, Oeffnung, Klick, Bounce,
// Beschwerde) und pflegt die Tracking-Felder in funnel_versand_log nach.
// Zuordnung ueber resend_email_id (bei jedem Versand in lib/funnel.ts
// gespeichert). Von der Login-Middleware ausgenommen (siehe middleware.ts),
// da Resend ohne Session-Cookie zustellt. Absicherung stattdessen ueber die
// Svix-Signatur (RESEND_WEBHOOK_SECRET), siehe resend.webhooks.verify().
//
// Einrichtung (einmalig): app/email-test/page.tsx -> Button "Tracking &
// Webhook einrichten" (ruft die Server Action richteResendTrackingEin() auf).

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET ist nicht gesetzt - Webhook wird abgelehnt.");
    return NextResponse.json({ error: "webhook_secret_missing" }, { status: 500 });
  }
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "missing_svix_headers" }, { status: 400 });
  }

  let event;
  try {
    const resend = getResend();
    event = resend.webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch (e: any) {
    console.error("Resend-Webhook: ungueltige Signatur.", e?.message);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Nur Email-Events haben eine email_id, mit der wir funnel_versand_log
  // zuordnen koennen (Contact-/Domain-/Suppression-Events ignorieren wir hier).
  const emailId = (event as any)?.data?.email_id as string | undefined;
  if (!emailId) {
    return NextResponse.json({ ok: true, ignoriert: true });
  }

  const supabase = getSupabaseAdmin();
  const jetzt = new Date().toISOString();

  // Zuordnung ueber resend_email_id kann entweder ein Funnel-Mail-Versand oder
  // ein Kampagnen-Versand sein (beide Tabellen haben dasselbe Tracking-Schema).
  const { data: funnelEintrag } = await supabase
    .from("funnel_versand_log")
    .select("id, geoeffnet_am, geklickt_am, anzahl_oeffnungen, anzahl_klicks")
    .eq("resend_email_id", emailId)
    .maybeSingle();

  const tabelle = funnelEintrag ? "funnel_versand_log" : "kampagnen_versand_log";
  let eintrag = funnelEintrag as
    | { id: string; geoeffnet_am: string | null; geklickt_am: string | null; anzahl_oeffnungen: number | null; anzahl_klicks: number | null }
    | null;

  if (!eintrag) {
    const { data: kampagnenEintrag } = await supabase
      .from("kampagnen_versand_log")
      .select("id, geoeffnet_am, geklickt_am, anzahl_oeffnungen, anzahl_klicks")
      .eq("resend_email_id", emailId)
      .maybeSingle();
    eintrag = kampagnenEintrag;
  }

  if (!eintrag) {
    // Kein passender Log-Eintrag (z.B. Test-Mail ueber /email-test) - trotzdem 200,
    // damit Resend den Webhook nicht als fehlgeschlagen markiert und erneut sendet.
    return NextResponse.json({ ok: true, keinEintrag: true });
  }

  switch (event.type) {
    case "email.delivered":
      await supabase
        .from(tabelle)
        .update({ zugestellt_am: jetzt })
        .eq("id", eintrag.id)
        .is("zugestellt_am", null);
      break;

    case "email.opened":
      await supabase
        .from(tabelle)
        .update({
          geoeffnet_am: eintrag.geoeffnet_am ?? jetzt,
          zuletzt_geoeffnet_am: jetzt,
          anzahl_oeffnungen: (eintrag.anzahl_oeffnungen ?? 0) + 1,
        })
        .eq("id", eintrag.id);
      break;

    case "email.clicked":
      await supabase
        .from(tabelle)
        .update({
          geklickt_am: eintrag.geklickt_am ?? jetzt,
          zuletzt_geklickt_am: jetzt,
          anzahl_klicks: (eintrag.anzahl_klicks ?? 0) + 1,
        })
        .eq("id", eintrag.id);
      break;

    case "email.bounced":
      await supabase
        .from(tabelle)
        .update({ bounced_am: jetzt })
        .eq("id", eintrag.id)
        .is("bounced_am", null);
      break;

    case "email.complained":
      await supabase
        .from(tabelle)
        .update({ beschwerde_am: jetzt })
        .eq("id", eintrag.id)
        .is("beschwerde_am", null);
      break;

    default:
      // Andere Event-Typen (sent, delivery_delayed, failed, ...) werden
      // aktuell nicht separat abgebildet.
      break;
  }

  return NextResponse.json({ ok: true });
}
