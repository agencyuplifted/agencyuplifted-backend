import type { getSupabaseAdmin } from "./supabase";
import { findeOrganisationPerName } from "./kontakt-suche";

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

// Vergleichsform fuer Organisationsnamen: Rechtsform, Satzzeichen und
// Gross-/Kleinschreibung zaehlen nicht -- "Cromatics" und "CROMATICS GmbH"
// sind fuer die Dubletten-Warnung dieselbe Firma.
export function organisationsSchluessel(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\b(gmbh|mbh|ag|ug|kg|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|co|haftungsbeschraenkt|haftungsbeschränkt|ltd|inc|llc|se|partg)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, "")
    .trim();
}

// Organisation fuer einen eingetippten Namen:
// 1. exakter Name (Gross/klein egal) -> bestehende,
// 2. gleiche Vergleichsform ("Cromatics" = "CROMATICS GmbH") -> bestehende,
// 3. nur teilweise aehnlich -> Rueckfrage an den Aufrufer (ausser neuErzwingen),
// 4. sonst neu anlegen.
// Genutzt vom Teilnehmer-Formular, der Schnellanlage am Termin und der
// Teilnehmer-Seite (Markus 10/2026: Michael Fischer bekam nur einen Freitext,
// die Firma entstand nie unter Organisationen).
export async function organisationFuerNamen(
  supabase: any,
  name: string,
  neuErzwingen = false
): Promise<{ id: string; name: string; neu: boolean } | { aehnlich: string[] } | { fehler: string }> {
  const wert = name.trim();
  if (!wert) return { fehler: "Bitte einen Namen angeben." };
  const exakt = await findeOrganisationPerName(supabase, wert);
  if (exakt) return { id: exakt.id, name: exakt.name, neu: false };

  const schluessel = organisationsSchluessel(wert);
  const { data: alle } = await supabase.from("organisationen").select("id, name, erstellt_am").is("deaktiviert_am", null).order("erstellt_am").limit(5000);
  const liste = (alle || []).map((o: any) => ({ id: o.id as string, name: String(o.name || ""), s: organisationsSchluessel(String(o.name || "")) }));
  const gleich = schluessel ? liste.find((o: { s: string }) => o.s === schluessel) : null;
  if (gleich) return { id: gleich.id, name: gleich.name, neu: false };

  if (!neuErzwingen && schluessel.length >= 4) {
    // Teilstring nur ab 4 Zeichen, sonst traefe "ag" jede Agentur
    const aehnlich = liste
      .filter((o: { s: string }) => o.s.length >= 4 && (o.s.includes(schluessel) || schluessel.includes(o.s)))
      .map((o: { name: string }) => o.name)
      .slice(0, 5);
    if (aehnlich.length) return { aehnlich };
  }

  const { data: neu, error } = await supabase.from("organisationen").insert({ name: wert }).select("id, name").single();
  if (error || !neu) return { fehler: error?.message || "Organisation konnte nicht angelegt werden." };
  return { id: neu.id, name: neu.name, neu: true };
}

// Manuelle Verknuepfung (Formulare): idempotent, erste Organisation wird
// Hauptorganisation.
export async function verknuepfeTeilnehmerMitOrganisationManuell(supabase: any, teilnehmerId: string, organisationId: string): Promise<string | null> {
  const { data: bestehend } = await supabase
    .from("teilnehmer_organisationen")
    .select("id")
    .eq("teilnehmer_id", teilnehmerId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (bestehend) return null;
  const { count } = await supabase.from("teilnehmer_organisationen").select("id", { count: "exact", head: true }).eq("teilnehmer_id", teilnehmerId);
  const { error } = await supabase.from("teilnehmer_organisationen").insert({
    teilnehmer_id: teilnehmerId,
    organisation_id: organisationId,
    ist_hauptorganisation: (count || 0) === 0,
    quelle: "manuell",
  });
  return error ? error.message : null;
}
