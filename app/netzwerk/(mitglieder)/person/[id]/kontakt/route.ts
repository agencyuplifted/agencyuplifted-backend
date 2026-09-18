import { NextRequest, NextResponse } from "next/server";
import { requireMitglied } from "@/lib/netzwerk";
import { getSupabaseAdmin } from "@/lib/supabase";
import { berlinHeute } from "@/lib/events";
import { whatsappNummer, kanonischesPaar } from "../../../../hilfen";

// Schnellkontakt mit passiver Erfassung: vor dem Weiterleiten zu WhatsApp/
// Mail/Telefon/LinkedIn wird "kontakt_aufgenommen" als Verbindungs-Event
// notiert -- hoechstens einmal pro Paar und Tag (quelle_schluessel), damit
// mehrfaches Klicken die Fadenstaerke nicht aufblaest.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, teilnehmerId } = await requireMitglied();
  const { data: p } = await client.from("teilnehmer").select("id, email, telefon, mobiltelefon, linkedin_url").eq("id", id).maybeSingle();
  if (!p || id === teilnehmerId) return NextResponse.redirect(new URL("/netzwerk", request.url));

  const weg = request.nextUrl.searchParams.get("weg");
  const wa = whatsappNummer(p.mobiltelefon);
  const ziel =
    weg === "whatsapp" && wa ? `https://wa.me/${wa}` :
    weg === "mail" && p.email ? `mailto:${p.email}` :
    weg === "telefon" && (p.mobiltelefon || p.telefon) ? `tel:${String(p.mobiltelefon || p.telefon).replace(/[^\d+]/g, "")}` :
    weg === "linkedin" && p.linkedin_url && /^https?:\/\//i.test(p.linkedin_url) ? p.linkedin_url :
    null;
  if (!ziel) return NextResponse.redirect(new URL(`/netzwerk/person/${id}`, request.url));

  const [a, b] = kanonischesPaar(teilnehmerId, id);
  await getSupabaseAdmin()
    .from("verbindungs_events")
    .upsert(
      { teilnehmer_a_id: a, teilnehmer_b_id: b, typ: "kontakt_aufgenommen", quelle_schluessel: `kontakt:${berlinHeute()}`, quelle_bezeichnung: "Kontakt über das Netzwerk" },
      { onConflict: "teilnehmer_a_id,teilnehmer_b_id,typ,quelle_schluessel", ignoreDuplicates: true }
    );
  return NextResponse.redirect(ziel);
}
