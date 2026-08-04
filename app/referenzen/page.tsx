export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { formatDatum } from "@/lib/format";
import { renderTextMitLinks } from "@/lib/richtext";
import { deleteTeilnehmerReferenz, toggleReferenzFreigabe } from "@/lib/actions";

export default async function ReferenzenPage() {
  const supabase = getSupabaseAdmin();

  const { data: referenzen } = await supabase
    .from("teilnehmer_referenzen")
    .select("*, teilnehmer(id, vorname, nachname)")
    .order("erstellt_am", { ascending: false });

  const referenzenMitUrls = (referenzen || []).map((r: any) => ({
    ...r,
    profilfotoUrl: r.profilfoto_pfad ? supabase.storage.from("referenzen").getPublicUrl(r.profilfoto_pfad).data.publicUrl : null,
    agenturLogoUrl: r.agentur_logo_pfad ? supabase.storage.from("referenzen").getPublicUrl(r.agentur_logo_pfad).data.publicUrl : null,
  }));

  const anzahlFreigegeben = referenzenMitUrls.filter((r) => r.freigegeben_fuer_onepage).length;

  return (
    <main>
      <h1>Referenzen &amp; Testimonials</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        {referenzenMitUrls.length} Referenz{referenzenMitUrls.length === 1 ? "" : "en"} gesamt · {anzahlFreigegeben} für Onepage freigegeben
      </p>
      <p style={{ fontSize: "0.85rem", color: "var(--color-text-faint)" }}>
        Neue Referenzen werden auf der jeweiligen Teilnehmerseite erfasst. Diese Übersicht dient zum Sichten und Freigeben.
      </p>

      {referenzenMitUrls.map((r: any) => (
        <div key={r.id} className="au-card">
          <div style={{ display: "flex", gap: "0.9rem", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              {r.profilfotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.profilfotoUrl} alt="Profilfoto" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "50%" }} />
              )}
              {r.agenturLogoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.agenturLogoUrl} alt="Agentur-Logo" style={{ width: 64, height: 64, objectFit: "contain", borderRadius: "6px", background: "#fff", border: "1px solid var(--color-border)" }} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                <Link href={`/teilnehmer/${r.teilnehmer?.id}`}>{r.teilnehmer?.vorname} {r.teilnehmer?.nachname}</Link>
              </p>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.9rem" }}>{renderTextMitLinks(r.text)}</p>
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "var(--color-text-faint)" }}>
                {formatDatum(r.erstellt_am)}
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flexShrink: 0 }}>
              <form action={toggleReferenzFreigabe}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="teilnehmer_id" value={r.teilnehmer?.id} />
                <input type="hidden" name="redirect_to" value="/referenzen" />
                <input type="hidden" name="neuer_wert" value={(!r.freigegeben_fuer_onepage).toString()} />
                <button type="submit" className={`au-btn au-btn-sm ${r.freigegeben_fuer_onepage ? "au-btn-secondary" : "au-btn-primary"}`}>
                  {r.freigegeben_fuer_onepage ? "Freigegeben ✓" : "Für Onepage freigeben"}
                </button>
              </form>
              <form action={deleteTeilnehmerReferenz}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="teilnehmer_id" value={r.teilnehmer?.id} />
                <input type="hidden" name="redirect_to" value="/referenzen" />
                <button type="submit" className="au-btn au-btn-danger au-btn-sm">Löschen</button>
              </form>
            </div>
          </div>
        </div>
      ))}
      {!referenzenMitUrls.length && (
        <div className="au-card">
          <p style={{ color: "var(--color-text-faint)" }}>Noch keine Referenzen erfasst. Neue Referenzen werden auf der jeweiligen Teilnehmerseite hinzugefügt.</p>
        </div>
      )}
    </main>
  );
}
