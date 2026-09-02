export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { stornierSeminartermin } from "@/lib/actions";

export default async function TerminStornierenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name)")
    .eq("id", id)
    .single();

  if (!termin) return <main><p>Termin nicht gefunden.</p></main>;

  const titelAnzeige = termin.titel || termin.seminartypen?.name;

  if (termin.status === "abgesagt") {
    return (
      <main>
        <p><Link href={`/termine/${id}`}>← Zurück zum Termin</Link></p>
        <h1>Termin stornieren</h1>
        <div className="au-card">
          <p style={{ margin: 0 }}>
            <strong>{titelAnzeige}</strong>
            {termin.kennung ? <span className="au-badge" style={{ marginLeft: "0.6rem" }}>{termin.kennung}</span> : null}
            {" "}ist bereits storniert. Über die Termin-Detailseite kann er bei Bedarf wieder aktiviert werden.
          </p>
        </div>
      </main>
    );
  }

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("id, teilnehmer_id, buchung_id, teilnehmer(vorname, nachname), buchungen!inner(id, buchungsnummer, status)")
    .eq("seminartermin_id", id)
    .neq("buchungen.status", "storniert");

  const { count: legacyCount } = await supabase
    .from("legacy_buchungen")
    .select("id", { count: "exact", head: true })
    .eq("seminartermin_id", id);

  const betroffen = positionen || [];

  return (
    <main>
      <p><Link href={`/termine/${id}`}>← Zurück zum Termin</Link></p>
      <h1>Termin stornieren</h1>

      <div className="au-card">
        <h2>
          {titelAnzeige}
          {termin.kennung ? <span className="au-badge" style={{ marginLeft: "0.6rem" }}>{termin.kennung}</span> : null}
        </h2>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
          {termin.seminartypen?.name} · {formatDatum(termin.datum_start)}
        </p>
      </div>

      <div className="au-card">
        <p style={{ margin: 0 }}>
          Der Termin verschwindet danach aus der Liste der aktiven Seminare und aus der öffentlichen Website
          (Katalog, Detailseite, Buchungsformular). Bestehende Buchungen bleiben erhalten und werden{" "}
          <strong>nicht</strong> automatisch storniert oder gelöscht — Du kannst den Termin jederzeit wieder aktivieren.
        </p>
      </div>

      {betroffen.length > 0 ? (
        <div className="au-card" style={{ borderColor: "var(--color-danger, #c0392b)" }}>
          <p style={{ marginTop: 0 }}>
            <strong>Achtung: {betroffen.length} aktive Buchungsposition(en) hängen an diesem Termin.</strong>{" "}
            Bitte die Teilnehmer nach der Stornierung einzeln über die jeweilige Buchung auf einen anderen Termin umbuchen.
          </p>
          <ul>
            {betroffen.map((p: any) => (
              <li key={p.id}>
                {p.teilnehmer?.vorname} {p.teilnehmer?.nachname} —{" "}
                <Link href={`/buchungen/${p.buchung_id}`}>
                  Buchung {p.buchungen?.buchungsnummer || p.buchung_id} ansehen / umbuchen
                </Link>
              </li>
            ))}
          </ul>
          {legacyCount ? (
            <p style={{ color: "var(--color-text-muted)" }}>
              Zusätzlich {legacyCount} Alt-Buchung(en) (Legacy) sind diesem Termin zugeordnet.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="au-card">
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Keine aktiven Buchungen an diesem Termin — die Stornierung betrifft niemanden direkt.
          </p>
        </div>
      )}

      <div className="au-card">
        <form action={stornierSeminartermin}>
          <input type="hidden" name="seminartermin_id" value={id} />
          <label htmlFor="grund" style={{ display: "block", marginBottom: "0.4rem", fontWeight: 600 }}>
            Grund (optional, erscheint im Änderungsprotokoll)
          </label>
          <textarea
            id="grund"
            name="grund"
            rows={3}
            placeholder="z. B. zu wenig Teilnehmer"
            style={{ width: "100%", marginBottom: "1rem" }}
          />
          <button type="submit" className="au-btn au-btn-danger-solid">
            Ja, Termin stornieren
          </button>
        </form>
      </div>
    </main>
  );
}
