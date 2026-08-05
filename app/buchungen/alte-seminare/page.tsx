export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, monatsName } from "@/lib/format";
import { ordneLegacyBuchungZu, ordneLegacyGruppeZu } from "@/lib/actions";

export default async function AlteSeminareZuordnenPage() {
  const supabase = getSupabaseAdmin();

  const { data: legacyBuchungen } = await supabase
    .from("legacy_buchungen")
    .select(
      "id, jahr, kategorie_rohtext, seminartyp_id, seminartermin_id, seminartypen(name), teilnehmer(vorname, nachname), organisationen(name), seminartermine(kennung, titel, datum_start)"
    )
    .order("jahr", { ascending: false });

  const { data: alleTermine } = await supabase
    .from("seminartermine")
    .select("id, kennung, titel, datum_start, seminartyp_id")
    .not("kennung", "is", null)
    .order("datum_start", { ascending: true });

  const rows = legacyBuchungen || [];
  const gesamt = rows.length;
  const offen = rows.filter((r: any) => !r.seminartermin_id).length;

  // Gruppieren nach Jahr + Seminartyp (bzw. Rohtext, wenn kein Seminartyp existiert, z. B. "Konferenz")
  type Gruppe = { jahr: number; seminartypId: string | null; label: string; rows: any[] };
  const gruppenMap = new Map<string, Gruppe>();
  rows.forEach((r: any) => {
    const label = r.seminartypen?.name || r.kategorie_rohtext || "Unbekannt";
    const key = `${r.jahr}__${r.seminartyp_id || "none-" + label}`;
    if (!gruppenMap.has(key)) {
      gruppenMap.set(key, { jahr: r.jahr, seminartypId: r.seminartyp_id, label, rows: [] });
    }
    gruppenMap.get(key)!.rows.push(r);
  });
  const gruppen = [...gruppenMap.values()].sort((a, b) => (b.jahr - a.jahr) || a.label.localeCompare(b.label));

  return (
    <main>
      <h1>Alte Seminare zuordnen</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        Die importierten Alt-Buchungen kennen nur Kategorie und Jahr, kein genaues Datum. Ordne hier jede
        Gruppe (oder einzelne Buchung) manuell dem passenden, rückwirkend angelegten Seminartermin zu.
      </p>

      <div className="au-card" style={{ display: "flex", gap: "2rem" }}>
        <div><strong>{gesamt}</strong> Alt-Buchungen gesamt</div>
        <div><strong>{offen}</strong> noch ohne Termin-Zuordnung</div>
      </div>

      {gruppen.map((g) => {
        const passendeTermine = (alleTermine || []).filter((t: any) =>
          g.seminartypId ? t.seminartyp_id === g.seminartypId : false
        );
        const optionLabel = (t: any) =>
          `${t.kennung} – ${monatsName(new Date(t.datum_start).getMonth())} ${new Date(t.datum_start).getFullYear()}`;

        return (
          <div className="au-card" key={`${g.jahr}-${g.label}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
              <h2 style={{ margin: 0 }}>{g.label} · {g.jahr} <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>({g.rows.length})</span></h2>

              {passendeTermine.length > 0 ? (
                <form action={ordneLegacyGruppeZu} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input type="hidden" name="jahr" value={g.jahr} />
                  {g.seminartypId && <input type="hidden" name="seminartyp_id" value={g.seminartypId} />}
                  <select className="au-input" name="seminartermin_id" style={{ minWidth: 220 }} required>
                    <option value="">Termin wählen …</option>
                    {passendeTermine.map((t: any) => (
                      <option key={t.id} value={t.id}>{optionLabel(t)}</option>
                    ))}
                  </select>
                  <button type="submit" className="au-btn au-btn-secondary au-btn-sm">
                    Alle {g.rows.length} dieser Gruppe zuordnen
                  </button>
                </form>
              ) : (
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  Kein passender Termin mit Kennung vorhanden{g.seminartypId ? "" : " (keine Seminarart hinterlegt)"}
                </span>
              )}
            </div>

            <table className="au-table" style={{ marginTop: "0.75rem" }}>
              <thead>
                <tr>
                  <th>Teilnehmer / Organisation</th>
                  <th>Aktuelle Zuordnung</th>
                  <th>Termin zuordnen</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      {r.teilnehmer ? `${r.teilnehmer.vorname} ${r.teilnehmer.nachname}` : "—"}
                      {r.organisationen?.name ? ` · ${r.organisationen.name}` : ""}
                    </td>
                    <td>
                      {r.seminartermine ? (
                        <span className="au-badge">{r.seminartermine.kennung || r.seminartermine.titel}</span>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)" }}>nicht zugeordnet</span>
                      )}
                    </td>
                    <td>
                      {passendeTermine.length > 0 ? (
                        <form action={ordneLegacyBuchungZu} style={{ display: "flex", gap: "0.5rem" }}>
                          <input type="hidden" name="legacy_buchung_id" value={r.id} />
                          <select className="au-input" name="seminartermin_id" defaultValue={r.seminartermin_id || ""}>
                            <option value="">—</option>
                            {passendeTermine.map((t: any) => (
                              <option key={t.id} value={t.id}>{optionLabel(t)}</option>
                            ))}
                          </select>
                          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Setzen</button>
                        </form>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </main>
  );
}
