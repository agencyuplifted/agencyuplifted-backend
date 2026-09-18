import Link from "next/link";
import { requireMitglied } from "@/lib/netzwerk";
import { setzeGesuchStatus } from "@/lib/netzwerk-actions";
import NetzwerkFormular from "../../NetzwerkFormular";

export const metadata = { title: "Gesuche & Angebote" };

export default async function GesuchePage({ searchParams }: { searchParams: Promise<{ typ?: string; meine?: string }> }) {
  const f = await searchParams;
  const { client, teilnehmerId } = await requireMitglied();
  let query = client
    .from("gesuche_angebote")
    .select("id, typ, titel, beschreibung, tags, status, erstellt_am, teilnehmer_id, teilnehmer(id, vorname, nachname, netzwerk_gastgeber, teilnehmer_organisationen(ist_hauptorganisation, organisationen(name)))")
    .order("erstellt_am", { ascending: false })
    .limit(200);
  if (f.meine === "1") query = query.eq("teilnehmer_id", teilnehmerId);
  else query = query.eq("status", "aktiv");
  if (f.typ === "gesuch" || f.typ === "angebot") query = query.eq("typ", f.typ);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const link = (typ?: string, meine?: boolean) => {
    const u = new URLSearchParams();
    if (typ) u.set("typ", typ);
    if (meine) u.set("meine", "1");
    const s = u.toString();
    return `/netzwerk/gesuche${s ? `?${s}` : ""}`;
  };

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Gesuche &amp; Angebote</h1>
        <Link href="/netzwerk/gesuche/neu" className="au-btn au-btn-primary au-btn-sm">+ Neuer Eintrag</Link>
      </div>
      <div className="ua-filter">
        <div className="ua-umschalter">
          <Link href={link(undefined, f.meine === "1")} className={!f.typ ? "aktiv" : ""}>Alle</Link>
          <Link href={link("gesuch", f.meine === "1")} className={f.typ === "gesuch" ? "aktiv" : ""}>Gesuche</Link>
          <Link href={link("angebot", f.meine === "1")} className={f.typ === "angebot" ? "aktiv" : ""}>Angebote</Link>
        </div>
        <Link href={link(f.typ, f.meine !== "1")} className="ua-klein">{f.meine === "1" ? "Alle Einträge zeigen" : "Nur meine (inkl. erledigte)"}</Link>
      </div>

      {(data || []).map((g: any) => {
        const orgs = g.teilnehmer?.teilnehmer_organisationen || [];
        const org = (orgs.find((z: any) => z.ist_hauptorganisation) || orgs[0])?.organisationen?.name;
        const meins = g.teilnehmer_id === teilnehmerId;
        return (
          <div key={g.id} className="ua-karte" style={g.status !== "aktiv" ? { opacity: 0.6 } : undefined}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>
                <span className={`au-badge ${g.typ === "gesuch" ? "ua-badge-gesuch" : "ua-badge-angebot"}`}>{g.typ === "gesuch" ? "Gesuch" : "Angebot"}</span>{" "}
                <strong>{g.titel}</strong>
              </span>
              <span className="ua-klein">{new Date(g.erstellt_am).toLocaleDateString("de-DE")}{g.status !== "aktiv" && ` · ${g.status}`}</span>
            </div>
            {g.beschreibung && <p style={{ whiteSpace: "pre-wrap", color: "var(--color-text)", margin: "0.5rem 0" }}>{g.beschreibung}</p>}
            {(g.tags || []).length > 0 && <div className="ua-tags">{g.tags.map((t: string) => <span key={t} className="ua-tag">{t}</span>)}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
              {g.teilnehmer ? (
                <Link href={`/netzwerk/person/${g.teilnehmer.id}`} className="ua-klein">
                  {g.teilnehmer.vorname} {g.teilnehmer.nachname}{g.teilnehmer.netzwerk_gastgeber ? " · Gastgeber" : org ? ` · ${org}` : ""}
                </Link>
              ) : <span />}
              {meins && (
                <NetzwerkFormular action={setzeGesuchStatus}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="status" value={g.status === "aktiv" ? "erledigt" : "aktiv"} />
                  <button type="submit" className="ua-link">{g.status === "aktiv" ? "als erledigt markieren" : "wieder aktivieren"}</button>
                </NetzwerkFormular>
              )}
            </div>
          </div>
        );
      })}
      {!data?.length && <div className="ua-karte ua-klein">Noch keine Einträge – mach den Anfang!</div>}
    </main>
  );
}
