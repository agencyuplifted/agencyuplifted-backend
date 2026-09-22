import { ladeBausteine, schalterAus, baueMailHtml } from "./mail-bausteine";
import { getResend, ABSENDER } from "./email";
import { renderPlatzhalter } from "./funnel";

// Transaktionale System-Mail (Text aus funnel_mails, im Backstage editierbar)
// sofort an einzelne Empfaenger schicken und im funnel_versand_log
// protokollieren -- gleiches Muster wie Reservierungs-/Zahlungsbestaetigung
// bei Seminaren: Signatur/Rechtliches wie im Funnel, aber nie ein Abmeldelink.
export async function sendeSystemMail(
  supabase: any,
  funnelMailId: string,
  empfaenger: { email: string; werte: Record<string, string> }[],
  bezug: { typ: string; id: string }
): Promise<void> {
  const { data: mail } = await supabase
    .from("funnel_mails")
    .select("betreff, inhalt, baustein_signatur, baustein_rechtliches, geloescht_am")
    .eq("id", funnelMailId)
    .maybeSingle();
  if (!mail || mail.geloescht_am) return;
  const bausteine = await ladeBausteine(supabase);

  for (const e of empfaenger) {
    let status: "gesendet" | "fehler" = "gesendet";
    let fehlermeldung: string | null = null;
    let resendEmailId: string | null = null;
    try {
      const html = baueMailHtml(renderPlatzhalter(mail.inhalt, e.werte), bausteine, { ...schalterAus(mail), abmelden: false }, null);
      const { data, error } = await getResend().emails.send({
        from: ABSENDER,
        to: [e.email],
        subject: renderPlatzhalter(mail.betreff, e.werte),
        html,
      });
      if (error) {
        status = "fehler";
        fehlermeldung = error.message;
      } else {
        resendEmailId = data?.id || null;
      }
    } catch (err: any) {
      status = "fehler";
      fehlermeldung = err?.message || "Unbekannter Fehler beim Versand.";
    }
    await supabase.from("funnel_versand_log").insert({
      funnel_mail_id: funnelMailId,
      bezug_typ: bezug.typ,
      bezug_id: bezug.id,
      empfaenger_email: e.email,
      status,
      fehlermeldung,
      resend_email_id: resendEmailId,
    });
  }
}
