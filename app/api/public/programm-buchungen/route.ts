export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getResend, ABSENDER } from "@/lib/email";
import { formatEUR } from "@/lib/format";
import { ermittleKontakte, verknuepfeMitOrganisation, htmlSicher, type Teilnehmerangabe } from "@/lib/buchung-kontakte";
import { sendeSystemMail } from "@/lib/systemmail";
import {
  programmPositionspreis,
  zahlweiseText,
  quizProfil,
  PROGRAMM_SYSTEM_MAIL_EINGANG,
  type ProgrammOption,
  type Zahlweise,
} from "@/lib/programm-buchung";

// Oeffentliche Buchungsstrecke fuer Programme (Uplift-Mitgliedschaft …) --
// Schwester von /api/public/buchungen, gleiche Datenbasis: buchungen +
// buchungspositionen (mit programm_id/programm_option_id statt Seminar),
// Status "angefragt", Markus bestaetigt manuell nach Zahlungseingang.
// Preise kommen nie vom Client, sondern aus programm_optionen.

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const fehler = (code: string, status = 400, detail?: string) => withCors(NextResponse.json({ error: code, ...(detail ? { detail } : {}) }, { status }));
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return fehler("invalid_json");
  }

  const optionId = text(body?.programm_option_id);
  const zahlweise = body?.zahlweise as Zahlweise;
  const ansprechpartner = body?.ansprechpartner || {};
  const adresse = body?.rechnungsadresse || {};
  const firma = text(body?.firma);

  if (!optionId || !["monthly", "yearly"].includes(zahlweise)) return fehler("missing_fields");
  if (!text(ansprechpartner.vorname) || !text(ansprechpartner.nachname) || !EMAIL.test(text(ansprechpartner.email))) return fehler("missing_fields");
  if (!text(adresse.strasse) || !text(adresse.plz) || !text(adresse.ort)) return fehler("missing_fields");
  if (body?.vertrauensgarantie_akzeptiert !== true) return fehler("trust_guarantee_not_accepted");

  // Teilnehmer: 1-2 Personen; ohne Angabe nimmt der Ansprechpartner selbst teil
  const rohTeilnehmer: any[] = Array.isArray(body?.teilnehmer) && body.teilnehmer.length ? body.teilnehmer : [ansprechpartner];
  if (rohTeilnehmer.length > 2) return fehler("too_many_participants");
  const personen: Teilnehmerangabe[] = rohTeilnehmer
    .map((p, i) => ({
      firstName: text(p?.vorname),
      lastName: text(p?.nachname),
      email: text(p?.email).toLowerCase(),
      phone: text(p?.telefon) || undefined,
      company: i === 0 ? firma || undefined : undefined,
    }))
    .filter((p) => p.firstName && p.lastName && EMAIL.test(p.email));
  if (personen.length !== rohTeilnehmer.length) return fehler("invalid_participant");

  const quiz = body?.quiz_antworten && typeof body.quiz_antworten === "object" && !Array.isArray(body.quiz_antworten) ? body.quiz_antworten : {};
  if (JSON.stringify(quiz).length > 20_000) return fehler("quiz_too_large");

  const supabase = getSupabaseAdmin();
  const { data: option } = await supabase
    .from("programm_optionen")
    .select("*, programme(id, name, schluessel, aktiv)")
    .eq("id", optionId)
    .maybeSingle();
  if (!option || option.deaktiviert_am || !(option as any).programme?.aktiv) return fehler("option_not_found", 404);
  const programm = (option as any).programme;

  // Preise vorab berechnen -- ungueltige Zahlweise/fehlender Preis bricht ab,
  // bevor irgendetwas angelegt wird
  const preise = personen.map((_, i) => programmPositionspreis(option as ProgrammOption, zahlweise, i));
  const preisFehler = preise.find((p) => "fehler" in p) as { fehler: string } | undefined;
  if (preisFehler) return fehler(preisFehler.fehler);

  const rechnungsadresse = { strasse: text(adresse.strasse), plz: text(adresse.plz), ort: text(adresse.ort) };

  // Ansprechpartner (Rechnungsempfaenger) ggf. zusaetzlich als Kontakt anlegen,
  // falls er/sie nicht selbst teilnimmt
  const ansprechEmail = text(ansprechpartner.email).toLowerCase();
  const nimmtTeil = personen.some((p) => p.email === ansprechEmail);
  const alleKontakte: Teilnehmerangabe[] = nimmtTeil
    ? personen
    : [
        { firstName: text(ansprechpartner.vorname), lastName: text(ansprechpartner.nachname), email: ansprechEmail, phone: text(ansprechpartner.telefon) || undefined, company: firma || undefined },
        ...personen.map((p) => ({ ...p, company: undefined })),
      ];

  const kontakte = await ermittleKontakte(supabase, alleKontakte, rechnungsadresse, "onepage_programmbuchung");
  if (kontakte.fehler) return fehler(kontakte.fehler.code, 500, kontakte.fehler.detail);
  const rechnungsempfaenger = kontakte.teilnehmer.find((t) => t.email === ansprechEmail) || kontakte.teilnehmer[0];
  const teilnehmer = personen.map((p) => kontakte.teilnehmer.find((t) => t.email === p.email)!);

  const { data: buchung, error: buchungError } = await supabase
    .from("buchungen")
    .insert({
      organisation_id: kontakte.organisationId,
      rechnungsempfaenger_teilnehmer_id: rechnungsempfaenger.id,
      status: "angefragt",
      notizen: text(body?.anmerkung) || null,
      metadata: {
        buchungsart: "programm",
        programm_id: programm.id,
        programm_schluessel: programm.schluessel,
        zahlweise,
        trust_guarantee_accepted: true,
        ...(body?.datenschutz_akzeptiert === true ? { privacy_accepted: true } : {}),
        consent_erfasst_am: new Date().toISOString(),
        quiz_antworten: quiz,
      },
    })
    .select("id, buchungsnummer")
    .single();
  if (buchungError || !buchung) return fehler("buchung_fehler", 500, buchungError?.message);

  const positionen = teilnehmer.map((t, i) => {
    const p = preise[i] as { listenpreis: number; metadata: Record<string, unknown> };
    return {
      buchung_id: buchung.id,
      teilnehmer_id: t.id,
      programm_id: programm.id,
      programm_option_id: option.id,
      beschreibung: i === 0 ? option.titel : `${option.titel} – Zusatzteilnehmer`,
      listenpreis: p.listenpreis,
      metadata: { ...p.metadata, ...(i > 0 ? { zusatzteilnehmer: true } : {}) },
    };
  });
  const { error: positionenError } = await supabase.from("buchungspositionen").insert(positionen);
  if (positionenError) {
    // Keine halbe Buchung ohne Positionen stehen lassen
    await supabase.from("buchungen").delete().eq("id", buchung.id);
    return fehler("positionen_fehler", 500, positionenError.message);
  }

  await verknuepfeMitOrganisation(supabase, kontakte.organisationId, kontakte.teilnehmer);

  // Eingangsbestaetigung an alle Teilnehmer (+ Rechnungsempfaenger), Text im
  // Backstage unter Funnel-Mails editierbar
  const empfaenger = new Map<string, string>();
  for (const t of [...teilnehmer, rechnungsempfaenger]) empfaenger.set(t.email, t.vorname);
  await sendeSystemMail(
    supabase,
    PROGRAMM_SYSTEM_MAIL_EINGANG,
    [...empfaenger.entries()].map(([email, vorname]) => ({
      email,
      werte: { vorname, programm: programm.name, option: option.titel, zahlweise: zahlweiseText(option as ProgrammOption, zahlweise) },
    })),
    { typ: "buchung", id: buchung.id }
  );

  // Interne Benachrichtigung an Markus (eigener try/catch: darf die Buchung
  // nicht mehr gefaehrden)
  try {
    const gesamt = positionen.reduce((s, p) => s + Number(p.listenpreis), 0);
    const profil = quizProfil(quiz)
      .map((z) => `<li><strong>${htmlSicher(z.label)}:</strong> ${htmlSicher(z.wert)}</li>`)
      .join("");
    const html = `
      <p style="font-size:1.1em;">🎉 Neue Programm-Buchung: ${htmlSicher(programm.name)}</p>
      <p>
        <strong>Buchungsnummer:</strong> ${buchung.buchungsnummer}<br/>
        <strong>Option:</strong> ${htmlSicher(option.titel)}<br/>
        <strong>Zahlweise:</strong> ${htmlSicher(zahlweiseText(option as ProgrammOption, zahlweise))}<br/>
        <strong>Personen:</strong> ${teilnehmer.length}<br/>
        <strong>Gesamt (netto):</strong> ${formatEUR(gesamt)}<br/>
        <strong>Firma:</strong> ${htmlSicher(firma || "—")}<br/>
        <strong>Ansprechpartner:</strong> ${htmlSicher(`${text(ansprechpartner.vorname)} ${text(ansprechpartner.nachname)}`)} (${htmlSicher(ansprechEmail)})
      </p>
      <ul>${teilnehmer.map((t) => `<li>${htmlSicher(t.vorname)} (${htmlSicher(t.email)})</li>`).join("")}</ul>
      ${profil ? `<p><strong>Quiz-Profil:</strong></p><ul>${profil}</ul>` : ""}
      ${text(body?.anmerkung) ? `<p><strong>Anmerkung:</strong> ${htmlSicher(body.anmerkung)}</p>` : ""}
      <p><a href="https://backstage.agencyuplifted.com/buchungen/${buchung.id}">Buchung in der Verwaltung ansehen</a></p>
    `;
    await getResend().emails.send({
      from: ABSENDER,
      to: ["markus@agencyuplifted.de"],
      subject: `🎉 Neue ${programm.name}-Buchung: ${buchung.buchungsnummer}`,
      html,
    });
  } catch (e: any) {
    console.error("Interne Programm-Buchungs-Benachrichtigung fehlgeschlagen:", e?.message);
  }

  return withCors(NextResponse.json({ ok: true, buchungId: buchung.id, buchungsnummer: buchung.buchungsnummer }));
}
