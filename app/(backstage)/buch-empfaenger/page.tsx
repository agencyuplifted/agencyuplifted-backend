export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";

// Kategorien sind seit der Erweiterbarkeit (buch_kontakt_kategorien) freier
// Text - hier nur noch die Badge-Farbe je nach bekannter Kategorie, alle
// anderen (Journalist, Redakteur, Pitch-Berater, ...) bekommen eine
// einheitliche neutrale Presse-/Extern-Farbe.
function typBadgeKlasse(typ: string) {
  if (typ === "Mitarbeiter") return "au-badge-neutral";
  if (typ === "Agenturunternehmer") return "au-badge-gold";
  return "au-badge-warning";
}

const STATUS_LABEL: Record<string, string> = {
  neu: "Neu",
  bestand: "Bestand",
};

function formatDatum(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function BuchEmpfaengerPage() {
  const supabase = getSupabaseAdmin();
  const { data: empfaenger } = await supabase
    .from("buch_empfaenger")
    .select("*")
    .order("erstellt_am", { ascending: false });

  const gesamt = empfaenger?.length || 0;
  const potenzielleLeads = empfaenger?.filter((e: any) => e.typ === "Agenturunternehmer").length || 0;

  return (
    <main>
      <h1>Buch-Empfänger</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Alle Personen, die ein Rezensions- oder Gratisexemplar erhalten haben – getrennt von der
        Teilnehmer-Liste, da es sich (bei Agenturunternehmern) um potenzielle Leads handelt.
        Wird automatisch aus dem Buch-Versand befüllt.
      </p>

      <div className="au-card">
        <h2>
          {gesamt} Empfänger · davon {potenzielleLeads} potenzielle Leads (Agenturunternehmer)
        </h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Firma</th>
              <th>E-Mail</th>
              <th>Typ</th>
              <th>Status</th>
              <th>Erhalten am</th>
            </tr>
          </thead>
          <tbody>
            {empfaenger?.map((e: any) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600 }}>{e.name}</td>
                <td>{e.firma || "—"}</td>
                <td>{e.email || "—"}</td>
                <td>
                  <span className={`au-badge ${typBadgeKlasse(e.typ)}`}>{e.typ}</span>
                </td>
                <td>
                  {e.status ? (
                    <span className={`au-badge ${e.status === "neu" ? "au-badge-success" : "au-badge-neutral"}`}>
                      {STATUS_LABEL[e.status] || e.status}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{formatDatum(e.erstellt_am)}</td>
              </tr>
            ))}
            {!empfaenger?.length && (
              <tr className="au-table-empty">
                <td colSpan={6}>Noch keine Buch-Empfänger erfasst.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
