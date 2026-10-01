export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { legeFastbillKategorieAn, aendereFastbillKategorie, loescheFastbillKategorie } from "@/lib/actions";
import AktionsFormular from "../../../AktionsFormular";

// Verwaltung der FastBill-Kategorien -- gleiches Prinzip wie die
// Buch-Kontakt-Kategorien (/buch-versand/kategorien), zusaetzlich mit
// Umbenennen (zieht zugeordnete Rechnungen mit) und Reihenfolge.
export default async function FastbillKategorienPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: kategorien }, { data: rechnungen }] = await Promise.all([
    supabase.from("fastbill_kategorien").select("*").order("reihenfolge").order("name"),
    supabase.from("fastbill_rechnungen").select("kategorie"),
  ]);
  const anzahl = new Map<string, number>();
  (rechnungen || []).forEach((r: any) => anzahl.set(r.kategorie, (anzahl.get(r.kategorie) || 0) + 1));

  return (
    <main>
      <p><Link href="/buchungen/fastbill">← FastBill-Abgleich</Link> · <Link href="/buchungen/fastbill/kategorisieren">Kategorisieren →</Link></p>
      <h1>FastBill-Kategorien</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Stehen in der Kategorisierungsmaske als Auswahl zur Verfügung. Umbenennen übernimmt den neuen Namen auch bei allen
        schon zugeordneten Rechnungen. Löschen geht nur, wenn keine Rechnung die Kategorie mehr nutzt.
      </p>

      <div className="au-card">
        <h2>Kategorien · {kategorien?.length || 0}</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name & Reihenfolge</th>
              <th style={{ textAlign: "right" }}>Rechnungen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(kategorien || []).map((k: any) => (
              <tr key={k.id}>
                <td>
                  <AktionsFormular action={aendereFastbillKategorie} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                    <input type="hidden" name="id" value={k.id} />
                    <input className="au-input" style={{ marginBottom: 0, width: 72 }} name="reihenfolge" type="number" defaultValue={k.reihenfolge} aria-label="Reihenfolge" />
                    <input className="au-input" style={{ marginBottom: 0, minWidth: 200, flex: 1 }} name="name" defaultValue={k.name} required aria-label="Name" />
                    <button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button>
                    {k.schluessel && <span className="au-badge au-badge-neutral" title="Wird von der FastBill-Zuordnung automatisch gesetzt">automatisch</span>}
                  </AktionsFormular>
                </td>
                <td style={{ textAlign: "right" }}>{anzahl.get(k.name) || 0}</td>
                <td style={{ textAlign: "right" }}>
                  {!k.schluessel && (
                    <AktionsFormular action={loescheFastbillKategorie} bestaetigung={`Kategorie „${k.name}“ löschen?`}>
                      <input type="hidden" name="id" value={k.id} />
                      <button type="submit" className="au-link-danger">löschen</button>
                    </AktionsFormular>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ color: "var(--color-text-muted)" }}>unklar <span className="au-klein">(noch nicht kategorisiert)</span></td>
              <td style={{ textAlign: "right" }}>{anzahl.get("unklar") || 0}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="au-card" style={{ maxWidth: 480 }}>
        <h2>Neue Kategorie</h2>
        <AktionsFormular action={legeFastbillKategorieAn} zuruecksetzen>
          <label className="au-label">Name (z. B. Workshop, Vortrag, Lizenz)</label>
          <input className="au-input" name="name" required />
          <button type="submit" className="au-btn au-btn-primary">Anlegen</button>
        </AktionsFormular>
      </div>
    </main>
  );
}
