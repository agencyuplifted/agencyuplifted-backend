export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { speichereErinnerung, sendeErinnerungTest, speichereKalenderAbo, erneuereKalenderToken } from "@/lib/actions";
import { BACKSTAGE_URL, frequenzText, type Erinnerung, type KalenderAbo } from "@/lib/erinnerungen";
import { formatTag } from "@/lib/events";
import AktionsFormular from "../../AktionsFormular";
import ErinnerungFormular from "./ErinnerungFormular";
import KopierFeld from "./KopierFeld";

export default async function WiedervorlageEinstellungenPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: erinnerungen, error }, { data: abos, error: aboFehler }] = await Promise.all([
    supabase.from("erinnerungen").select("*").order("erstellt_am"),
    supabase.from("kalender_abos").select("*").order("erstellt_am"),
  ]);
  if (error || aboFehler) throw new Error((error || aboFehler)!.message);

  return (
    <main>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}><Link href="/wiedervorlage">← Wiedervorlage</Link></p>
      <h1>Erinnerungen &amp; Kalender</h1>

      <h2>Erinnerungs-Mails</h2>
      <p style={{ marginTop: "-0.5rem" }}>
        Werden einmal täglich morgens (ca. 7 Uhr) geprüft und nur an die hier eingetragenen Adressen geschickt – nie an Kontakte oder Leads.
        Eine genaue Uhrzeit ist im aktuellen Vercel-Tarif (Hobby) nicht möglich.
      </p>
      {((erinnerungen || []) as Erinnerung[]).map((e) => (
        <details key={e.id} className="au-card" open={!e.aktiv && !e.empfaenger.length}>
          <summary style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <span>
              <strong>{e.name}</strong>{" "}
              <span className={`au-badge ${e.aktiv ? "au-badge-success" : "au-badge-neutral"}`}>{e.aktiv ? "aktiv" : "inaktiv"}</span>
            </span>
            <span className="au-klein">
              {frequenzText(e)} · {e.empfaenger.length ? e.empfaenger.join(", ") : "keine Empfänger"}
              {e.zuletzt_gesendet_am && <> · zuletzt {formatTag(e.zuletzt_gesendet_am)}</>}
            </span>
          </summary>
          {e.zuletzt_fehler && <div className="au-banner au-banner-error" style={{ margin: "0.75rem 0", padding: "0.5rem 0.75rem" }}>Letzter Fehler: {e.zuletzt_fehler}</div>}
          <div style={{ marginTop: "0.75rem" }}>
            <ErinnerungFormular e={e} speichernAction={speichereErinnerung} />
          </div>
          <AktionsFormular action={sendeErinnerungTest} bestaetigung={`Jetzt eine Testmail an ${e.empfaenger.join(", ") || "(keine Empfänger)"} senden?`} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="id" value={e.id} />
            <button type="submit" className="au-link">Testmail jetzt senden</button>
          </AktionsFormular>
        </details>
      ))}
      <details className="au-card">
        <summary style={{ fontWeight: 600 }}>+ Weitere Erinnerung anlegen</summary>
        <div style={{ marginTop: "0.75rem" }}>
          <ErinnerungFormular e={{}} speichernAction={speichereErinnerung} />
        </div>
      </details>

      <h2 style={{ marginTop: "2rem" }}>Kalender-Abo (Apple / Google Kalender)</h2>
      <p style={{ marginTop: "-0.5rem" }}>
        Aufgaben, Wiedervorlagen, Events und CfP-Fristen als Ganztagstermine in deinem Kalender – aktualisiert sich automatisch.
        Der Link ist geheim: Wer ihn hat, sieht die Termine. Bei Bedarf „Link neu erzeugen“.
      </p>
      {((abos || []) as KalenderAbo[]).map((a) => {
        const https = `${BACKSTAGE_URL}/api/kalender/${a.token}.ics`;
        const webcal = https.replace(/^https?:/, "webcal:");
        return (
          <div key={a.id} className="au-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem" }}>
              <strong>{a.name} <span className={`au-badge ${a.aktiv ? "au-badge-success" : "au-badge-neutral"}`}>{a.aktiv ? "aktiv" : "inaktiv"}</span></strong>
              <a href={webcal} className="au-btn au-btn-primary au-btn-sm">In Apple Kalender abonnieren</a>
            </div>
            <label className="au-label">Abo-Adresse (für Google Kalender „Per URL hinzufügen“)</label>
            <KopierFeld wert={https} />
            <AktionsFormular action={speichereKalenderAbo} className="au-formgrid" style={{ marginTop: "0.75rem" }}>
              <input type="hidden" name="id" value={a.id} />
              <div><label className="au-label">Name</label><input className="au-input" name="name" defaultValue={a.name} /></div>
              <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: "0 1.5rem", marginBottom: "0.5rem" }}>
                {([
                  ["mit_aufgaben", "Aufgaben", a.mit_aufgaben],
                  ["mit_wiedervorlagen", "Inbox-Wiedervorlagen", a.mit_wiedervorlagen],
                  ["mit_events", "Events", a.mit_events],
                  ["mit_cfp", "CfP-Fristen", a.mit_cfp],
                  ["aktiv", "Aktiv", a.aktiv],
                ] as const).map(([n, l, an]) => (
                  <label key={n} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem" }}>
                    <input type="checkbox" name={n} defaultChecked={an} /> {l}
                  </label>
                ))}
              </div>
              <div><button type="submit" className="au-btn au-btn-secondary au-btn-sm">Speichern</button></div>
            </AktionsFormular>
            <AktionsFormular action={erneuereKalenderToken} bestaetigung="Link neu erzeugen? Der alte Link funktioniert dann sofort nicht mehr – das Abo muss im Kalender neu eingerichtet werden." style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className="au-link-danger">Link neu erzeugen</button>
            </AktionsFormular>
          </div>
        );
      })}

      <details className="au-card">
        <summary style={{ fontWeight: 600 }}>So richtest du das Abo ein</summary>
        <div style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
          <p><strong>iPhone / iPad:</strong> Diese Seite am iPhone öffnen → „In Apple Kalender abonnieren“ tippen → „Abonnieren“ → als Account „iCloud“ wählen, dann erscheint der Kalender auch auf Mac und Watch.</p>
          <p><strong>Mac:</strong> Kalender-App → Ablage → Neues Kalenderabonnement → Abo-Adresse einfügen → Speicherort „iCloud“, Aktualisieren „Alle 15 Minuten“ oder „Stündlich“. Für Mitteilungen um 9 Uhr bei „Entfernen“ das Häkchen bei „Hinweise“ entfernen.</p>
          <p><strong>Google Kalender:</strong> Weitere Kalender → „+“ → „Per URL“ → Abo-Adresse einfügen. Google aktualisiert Abos nur alle paar Stunden.</p>
          <p><strong>Apple Erinnerungen:</strong> Die Erinnerungen-App kann keine Abos – deshalb der Kalender. Für echte Erinnerungen mit Haken gibt es die Erinnerungs-Mails oben.</p>
        </div>
      </details>
    </main>
  );
}
