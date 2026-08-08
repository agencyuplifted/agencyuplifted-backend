export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { richteResendTrackingEin } from "@/lib/actions";
import { formatDatumZeit } from "@/lib/format";

// Zeigt den Status der einmaligen Resend-Tracking-Einrichtung und die
// Anleitung fuer Markus (DNS-Eintrag bei seinem DNS-Provider, Webhook-Secret
// in Vercel). Die eigentliche Einrichtung passiert in
// lib/actions.ts::richteResendTrackingEin() und wird in resend_setup_status
// gespeichert - bewusst nicht per URL-Query angezeigt, damit das Secret nicht
// in der Browser-Historie landet.

type DnsRecord = {
  record: string;
  name: string;
  value: string;
  type: string;
  ttl: string;
  status: string;
};

export default async function TrackingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ erfolg?: string; fehler?: string }>;
}) {
  const { erfolg, fehler } = await searchParams;
  const supabase = getSupabaseAdmin();

  const { data: status } = await supabase
    .from("resend_setup_status")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  const trackingRecords: DnsRecord[] = (status?.dns_records || []).filter(
    (r: DnsRecord) => r.record === "Tracking" || r.record === "TrackingCAA"
  );

  return (
    <main>
      <h1>Resend-Tracking einrichten</h1>
      <p>
        Einmalige Einrichtung, damit Zustellung, Öffnung und Klick von Funnel-Mails erfasst werden. Danach
        erledigt sich der Rest automatisch — jede neue E-Mail wird ab dann getrackt.
      </p>

      {erfolg && (
        <div className="au-banner au-banner-success">
          Einrichtung erfolgreich. Bitte jetzt die beiden Schritte unten (DNS + Vercel) einmalig ausführen.
        </div>
      )}
      {fehler && <div className="au-banner au-banner-error">Fehler bei der Einrichtung: {fehler}</div>}

      <div className="au-card">
        <form action={richteResendTrackingEin}>
          <button type="submit" className="au-btn au-btn-primary">
            {status ? "Erneut prüfen / aktualisieren" : "Jetzt einrichten"}
          </button>
        </form>
        {status?.eingerichtet_am && (
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginBottom: 0 }}>
            Zuletzt eingerichtet: {formatDatumZeit(status.eingerichtet_am)} · Domain: {status.domain_name}
          </p>
        )}
      </div>

      {status && (
        <>
          <div className="au-card">
            <h2 style={{ marginTop: 0 }}>Schritt 1 — DNS-Eintrag bei deinem DNS-Provider</h2>
            <p style={{ fontSize: "0.9rem" }}>
              Damit <strong>links.agencyuplifted.de</strong> funktioniert, bitte folgenden Eintrag anlegen
              (dort, wo auch die anderen agencyuplifted.de-Einträge liegen):
            </p>
            {trackingRecords.length === 0 && (
              <p style={{ color: "var(--color-text-muted)" }}>
                Keine Tracking-Einträge gefunden — bitte oben erneut auf „Erneut prüfen“ klicken.
              </p>
            )}
            {trackingRecords.map((r, i) => (
              <table className="au-table" key={i} style={{ marginBottom: "1rem" }}>
                <tbody>
                  <tr>
                    <th style={{ width: "140px" }}>Typ</th>
                    <td>{r.type}</td>
                  </tr>
                  <tr>
                    <th>Name (Host)</th>
                    <td style={{ fontFamily: "monospace" }}>{r.name}</td>
                  </tr>
                  <tr>
                    <th>Wert</th>
                    <td style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{r.value}</td>
                  </tr>
                  <tr>
                    <th>TTL</th>
                    <td>{r.ttl}</td>
                  </tr>
                  <tr>
                    <th>Status</th>
                    <td>
                      <span
                        className={`au-badge ${r.status === "verified" ? "au-badge-success" : "au-badge-warning"}`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            ))}
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              Nach dem Eintragen kann die Verifizierung (Status „verified“) je nach Provider einige Minuten
              bis wenige Stunden dauern. Einfach oben erneut auf „Erneut prüfen“ klicken, um den Status
              upzudaten.
            </p>
          </div>

          <div className="au-card">
            <h2 style={{ marginTop: 0 }}>Schritt 2 — Webhook-Secret in Vercel hinterlegen</h2>
            <p style={{ fontSize: "0.9rem" }}>
              Der Webhook ist bereits bei Resend registriert (Endpunkt:{" "}
              <span style={{ fontFamily: "monospace" }}>{status.webhook_endpoint}</span>). Damit die
              Verwaltung eingehende Zustellungs-/Öffnungs-/Klick-Events als echt erkennt, bitte dieses Secret
              einmalig in Vercel hinterlegen:
            </p>
            <ol style={{ fontSize: "0.9rem", paddingLeft: "1.2rem" }}>
              <li>Vercel-Projekt öffnen → Settings → Environment Variables</li>
              <li>
                Neue Variable anlegen: Name <span style={{ fontFamily: "monospace" }}>RESEND_WEBHOOK_SECRET</span>,
                Wert siehe unten
              </li>
              <li>Für „Production“ (und ggf. „Preview“) aktivieren, speichern</li>
              <li>Einmal neu deployen (z. B. mit einem leeren Commit oder über „Redeploy“ in Vercel), damit die Variable greift</li>
            </ol>
            <div className="au-card" style={{ background: "var(--color-accent-soft)" }}>
              <code style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                {status.webhook_signing_secret}
              </code>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              Dieses Secret nur einmal in Vercel eintragen — es steht dauerhaft hier auf dieser (login-geschützten)
              Seite, falls es erneut gebraucht wird.
            </p>
          </div>
        </>
      )}

      <div className="au-card">
        <Link href="/email-test" className="au-btn au-btn-secondary">← Zurück</Link>
      </div>
    </main>
  );
}
