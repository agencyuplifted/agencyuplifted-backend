import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "./supabase";
import { pruefeSeminarToken } from "./seminar-links";

// Gemeinsamer Einstieg der Teilnehmer-Seiten unter /seminar/<token>/...:
// Token pruefen UND sicherstellen, dass die Person den Termin tatsaechlich
// gebucht hat (nicht storniert) bzw. per Altdaten zugeordnet ist. Alles
// andere -> 404, ohne zu verraten, warum.
export async function ladeSeminarKontext(token: string) {
  const geprueft = pruefeSeminarToken(token);
  if (!geprueft) notFound();
  const supabase = getSupabaseAdmin();
  const [{ data: teilnehmer }, { data: termin }, { data: positionen }, { data: alt }] = await Promise.all([
    supabase.from("teilnehmer").select("id, vorname, nachname, linkedin_url, teilnehmerliste_freigabe, teilnehmerliste_opt_out").eq("id", geprueft.teilnehmerId).maybeSingle(),
    supabase
      .from("seminartermine")
      .select("id, titel, kennung, datum_start, datum_ende, seminartypen(name), veranstaltungsorte(name, ort)")
      .eq("id", geprueft.terminId)
      .maybeSingle(),
    supabase
      .from("buchungspositionen")
      .select("id, buchungen!inner(status)")
      .eq("teilnehmer_id", geprueft.teilnehmerId)
      .eq("seminartermin_id", geprueft.terminId)
      .neq("buchungen.status", "storniert")
      .limit(1),
    supabase.from("legacy_buchungen").select("id").eq("teilnehmer_id", geprueft.teilnehmerId).eq("seminartermin_id", geprueft.terminId).limit(1),
  ]);
  if (!teilnehmer || !termin || (!positionen?.length && !alt?.length)) notFound();
  return { teilnehmer, termin: termin as any, token };
}
