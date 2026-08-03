export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import BuchungForm from "./BuchungForm";

export default async function NeueBuchungPage({
  searchParams,
}: {
  searchParams: Promise<{ teilnehmer_id?: string }>;
}) {
  const { teilnehmer_id } = await searchParams;
  const supabase = getSupabaseAdmin();
  const { data: teilnehmer } = await supabase.from("teilnehmer").select("*").order("nachname");
  const { data: organisationen } = await supabase.from("organisationen").select("*").order("name");
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), seminartermin_optionen(*, preisstaffeln(*))")
    .order("datum_start");

  return (
    <main>
      <h1>Neue Buchung</h1>
      <p style={{ color: "#666" }}>Erfasst eine Buchung, wie sie z. B. per E-Mail reinkommt — ersetzt die Doppelerfassung in Pipedrive/FastBill.</p>
      <BuchungForm
        teilnehmer={teilnehmer || []}
        organisationen={organisationen || []}
        termine={(termine as any) || []}
        initialTeilnehmerId={teilnehmer_id || ""}
      />
    </main>
  );
}
