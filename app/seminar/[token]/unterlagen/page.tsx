import { getSupabaseAdmin } from "@/lib/supabase";
import { ladeSeminarKontext } from "@/lib/seminar-seite";
import SeminarKopf from "../SeminarKopf";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unterlagen" };

export default async function UnterlagenSeite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { termin } = await ladeSeminarKontext(token);
  const supabase = getSupabaseAdmin();
  const { data: unterlagen } = await supabase.from("seminar_unterlagen").select("*").eq("seminartermin_id", termin.id).order("position").order("erstellt_am");

  // Private Dateien nur ueber kurzlebige signierte Links (1 Stunde)
  const eintraege = await Promise.all(
    (unterlagen || []).map(async (u: any) => {
      if (!String(u.datei_url).startsWith("storage:")) return { ...u, href: u.datei_url, extern: true };
      const { data } = await supabase.storage.from("seminar-unterlagen").createSignedUrl(String(u.datei_url).slice(8), 3600, { download: true });
      return { ...u, href: data?.signedUrl || null, extern: false };
    })
  );

  return (
    <main>
      <SeminarKopf termin={termin} token={token} aktiv="unterlagen" />
      <div className="ua-karte">
        <h2 style={{ marginTop: 0 }}>Deine Unterlagen</h2>
        {!eintraege.length && <p className="ua-klein">Die Unterlagen werden gerade vorbereitet und erscheinen hier, sobald sie bereitstehen.</p>}
        <ul className="au-kompaktliste">
          {eintraege.map((u) => (
            <li key={u.id}>
              <span>{u.titel}</span>
              {u.href ? (
                <a className="au-btn au-btn-secondary au-btn-sm" href={u.href} target={u.extern ? "_blank" : undefined} rel="noreferrer">
                  {u.extern ? "Öffnen ↗" : "Herunterladen"}
                </a>
              ) : (
                <span className="ua-klein">nicht verfügbar</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
