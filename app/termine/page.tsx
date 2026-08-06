export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum, monatsName } from "@/lib/format";
import { duplicateSeminartermin } from "@/lib/actions";

function gruppeProMonat(liste: any[]) {
  const proMonat = new Map<string, any[]>();
  liste.forEach((t: any) => {
    const d = new Date(t.datum_start);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!proMonat.has(key)) proMonat.set(key, []);
    proMonat.get(key)!.push(t);
  });
  return proMonat;
}

function TerminTabelle({
  termine,
  gebuchtProTermin,
  gesamtProTermin,
  heuteISO,
}: {
  termine: any[];
  gebuchtProTermin: Map<string, number>;
  gesamtProTermin: Map<string, number>;
  heuteISO: string;
}) {
  const proMonat = gruppeProMonat(termine);
  const monatsSchluessel = [...proMonat.keys()];

  return (
    <>
      {monatsSchluessel.map((key) => {
        const [jahrStr, monatStr] = key.split("-");
        const liste = proMonat.get(key)!;
        return (
          <div className="au-card" key={key}>
            <h2>{monatsName(Number(monatStr))} {jahrStr}</h2>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Titel</th>
                  <th>Kennung</th>
                  <th>Datum</th>
                  <th>Ort</th>
                  <th>Format</th>
                  <th>Belegung</th>
                  <th>Status</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((t: any) => {
                  const gebucht = gebuchtProTermin.get(t.id) || 0;
                  const gesamt = gesamtProTermin.get(t.id) || 0;
                  const vergangen = t.datum_start < heuteISO;
                  return (
                    <tr key={t.id} style={vergangen ? { opacity: 0.6 } : undefined}>
                      <td><Link href={`/termine/${t.id}`}>{t.titel || t.seminartypen?.name}</Link></td>
                      <td>{t.kennung ? <span className="au-badge">{t.kennung}</span> : "—"}</td>
                      <td>{formatDatum(t.datum_start)}{t.zeit_start ? `, ${t.zeit_start.slice(0, 5)} Uhr` : ""}</td>
                      <td>{t.veranstaltungsorte?.name || "—"}</td>
                      <td>{t.format}</td>
                      <td>
                        TN {gebucht} von {t.kapazitaet}
                        <br />
                        <span style={{ color: "var(--color-text-muted)", fontSize: "0.82rem" }}>
                          Gesamt (TN+MA+Gastreferent): {gesamt}
                        </span>
                      </td>
                      <td>{t.status}</td>
                      <td>
                        <form action={duplicateSeminartermin}>
                          <input type="hidden" name="seminartermin_id" value={t.id} />
                          <button
                            type="submit"
                            title="Termin inkl. Optionen, Preisstaffeln und Urgency-Stufen duplizieren"
                            className="au-btn au-btn-secondary au-btn-sm"
                          >
                            Duplizieren
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export default async function TerminePage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrRaw } = await searchParams;
  const heute = new Date();
  const jahr = Number(jahrRaw) || heute.getFullYear();

  const supabase = getSupabaseAdmin();
  const { data: termine } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name, ort)")
    .gte("datum_start", `${jahr}-01-01`)
    .lte("datum_start", `${jahr}-12-31`)
    .order("datum_start", { ascending: true });

  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("seminartermin_id, teilnehmer_id, buchungen!inner(status), teilnehmer(rolle)")
    .neq("buchungen.status", "storniert");

  const { data: legacyPositionen } = await supabase
    .from("legacy_buchungen")
    .select("seminartermin_id, teilnehmer_id, teilnehmer(rolle)")
    .not("seminartermin_id", "is", null);

  // Belegung = Anzahl unterschiedlicher Teilnehmer pro Termin (aktuell + Alt-Daten
  // zusammengeführt, doppelt gezählte Personen vermieden). Mitarbeiter/Gastreferenten
  // zaehlen nicht als belegter Platz.
  const teilnehmerProTermin = new Map<string, Set<string>>();
  const zaehleEin = (seminarterminId: string | null, teilnehmerId: string | null, rolle: string | null | undefined) => {
    if (!seminarterminId || !teilnehmerId) return;
    if (rolle && rolle !== "teilnehmer") return;
    if (!teilnehmerProTermin.has(seminarterminId)) teilnehmerProTermin.set(seminarterminId, new Set());
    teilnehmerProTermin.get(seminarterminId)!.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleEin(p.seminartermin_id, p.teilnehmer_id, p.teilnehmer?.rolle));
  (legacyPositionen || []).forEach((l: any) => zaehleEin(l.seminartermin_id, l.teilnehmer_id, l.teilnehmer?.rolle));

  const gebuchtProTermin = new Map<string, number>();
  teilnehmerProTermin.forEach((set, id) => gebuchtProTermin.set(id, set.size));

  // Gesamtsumme (TN + Mitarbeiter + Gastreferent + Organisator) fuer die Zimmerplanung,
  // unabhaengig von der Rolle - jede Person, die vor Ort ist, braucht ein Bett.
  const alleProTermin = new Map<string, Set<string>>();
  const zaehleAlleEin = (seminarterminId: string | null, teilnehmerId: string | null) => {
    if (!seminarterminId || !teilnehmerId) return;
    if (!alleProTermin.has(seminarterminId)) alleProTermin.set(seminarterminId, new Set());
    alleProTermin.get(seminarterminId)!.add(teilnehmerId);
  };
  (positionen || []).forEach((p: any) => zaehleAlleEin(p.seminartermin_id, p.teilnehmer_id));
  (legacyPositionen || []).forEach((l: any) => zaehleAlleEin(l.seminartermin_id, l.teilnehmer_id));

  const gesamtProTermin = new Map<string, number>();
  alleProTermin.forEach((set, id) => gesamtProTermin.set(id, set.size));

  const heuteISO = heute.toISOString().slice(0, 10);
  const anstehend = (termine || []).filter((t: any) => t.datum_start >= heuteISO);
  const alt = (termine || [])
    .filter((t: any) => t.datum_start < heuteISO)
    .sort((a: any, b: any) => (a.datum_start < b.datum_start ? 1 : -1));

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Seminartermine</h1>
        <Link href="/termine/neu" className="au-btn au-btn-primary">+ Neuer Termin</Link>
      </div>

      <div className="au-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href={`/termine?jahr=${jahr - 1}`} className="au-btn au-btn-secondary au-btn-sm">← {jahr - 1}</Link>
        <strong style={{ fontSize: "1.15rem" }}>{jahr} · {termine?.length || 0} Termin(e)</strong>
        <Link href={`/termine?jahr=${jahr + 1}`} className="au-btn au-btn-secondary au-btn-sm">{jahr + 1} →</Link>
      </div>

      {!termine?.length && (
        <div className="au-card">
          <p style={{ margin: 0 }}>Keine Seminartermine in {jahr}.</p>
        </div>
      )}

      {anstehend.length > 0 && (
        <>
          <h2 style={{ marginTop: "1.5rem" }}>Anstehende Seminare</h2>
          <TerminTabelle termine={anstehend} gebuchtProTermin={gebuchtProTermin} gesamtProTermin={gesamtProTermin} heuteISO={heuteISO} />
        </>
      )}

      {alt.length > 0 && (
        <>
          <h2 style={{ marginTop: "1.5rem", color: "var(--color-text-muted)" }}>Alte Seminare</h2>
          <TerminTabelle termine={alt} gebuchtProTermin={gebuchtProTermin} gesamtProTermin={gesamtProTermin} heuteISO={heuteISO} />
        </>
      )}
    </main>
  );
}
