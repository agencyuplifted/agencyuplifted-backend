import { formatDatum } from "./format";
import { getResend, ABSENDER } from "./email";
import { sendeSystemMail } from "./systemmail";
import { PROGRAMM_SYSTEM_MAIL_BESTAETIGT } from "./programm-buchung";
import { ladeBausteine, schalterAus, baueMailHtml } from "./mail-bausteine";
import { renderPlatzhalter } from "./funnel";

// Zahlung erhalten -> Buchung endgueltig bestaetigen: Status, Protokoll und
// Zahlungsbestaetigungs-Mail (Programme: eigene System-Mail). Gemeinsam fuer
// den Klick auf der Buchungsseite (bestaetigeBuchung in lib/actions.ts) und den
// FastBill-Zahlungsabgleich (lib/rechnungen.ts) -- bewusst NICHT in der
// "use server"-Datei, sonst waere die Funktion als Server-Action ohne Login
// von aussen aufrufbar.
export const ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID = "b8c1927c-c660-454c-bb02-e6db2d93e8c0";

export async function bestaetigeBuchungIntern(supabase: any, buchungId: string, bearbeiter: string): Promise<{ programm: boolean }> {
  // bestaetigt_am ist der Stichtag der Funnel-Strecke (siehe lib/funnel.ts)
  const { error } = await supabase.from("buchungen").update({ status: "bestaetigt", bestaetigt_am: new Date().toISOString() }).eq("id", buchungId);
  if (error) throw new Error(error.message);

  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "buchung",
    bezug_id: buchungId,
    ereignis: "bestaetigung",
    beschreibung: "Zahlung erhalten, Buchung endgültig bestätigt.",
    bearbeiter,
  });

  // Programm-Buchungen (Uplift-Mitgliedschaft …) bekommen statt der
  // Seminar-Zahlungsbestaetigung ("das Seminar am …") ihre eigene System-Mail.
  const { data: programmPositionen } = await supabase
    .from("buchungspositionen")
    .select("teilnehmer(vorname, email), programme(name), programm_optionen(titel)")
    .eq("buchung_id", buchungId)
    .not("programm_id", "is", null);
  if (programmPositionen?.length) {
    const { data: buchungMeta } = await supabase
      .from("buchungen")
      .select("rechnungsempfaenger:rechnungsempfaenger_teilnehmer_id(vorname, email)")
      .eq("id", buchungId)
      .maybeSingle();
    const erste: any = programmPositionen[0];
    const empfaenger = new Map<string, string>();
    for (const p of programmPositionen as any[]) if (p.teilnehmer?.email) empfaenger.set(p.teilnehmer.email, p.teilnehmer.vorname || "");
    const re: any = (buchungMeta as any)?.rechnungsempfaenger;
    if (re?.email) empfaenger.set(re.email, re.vorname || "");
    await sendeSystemMail(
      supabase,
      PROGRAMM_SYSTEM_MAIL_BESTAETIGT,
      [...empfaenger.entries()].map(([email, vorname]) => ({
        email,
        werte: { vorname, programm: erste.programme?.name || "", option: erste.programm_optionen?.titel || "" },
      })),
      { typ: "buchung", id: buchungId }
    );
    return { programm: true };
  }

  // Zahlungsbestaetigungs-Mail sofort an alle Teilnehmer dieser Buchung verschicken.
  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("teilnehmer(vorname, email), seminartermine(titel, datum_start, seminartypen(name))")
    .eq("buchung_id", buchungId);

  const ersteSeminarPosition = (positionen || []).find((p: any) => p.seminartermine);
  const seminartitel =
    (ersteSeminarPosition as any)?.seminartermine?.titel ||
    (ersteSeminarPosition as any)?.seminartermine?.seminartypen?.name ||
    "das Seminar";
  const seminardatum = (ersteSeminarPosition as any)?.seminartermine?.datum_start
    ? formatDatum((ersteSeminarPosition as any).seminartermine.datum_start)
    : "";

  const empfaengerMap = new Map<string, string>();
  (positionen || []).forEach((p: any) => {
    if (p.teilnehmer?.email) empfaengerMap.set(p.teilnehmer.email, p.teilnehmer.vorname || "");
  });

  const { data: funnelMail } = await supabase
    .from("funnel_mails")
    .select("betreff, inhalt, baustein_signatur, baustein_rechtliches")
    .eq("id", ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID)
    .single();

  if (funnelMail) {
    // Transaktionale Mail: Signatur/Rechtliches wie im Funnel, aber nie ein Abmeldelink
    const bausteine = await ladeBausteine(supabase);
    for (const [email, vorname] of empfaengerMap) {
      const werte = { vorname, seminartitel, seminardatum };
      const betreff = renderPlatzhalter(funnelMail.betreff, werte);
      const inhaltHtml = baueMailHtml(renderPlatzhalter(funnelMail.inhalt, werte), bausteine, { ...schalterAus(funnelMail), abmelden: false }, null);

      let status: "gesendet" | "fehler" = "gesendet";
      let fehlermeldung: string | null = null;
      let resendEmailId: string | null = null;
      try {
        const resend = getResend();
        const { data, error: sendError } = await resend.emails.send({ from: ABSENDER, to: [email], subject: betreff, html: inhaltHtml });
        if (sendError) {
          status = "fehler";
          fehlermeldung = sendError.message;
        } else {
          resendEmailId = data?.id || null;
        }
      } catch (e: any) {
        status = "fehler";
        fehlermeldung = e?.message || "Unbekannter Fehler beim Versand.";
      }

      await supabase.from("funnel_versand_log").insert({
        funnel_mail_id: ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID,
        bezug_typ: "buchung",
        bezug_id: buchungId,
        empfaenger_email: email,
        status,
        fehlermeldung,
        resend_email_id: resendEmailId,
      });
    }
  }

  return { programm: false };
}
