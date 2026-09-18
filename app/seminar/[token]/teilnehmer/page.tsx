import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ladeSeminarKontext } from "@/lib/seminar-seite";
import SeminarKopf from "../SeminarKopf";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wer war dabei" };

function initialen(v: string, n: string) {
  return `${(v || "").charAt(0)}${(n || "").charAt(0)}`.toUpperCase();
}

// Teilnehmerliste nach dem Seminar: Namen nur ohne Opt-out, Foto und LinkedIn
// nur mit teilnehmerliste_freigabe (eigene Einwilligung, getrennt von
// Referenz-Freigaben).
export default async function TeilnehmerSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { termin, teilnehmer: ich } = await ladeSeminarKontext(token);
  const supabase = getSupabaseAdmin();
  const felder = "id, vorname, nachname, position, firma_freitext, linkedin_url, rolle, teilnehmerliste_freigabe, teilnehmerliste_opt_out, teilnehmer_organisationen(ist_hauptorganisation, organisationen(name)), teilnehmer_referenzen(profilfoto_pfad, erstellt_am)";
  const [{ data: positionen }, { data: alt }] = await Promise.all([
    supabase.from("buchungspositionen").select(`teilnehmer(${felder}), buchungen!inner(status)`).eq("seminartermin_id", termin.id).neq("buchungen.status", "storniert"),
    supabase.from("legacy_buchungen").select(`teilnehmer(${felder})`).eq("seminartermin_id", termin.id),
  ]);
  const personen = new Map<string, any>();
  [...(positionen || []), ...(alt || [])].forEach((z: any) => {
    if (z.teilnehmer && !z.teilnehmer.teilnehmerliste_opt_out) personen.set(z.teilnehmer.id, z.teilnehmer);
  });
  const liste = [...personen.values()].sort((a, b) => `${a.nachname}`.localeCompare(`${b.nachname}`, "de"));

  return (
    <main>
      <SeminarKopf termin={termin} token={token} aktiv="teilnehmer" />
      {!ich.teilnehmerliste_freigabe && !ich.teilnehmerliste_opt_out && (
        <div className="ua-karte" style={{ borderColor: "#c9a227" }}>
          <strong>Sollen dich die anderen leichter finden?</strong>
          <p className="ua-klein" style={{ margin: "0.3rem 0 0.6rem" }}>Mit deiner Freigabe erscheinst du hier mit Foto und LinkedIn-Profil.</p>
          <Link href={`/seminar/${token}/freigabe`} className="au-btn au-btn-primary au-btn-sm">Freigabe erteilen</Link>
        </div>
      )}
      <div className="ua-raster">
        {liste.map((p) => {
          const org = ((p.teilnehmer_organisationen || []).find((z: any) => z.ist_hauptorganisation) || (p.teilnehmer_organisationen || [])[0])?.organisationen?.name || p.firma_freitext;
          const foto = p.teilnehmerliste_freigabe
            ? [...(p.teilnehmer_referenzen || [])].filter((r: any) => r.profilfoto_pfad).sort((a: any, b: any) => String(b.erstellt_am).localeCompare(String(a.erstellt_am)))[0]
            : null;
          const fotoUrl = foto ? supabase.storage.from("referenzen").getPublicUrl(foto.profilfoto_pfad).data.publicUrl : null;
          return (
            <div key={p.id} className="ua-karte ua-person" style={p.id === ich.id ? { borderColor: "var(--color-accent)" } : undefined}>
              <div className="ua-zeile">
                {fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoUrl} alt="" className="ua-avatar" style={{ objectFit: "cover" }} />
                ) : (
                  <span className="ua-avatar">{initialen(p.vorname, p.nachname)}</span>
                )}
                <div style={{ minWidth: 0 }}>
                  <strong>{p.vorname} {p.nachname}</strong>{p.id === ich.id && <span className="ua-klein"> (du)</span>}
                  <div className="ua-klein">{[p.position, org].filter(Boolean).join(" · ")}</div>
                  {p.teilnehmerliste_freigabe && p.linkedin_url && (
                    <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="ua-klein">LinkedIn-Profil ↗</a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!liste.length && <div className="ua-karte ua-klein">Noch keine Teilnehmer.</div>}
    </main>
  );
}
