import Link from "next/link";
import { requireMitglied } from "@/lib/netzwerk";
import { initialen, AGENTUR_ROLLE_LABEL } from "../hilfen";

export const metadata = { title: "Verzeichnis" };

type Filter = { ansicht?: string; q?: string; spezialisierung?: string; standort?: string };

export default async function VerzeichnisPage({ searchParams }: { searchParams: Promise<Filter> }) {
  const f = await searchParams;
  const ansicht = f.ansicht === "agenturen" ? "agenturen" : "personen";
  // Mitglieder-Session: RLS liefert nur aktive, sichtbare Mitglieder und
  // nur die freigegebenen Spalten.
  const { client, teilnehmerId } = await requireMitglied();
  const [{ data: personen, error }, { data: staerken }] = await Promise.all([
    client
      .from("teilnehmer")
      .select("id, vorname, nachname, position, netzwerk_spezialisierungen, netzwerk_standort, teilnehmer_organisationen(agentur_rolle, ist_hauptorganisation, organisationen(id, name, rechnungsadresse_ort))")
      .order("nachname"),
    client.from("verbindungsstaerke").select("teilnehmer_a_id, teilnehmer_b_id, staerke").or(`teilnehmer_a_id.eq.${teilnehmerId},teilnehmer_b_id.eq.${teilnehmerId}`),
  ]);
  if (error) throw new Error(error.message);

  const staerkeZu = new Map<string, number>();
  for (const s of staerken || []) staerkeZu.set(s.teilnehmer_a_id === teilnehmerId ? s.teilnehmer_b_id : s.teilnehmer_a_id, s.staerke);

  const liste = (personen || []).map((p: any) => {
    const orgs = (p.teilnehmer_organisationen || []).filter((z: any) => z.organisationen);
    const haupt = orgs.find((z: any) => z.ist_hauptorganisation) || orgs[0];
    return { ...p, orgs, haupt, standort: p.netzwerk_standort || haupt?.organisationen?.rechnungsadresse_ort || null };
  });
  const alleSpezialisierungen = Array.from(new Set(liste.flatMap((p: any) => p.netzwerk_spezialisierungen || []))).sort();
  const alleStandorte = Array.from(new Set(liste.map((p: any) => p.standort).filter(Boolean))).sort() as string[];

  const q = (f.q || "").trim().toLowerCase();
  const gefiltert = liste.filter((p: any) => {
    if (q && ![p.vorname, p.nachname, p.position, ...p.orgs.map((z: any) => z.organisationen.name)].join(" ").toLowerCase().includes(q)) return false;
    if (f.spezialisierung && !(p.netzwerk_spezialisierungen || []).includes(f.spezialisierung)) return false;
    if (f.standort && p.standort !== f.standort) return false;
    return true;
  });

  const agenturen = new Map<string, { id: string; name: string; ort: string | null; personen: any[] }>();
  for (const p of gefiltert) {
    for (const z of p.orgs) {
      const o = z.organisationen;
      if (!agenturen.has(o.id)) agenturen.set(o.id, { id: o.id, name: o.name, ort: o.rechnungsadresse_ort, personen: [] });
      agenturen.get(o.id)!.personen.push({ ...p, rolle: z.agentur_rolle });
    }
  }

  const param = (a: string) => {
    const u = new URLSearchParams();
    u.set("ansicht", a);
    if (f.q) u.set("q", f.q);
    if (f.spezialisierung) u.set("spezialisierung", f.spezialisierung);
    if (f.standort) u.set("standort", f.standort);
    return `/netzwerk?${u.toString()}`;
  };

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Verzeichnis</h1>
        <div className="ua-umschalter">
          <Link href={param("personen")} className={ansicht === "personen" ? "aktiv" : ""}>Personen</Link>
          <Link href={param("agenturen")} className={ansicht === "agenturen" ? "aktiv" : ""}>Agenturen</Link>
        </div>
      </div>

      <form method="get" className="ua-filter">
        <input type="hidden" name="ansicht" value={ansicht} />
        <input className="au-input" name="q" defaultValue={f.q || ""} placeholder="Name, Agentur, Position" />
        <select className="au-select" name="spezialisierung" defaultValue={f.spezialisierung || ""}>
          <option value="">Alle Spezialisierungen</option>
          {alleSpezialisierungen.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="au-select" name="standort" defaultValue={f.standort || ""}>
          <option value="">Alle Standorte</option>
          {alleStandorte.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Filtern</button>
      </form>

      {ansicht === "personen" ? (
        <div className="ua-raster">
          {gefiltert.map((p: any) => {
            const staerke = staerkeZu.get(p.id) || 0;
            const ich = p.id === teilnehmerId;
            return (
              <Link key={p.id} href={`/netzwerk/person/${p.id}`} className="ua-karte ua-person">
                <div className="ua-zeile">
                  <span className="ua-avatar">{initialen(p.vorname, p.nachname)}</span>
                  <div style={{ minWidth: 0 }}>
                    <strong>{p.vorname} {p.nachname}</strong>{ich && <span className="ua-klein"> (du)</span>}
                    <div className="ua-klein">
                      {[p.position, p.haupt?.organisationen?.name].filter(Boolean).join(" · ")}
                    </div>
                    {p.standort && <div className="ua-klein">📍 {p.standort}</div>}
                  </div>
                </div>
                {(p.netzwerk_spezialisierungen || []).length > 0 && (
                  <div className="ua-tags">{p.netzwerk_spezialisierungen.slice(0, 5).map((s: string) => <span key={s} className="ua-tag">{s}</span>)}</div>
                )}
                {!ich && (
                  <div className="ua-faden" title={`Verbindung ${staerke}/100`}>
                    <span style={{ width: `${staerke}%` }} />
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="ua-raster">
          {Array.from(agenturen.values()).sort((a, b) => a.name.localeCompare(b.name)).map((a) => (
            <Link key={a.id} href={`/netzwerk/agentur/${a.id}`} className="ua-karte ua-person">
              <strong>{a.name}</strong>
              {a.ort && <div className="ua-klein">📍 {a.ort}</div>}
              <div className="ua-klein" style={{ marginTop: "0.4rem" }}>
                {a.personen.map((p: any) => `${p.vorname} ${p.nachname}${AGENTUR_ROLLE_LABEL[p.rolle] ? ` (${AGENTUR_ROLLE_LABEL[p.rolle]})` : ""}`).join(", ")}
              </div>
            </Link>
          ))}
        </div>
      )}
      {!gefiltert.length && <div className="ua-karte ua-klein">Niemand gefunden.</div>}
    </main>
  );
}
