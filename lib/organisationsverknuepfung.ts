import type { getSupabaseAdmin } from "./supabase";

// Verknuepft einen Teilnehmer automatisch mit einer Organisation, wenn eine
// Buchung ueber diese Organisation abgerechnet wird (Quelle "buchung"),
// verwendet sowohl von der manuellen Buchung (lib/actions.ts::createBuchung)
// als auch von der oeffentlichen Buchungs-API
// (app/api/public/buchungen/route.ts), damit teilnehmer_organisationen nicht
// erneut veraltet, sobald neue Buchungen reinkommen.
//
// Idempotent: eine bereits bestehende Verknuepfung wird nicht doppelt
// angelegt. Wird nur zur Hauptorganisation, wenn der Teilnehmer noch keine
// hat - bestehende manuelle Zuordnungen werden nie automatisch ueberschrieben.
export async function verknuepfeTeilnehmerMitOrganisationAutomatisch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  teilnehmerId: string,
  organisationId: string
) {
  const { data: bestehend } = await supabase
    .from("teilnehmer_organisationen")
    .select("id")
    .eq("teilnehmer_id", teilnehmerId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (bestehend) return;

  const { count } = await supabase
    .from("teilnehmer_organisationen")
    .select("id", { count: "exact", head: true })
    .eq("teilnehmer_id", teilnehmerId);

  await supabase.from("teilnehmer_organisationen").insert({
    teilnehmer_id: teilnehmerId,
    organisation_id: organisationId,
    ist_hauptorganisation: (count || 0) === 0,
    quelle: "buchung",
  });
}
