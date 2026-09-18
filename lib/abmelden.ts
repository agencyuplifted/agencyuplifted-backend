import { getSupabaseAdmin } from "./supabase";
import { pruefeAbmeldeToken } from "./mail-bausteine";

// Empfaenger zum Abmeldelink finden (Teilnehmer, Lead oder Warteliste).
export async function ladeAbmeldeEmpfaenger(token: string): Promise<{ email: string; vorname: string } | null> {
  const ziel = pruefeAbmeldeToken(token);
  if (!ziel) return null;
  const supabase = getSupabaseAdmin();
  const tabelle = ziel.typ === "t" ? "teilnehmer" : ziel.typ === "l" ? "leads" : "warteliste";
  const spalten = ziel.typ === "t" ? "email, vorname" : "email, name";
  const { data } = await supabase.from(tabelle).select(spalten).eq("id", ziel.id).maybeSingle();
  const d = data as any;
  if (!d?.email) return null;
  return { email: String(d.email).trim().toLowerCase(), vorname: d.vorname || String(d.name || "").split(" ")[0] || "" };
}

export async function istAbgemeldet(email: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from("mail_abmeldungen").select("email").eq("email", email).maybeSingle();
  return !!data;
}

/**
 * Traegt die Adresse in mail_abmeldungen ein und setzt alle Teilnehmer mit
 * dieser Adresse auf "abgemeldet" -- damit greifen auch Kampagnen und
 * Geburtstagsmails, die auf marketing_consent_status schauen.
 */
export async function fuehreAbmeldungDurch(token: string, quelle: "abmeldelink" | "one_click"): Promise<boolean> {
  const empf = await ladeAbmeldeEmpfaenger(token);
  if (!empf) return false;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("mail_abmeldungen").upsert({ email: empf.email, quelle }, { onConflict: "email", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await supabase
    .from("teilnehmer")
    .update({ marketing_consent_status: "abgemeldet" })
    .ilike("email", empf.email.replace(/[%_\\]/g, "\\$&"));
  return true;
}
