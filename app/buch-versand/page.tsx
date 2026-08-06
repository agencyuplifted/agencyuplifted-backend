export const dynamic = "force-dynamic";

import { getSupabaseAdmin } from "@/lib/supabase";
import { legeBuchVersandAn, versendeBuchExemplarAction } from "@/lib/actions";
import AdressParseFeld from "./AdressParseFeld";

const GRUND_LABEL: Record<string, string> = {
  rezension: "Rezensionsexemplar",
  gratis: "Gratisexemplar",
};

const STATUS_BADGE: Record<string, string> = {
  entwurf: "au-badge-neutral",
  versendet: "au-badge-success",
  fehler: "au-badge-danger",
};

function formatDatum(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default async function BuchVersandPage() {
  const supabase = getSupabaseAdmin();
  const { data: eintraege } = await supabase
    .from("buch_versand")
    .select("*")
    .order("erstellt_am", { ascending: false });

  const { data: shopifyVerbindung } = await supabase
    .from("shopify_verbindung")
    .select("shop_domain, verbunden_am")
    .order("verbunden_am", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main>
      <h1>Buch-Versand</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Rezensions- und Gratisexemplare: Adresse einfügen, prüfen, anlegen. Die automatische Shopify-Bestellung
        wird aktiv, sobald Shopify verbunden ist – bis dahin landen Einträge als "Entwurf" hier zur Kontrolle.
      </p>

      <div className="au-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        {shopifyVerbindung ? (
          <div>
            <span className="au-badge au-badge-success">Shopify verbunden</span>{" "}
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>{shopifyVerbindung.shop_domain}</span>
          </div>
        ) : (
          <div>
            <span className="au-badge au-badge-neutral">Shopify nicht verbunden</span>{" "}
            <span style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>Automatischer Versand ist erst danach aktiv.</span>
          </div>
        )}
        <a href="/api/shopify/install" className="au-btn au-btn-secondary au-btn-sm">
          {shopifyVerbindung ? "Neu verbinden" : "Mit Shopify verbinden"}
        </a>
      </div>

      <div className="au-card">
        <h2>Neues Exemplar</h2>
        <form action={legeBuchVersandAn} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: 620 }}>
          <AdressParseFeld />
          <label>
            Grund
            <select name="grund" defaultValue="rezension">
              <option value="rezension">Rezensionsexemplar</option>
              <option value="gratis">Gratisexemplar</option>
            </select>
          </label>
          <button type="submit" className="au-btn au-btn-primary" style={{ alignSelf: "flex-start" }}>
            Anlegen
          </button>
        </form>
      </div>

      <div className="au-card">
        <h2>Bisherige Einträge · {eintraege?.length || 0}</h2>
        <table className="au-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Adresse</th>
              <th>Grund</th>
              <th>Status</th>
              <th>Angelegt</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {eintraege?.map((e: any) => (
              <tr key={e.id}>
                <td style={{ fontWeight: 600 }}>{e.name}</td>
                <td style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {e.strasse}, {e.plz} {e.ort}, {e.land}
                  {e.email && <div>{e.email}</div>}
                </td>
                <td>{GRUND_LABEL[e.grund] || e.grund}</td>
                <td>
                  <span className={`au-badge ${STATUS_BADGE[e.status] || "au-badge-neutral"}`}>{e.status}</span>
                  {e.status === "versendet" && e.shopify_order_id && (
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                      Shopify: {e.shopify_order_id}
                    </div>
                  )}
                  {e.status === "fehler" && e.fehlermeldung && (
                    <div style={{ fontSize: "0.75rem", color: "var(--color-danger, #b42318)", marginTop: "0.2rem" }}>
                      {e.fehlermeldung}
                    </div>
                  )}
                </td>
                <td>{formatDatum(e.erstellt_am)}</td>
                <td>
                  {e.status !== "versendet" && (
                    <form action={versendeBuchExemplarAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" className="au-btn au-btn-secondary au-btn-sm">
                        Als Shopify-Bestellung anlegen
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {!eintraege?.length && (
              <tr className="au-table-empty"><td colSpan={6}>Noch keine Einträge.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
