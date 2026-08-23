export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { erstelleRedirect, importiereRedirectsBulk, toggleRedirectAktiv, loescheRedirect } from "@/lib/actions";

type RedirectZeile = {
  id: string;
  alte_url: string;
  neue_url: string;
  status_code: number;
  aktiv: boolean;
  erstellt_am: string;
};

export default async function RedirectsPage({
  searchParams,
}: {
  searchParams: Promise<{ importiert?: string; fehler?: string }>;
}) {
  const { importiert, fehler } = await searchParams;

  const supabase = getSupabaseAdmin();
  const { data: redirectsRaw } = await supabase
    .from("insights_redirects")
    .select("*")
    .order("erstellt_am", { ascending: false });
  const redirects = (redirectsRaw || []) as RedirectZeile[];

  return (
    <main>
      <h1>301-Weiterleitungen</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Leitet alte URLs (z. B. von agencyuplifted.de) auf neue Ziel-URLs (z. B. /wissen/mein-artikel) weiter.
        Greift nur auf öffentlichen Domains (PUBLIC_HOST), nicht innerhalb von Backstage. Alte URL bitte als
        reiner Pfad angeben (ohne https://domain), z. B. <code>/blog/mein-alter-artikel</code>.
      </p>

      {importiert !== undefined && (
        <div
          className="au-card"
          style={{ background: "var(--color-accent-soft)", marginBottom: "1rem", padding: "0.75rem 1rem" }}
        >
          {importiert} Weiterleitung(en) importiert/aktualisiert.
          {fehler ? ` ${fehler} Zeile(n) konnten nicht erkannt werden (kein Trennzeichen gefunden).` : ""}
        </div>
      )}

      <div className="au-card">
        <h2>Bestehende Weiterleitungen · {redirects.length}</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Alte URL</th>
              <th>Ziel-URL</th>
              <th>Status</th>
              <th>Aktiv</th>
              <th>Angelegt</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {redirects.map((r) => (
              <tr key={r.id}>
                <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{r.alte_url}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{r.neue_url}</td>
                <td>{r.status_code}</td>
                <td>
                  <form action={toggleRedirectAktiv}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="aktiv" value={String(r.aktiv)} />
                    <button
                      type="submit"
                      className={`au-badge ${r.aktiv ? "au-badge-success" : "au-badge-neutral"}`}
                      style={{ border: "none", cursor: "pointer" }}
                    >
                      {r.aktiv ? "aktiv" : "inaktiv"}
                    </button>
                  </form>
                </td>
                <td style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                  {new Date(r.erstellt_am).toLocaleDateString("de-DE")}
                </td>
                <td>
                  <form action={loescheRedirect}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="au-btn au-btn-danger au-btn-sm">
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!redirects.length && (
              <tr className="au-table-empty">
                <td colSpan={6}>Noch keine Weiterleitungen angelegt.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="au-card" style={{ maxWidth: 560 }}>
        <h2>Neue Weiterleitung</h2>
        <form action={erstelleRedirect}>
          <label className="au-label">Alte URL (Pfad, z. B. /blog/mein-artikel)</label>
          <input className="au-input" name="alte_url" required placeholder="/blog/mein-artikel" />

          <label className="au-label" style={{ marginTop: "0.75rem" }}>
            Ziel-URL (Pfad oder volle URL)
          </label>
          <input className="au-input" name="neue_url" required placeholder="/wissen/mein-artikel" />

          <label className="au-label" style={{ marginTop: "0.75rem" }}>
            Status-Code
          </label>
          <select className="au-input" name="status_code" defaultValue="301">
            <option value="301">301 (dauerhaft)</option>
            <option value="302">302 (temporär)</option>
          </select>

          <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "0.75rem" }}>
            Anlegen
          </button>
        </form>
      </div>

      <div className="au-card" style={{ maxWidth: 720 }}>
        <h2>Bulk-Import</h2>
        <p style={{ color: "var(--color-text-muted)", marginTop: "-0.5rem" }}>
          Eine Weiterleitung pro Zeile. Alte und neue URL getrennt durch Tab, "-&gt;" oder mehrere Leerzeichen.
          Bereits vorhandene alte URLs werden aktualisiert (überschrieben). Status-Code ist immer 301.
        </p>
        <form action={importiereRedirectsBulk}>
          <textarea
            className="au-input"
            name="bulk_text"
            rows={10}
            style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            placeholder={"/blog/alter-artikel -> /wissen/neuer-artikel\n/leistungen/preisfindung\t/wissen/wertorientierte-preisfindung"}
            required
          />
          <button type="submit" className="au-btn au-btn-primary" style={{ marginTop: "0.75rem" }}>
            Importieren
          </button>
        </form>
      </div>
    </main>
  );
}
