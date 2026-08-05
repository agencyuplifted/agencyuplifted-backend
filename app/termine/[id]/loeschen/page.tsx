export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { loescheSeminartermin } from "@/lib/actions";

export default async function TerminLoeschenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .eq("id", id)
    .single();

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const [
    { count: positionenGesamt },
    { count: positionenAktiv },
    { count: legacyCount },
    { count: optionenCount },
    { count: urgencyCount },
    { count: mitarbeiterCount },
    { count: wartelisteCount },
  ] = await Promise.all([
    supabase.from("buchungspositionen").select("id", { count: "exact", head: true }).eq("seminartermin_id", id),
    supabase
      .from("buchungspositionen")
      .select("id, buchungen!inner(status)", { count: "exact", head: true })
      .eq("seminartermin_id", id)
      .neq("buchungen.status", "storniert"),
    supabase.from("legacy_buchungen").select("id", { count: "exact", head: true }).eq("seminartermin_id", id),
    supabase.from("seminartermin_optionen").select("id", { count: "exact", head: true }).eq("seminartermin_id", id),
    supabase.from("urgency_stufen").select("id", { count: "exact", head: true }).eq("seminartermin_id", id),
    supabase.from("seminartermin_mitarbeiter").select("id", { count: "exact", head: true }).eq("seminartermin_id", id),
    supabase.from("warteliste").select("id", { count: "exact", head: true }).eq("seminartermin_id", id),
  ]);

  const gesperrt = (positionenGesamt || 0) > 0;
  const titelAnzeige = termin.titel || termin.seminartypen?.name;

  return (
    <main>
      <p><Link href={`/termine/${id}`}>← Zurück zum Termin</Link></p>
      <h1>Termin löschen</h1>

      <div className="au-card">
        <h2>
          {titelAnzeige}
          {termin.kennung ? <span className="au-badge" style={{ marginLeft: "0.6rem" }}>{termin.kennung}</span> : null}
        </h2>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
          {termin.seminartypen?.name} · {formatDatum(termin.datum_start)}
        </p>
      </div>

      {gesperrt ? (
        <div className="au-card" style={{ borderColor: "var(--color-danger, #c0392b)" }}>
          <p style={{ margin: 0 }}>
            <strong>Löschen nicht möglich.</strong> Es hängen noch <strong>{positionenGesamt}</strong> Buchungsposition(en) an
            diesem Termin{positionenAktiv ? `, davon ${positionenAktiv} aktiv (nicht storniert)` : " (alle storniert)"}.
            Bitte zuerst die zugehörigen Buchungen umbuchen oder bereinigen — erst danach lässt sich der Termin löschen.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <Link href={`/termine/${id}/teilnehmerliste`} className="au-btn au-btn-secondary">Teilnehmer ansehen</Link>
          </div>
        </div>
      ) : (
        <div className="au-card">
          <p><strong>Das wird beim Löschen mit entfernt:</strong></p>
          <ul>
            <li>{optionenCount || 0} Options(en) inkl. Featurelisten und Preisstaffeln</li>
            <li>{urgencyCount || 0} Urgency-Stufe(n)</li>
            <li>{mitarbeiterCount || 0} Mitarbeiter-Zuordnung(en)</li>
            <li>{wartelisteCount || 0} Wartelisten-Eintrag/Einträge</li>
            <li>{legacyCount || 0} Alt-Buchung(en) verlieren ihre Termin-Zuordnung (Kategorie/Jahr bleibt erhalten, nur wieder "nicht zugeordnet")</li>
          </ul>
          <p style={{ color: "var(--color-text-muted)" }}>
            Buchungspositionen: keine vorhanden — der Termin kann gefahrlos gelöscht werden.
          </p>

          <form action={loescheSeminartermin}>
            <input type="hidden" name="seminartermin_id" value={id} />
            <button type="submit" className="au-btn au-btn-danger-solid">
              Ja, Termin endgültig löschen
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
