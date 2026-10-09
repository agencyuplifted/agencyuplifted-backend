export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import BuchungForm from "./BuchungForm";

export default async function NeueBuchungPage({
  searchParams,
}: {
  searchParams: Promise<{ teilnehmer_id?: string; seminartermin_id?: string }>;
}) {
  const { teilnehmer_id, seminartermin_id } = await searchParams;
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase
    .from("teilnehmer")
    .select("id, vorname, rufname, nachname, email, firma_freitext, deaktiviert_am, teilnehmer_organisationen(ist_hauptorganisation, organisation_id, organisationen(name))")
    .order("nachname");
  const { data: organisationen } = await supabase.from("organisationen").select("*").order("name");
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), seminartermin_optionen(*, preisstaffeln(*))")
    .order("datum_start");

  return (
    <main>
      <h1>Neue Buchung</h1>
      <p style={{ color: "#666" }}>Erfasst eine Buchung, wie sie z. B. per E-Mail reinkommt — ersetzt die Doppelerfassung zwischen Alt-System und FastBill.</p>
      <BuchungForm
        teilnehmer={(teilnehmer as any) || []}
        organisationen={organisationen || []}
        termine={(termine as any) || []}
        initialTeilnehmerId={teilnehmer_id || ""}
        initialSeminarterminId={seminartermin_id || ""}
      />
    </main>
  );
}
