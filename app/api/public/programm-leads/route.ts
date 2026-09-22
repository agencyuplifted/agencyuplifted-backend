export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getResend, ABSENDER } from "@/lib/email";
import { htmlSicher } from "@/lib/buchung-kontakte";
import { quizProfil, ERGEBNIS_TYP_LABEL } from "@/lib/programm-buchung";

// Interessenten ohne Buchung aus dem Programm-Quiz (z. B. "Gruenderpaket" ->
// Gespraech mit Markus, "eher Foundation"). Bewusst leichter als eine
// Buchung: keine Buchungsnummer, kein Status, keine Teilnehmer-Anlage.

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: "invalid_json" }, { status: 400 }));
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const ergebnisTyp = String(body?.ergebnis_typ || "").trim();
  const programmId = String(body?.programm_id || "").trim();
  const quiz = body?.quiz_antworten && typeof body.quiz_antworten === "object" && !Array.isArray(body.quiz_antworten) ? body.quiz_antworten : {};

  if (!EMAIL.test(email) || !/^[a-z0-9_]{1,40}$/.test(ergebnisTyp) || !UUID.test(programmId)) {
    return withCors(NextResponse.json({ error: "missing_fields" }, { status: 400 }));
  }
  if (JSON.stringify(quiz).length > 20_000) return withCors(NextResponse.json({ error: "quiz_too_large" }, { status: 400 }));

  const supabase = getSupabaseAdmin();
  const { data: programm } = await supabase.from("programme").select("id, name").eq("id", programmId).maybeSingle();
  if (!programm) return withCors(NextResponse.json({ error: "programm_not_found" }, { status: 404 }));

  const name = String(body?.name || "").trim().slice(0, 200) || null;
  const { data: lead, error } = await supabase
    .from("programm_leads")
    .insert({ email, name, programm_id: programmId, ergebnis_typ: ergebnisTyp, quiz_antworten: quiz })
    .select("id")
    .single();
  if (error || !lead) return withCors(NextResponse.json({ error: "lead_fehler", detail: error?.message }, { status: 500 }));

  // Markus direkt informieren -- beim Gruenderpaket wartet die Person auf
  // einen Gespraechstermin
  try {
    const profil = quizProfil(quiz)
      .map((z) => `<li><strong>${htmlSicher(z.label)}:</strong> ${htmlSicher(z.wert)}</li>`)
      .join("");
    await getResend().emails.send({
      from: ABSENDER,
      to: ["markus@agencyuplifted.de"],
      subject: `Neuer ${programm.name}-Lead: ${ERGEBNIS_TYP_LABEL[ergebnisTyp] || ergebnisTyp}`,
      html: `
        <p><strong>${htmlSicher(ERGEBNIS_TYP_LABEL[ergebnisTyp] || ergebnisTyp)}</strong> – ${htmlSicher(programm.name)}</p>
        <p>${htmlSicher(name || "ohne Namen")} (${htmlSicher(email)})</p>
        ${profil ? `<ul>${profil}</ul>` : ""}
        <p><a href="https://backstage.agencyuplifted.com/programme/uplift#leads">Leads in der Verwaltung ansehen</a></p>
      `,
    });
  } catch (e: any) {
    console.error("Interne Lead-Benachrichtigung fehlgeschlagen:", e?.message);
  }

  return withCors(NextResponse.json({ ok: true, leadId: lead.id }));
}
