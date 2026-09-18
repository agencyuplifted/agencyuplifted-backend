export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { speichereKontakt, setzeKontaktStatus, archiviereKontakt, uebernehmeKontaktAlsLead, speichereAufgabe } from "@/lib/actions";
import { KONTAKT_STATUS, KONTAKT_STATUS_LABEL, EVENT_ROLLEN, EVENT_ROLLE_LABEL, berlinHeute, type EventRolle } from "@/lib/events";
import AktionsFormular from "../AktionsFormular";
import KontaktStatusAuswahl from "./KontaktStatusAuswahl";
import AufgabeZeile from "../wiedervorlage/AufgabeZeile";

type Filter = { q?: string; status?: string; rolle?: string; archiv?: string };

export default async function KontaktePage({ searchParams }: { searchParams: Promise<Filter> }) {
  const f = await searchParams;
  const supabase = getSupabaseAdmin();
  const heute = berlinHeute();

  let query = supabase
    .from("kontakte")
    .select("*, organisationen(id, name), event_ausgabe_kontakte(rolle, event_ausgaben(id, jahr, event_reihen(id, name))), aufgaben(id, titel, faellig_am, erledigt_am, notizen, archiviert_am)")
    .order("aktualisiert_am", { ascending: false })
    .limit(300);
  query = f.archiv === "1" ? query.not("archiviert_am", "is", null) : query.is("archiviert_am", null);
  if (f.status && (KONTAKT_STATUS as readonly string[]).includes(f.status)) query = query.eq("status", f.status);
  const q = (f.q || "").replace(/[,()%_\\]/g, " ").trim();
  if (q) query = query.or(`name.ilike.%${q}%,firma.ilike.%${q}%,quelle.ilike.%${q}%,notizen.ilike.%${q}%`);

  const [{ data, error }, { data: organisationen }] = await Promise.all([
    query,
    supabase.from("organisationen").select("id, name").is("deaktiviert_am", null).order("name"),
  ]);
  if (error) throw new Error(error.message);

  let kontakte = (data || []) as any[];
  if (f.rolle && (EVENT_ROLLEN as readonly string[]).includes(f.rolle)) {
    kontakte = kontakte.filter((k) => (k.event_ausgabe_kontakte || []).some((z: any) => z.rolle === f.rolle));
  }

  return (
    <main>
      <h1>Kontakte</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Netzwerk- und Vertriebskontakte aus Events und Recherche. Hier wird nur dokumentiert und erinnert – es gehen keine Mails automatisch raus.
        Getrennt von <Link href="/leads">Leads</Link> (Seminar-Interessenten).
      </p>

      <form method="get" className="au-card au-inbox-filterform" style={{ padding: "1rem 1.25rem" }}>
        <input className="au-input" name="q" defaultValue={f.q || ""} placeholder="Suche: Name, Firma, Quelle, Notizen" />
        <select className="au-select" name="status" defaultValue={f.status || ""}>
          <option value="">Alle Status</option>
          {KONTAKT_STATUS.map((s) => <option key={s} value={s}>{KONTAKT_STATUS_LABEL[s]}</option>)}
        </select>
        <select className="au-select" name="rolle" defaultValue={f.rolle || ""}>
          <option value="">Alle Event-Rollen</option>
          {EVENT_ROLLEN.map((r) => <option key={r} value={r}>{EVENT_ROLLE_LABEL[r]}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", marginBottom: "0.9rem" }}>
          <input type="checkbox" name="archiv" value="1" defaultChecked={f.archiv === "1"} /> Archiv
        </label>
        <button type="submit" className="au-btn au-btn-primary" style={{ marginBottom: "0.9rem" }}>Filtern</button>
      </form>

      <p className="au-klein" style={{ margin: "0 0 0.75rem" }}>{kontakte.length} Kontakte</p>

      {kontakte.map((k) => {
        const rollen = (k.event_ausgabe_kontakte || []).filter((z: any) => z.event_ausgaben);
        const aufgaben = (k.aufgaben || []).filter((a: any) => !a.archiviert_am && !a.erledigt_am);
        return (
          <div key={k.id} className="au-inbox-karte">
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <strong>{k.name}</strong>
                {(k.firma || k.organisationen) && <span className="au-klein"> · {k.organisationen ? <Link href={`/organisationen/${k.organisationen.id}`}>{k.organisationen.name}</Link> : k.firma}</span>}
                {k.position && <span className="au-klein"> · {k.position}</span>}
                {k.lead_id && <span className="au-badge au-badge-success" style={{ marginLeft: "0.4rem" }}>Lead</span>}
              </div>
              <KontaktStatusAuswahl kontaktId={k.id} status={k.status} action={setzeKontaktStatus} />
            </div>
            <div className="au-klein" style={{ marginTop: "0.25rem" }}>
              Quelle: {k.quelle}
              {k.linkedin_url && <> · <a href={k.linkedin_url} target="_blank" rel="noreferrer">LinkedIn</a></>}
              {k.email && <> · {k.email}</>}
            </div>
            {rollen.length > 0 && (
              <div className="au-chips">
                {rollen.map((z: any) => (
                  <Link key={z.event_ausgaben.id + z.rolle} href={`/events/${z.event_ausgaben.event_reihen.id}#ausgabe-${z.event_ausgaben.id}`} className="au-chip">
                    {EVENT_ROLLE_LABEL[z.rolle as EventRolle]} · {z.event_ausgaben.event_reihen.name} {z.event_ausgaben.jahr}
                  </Link>
                ))}
              </div>
            )}
            {k.notizen && <p style={{ margin: "0.4rem 0 0", whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>{k.notizen}</p>}
            {aufgaben.map((a: any) => <AufgabeZeile key={a.id} aufgabe={a} heute={heute} />)}

            <details style={{ marginTop: "0.4rem" }}>
              <summary className="au-link">bearbeiten</summary>
              <AktionsFormular action={speichereKontakt} className="au-formgrid" style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="id" value={k.id} />
                <input type="hidden" name="status" value={k.status} />
                <div><label className="au-label">Name</label><input className="au-input" name="name" defaultValue={k.name} required /></div>
                <div><label className="au-label">Firma</label><input className="au-input" name="firma" defaultValue={k.firma || ""} /></div>
                <div><label className="au-label">Position</label><input className="au-input" name="position" defaultValue={k.position || ""} /></div>
                <div><label className="au-label">LinkedIn</label><input className="au-input" name="linkedin_url" type="url" defaultValue={k.linkedin_url || ""} /></div>
                <div><label className="au-label">E-Mail</label><input className="au-input" name="email" type="email" defaultValue={k.email || ""} /></div>
                <div>
                  <label className="au-label">Organisation im System</label>
                  <select className="au-select" name="organisation_id" defaultValue={k.organisation_id || ""}>
                    <option value="">– keine –</option>
                    {(organisationen || []).map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1 / -1" }}><label className="au-label">Quelle (Pflicht)</label><input className="au-input" name="quelle" defaultValue={k.quelle} required /></div>
                <div style={{ gridColumn: "1 / -1" }}><label className="au-label">Notizen</label><textarea className="au-textarea" name="notizen" rows={3} defaultValue={k.notizen || ""} /></div>
                <div><button type="submit" className="au-btn au-btn-primary au-btn-sm">Speichern</button></div>
              </AktionsFormular>
              <AktionsFormular action={speichereAufgabe} zuruecksetzen className="au-inline-form">
                <input type="hidden" name="kontakt_id" value={k.id} />
                <input className="au-input" name="titel" placeholder={`Wiedervorlage/Aufgabe zu ${k.name}`} required />
                <input className="au-input" name="faellig_am" type="date" aria-label="fällig am" />
                <button type="submit" className="au-btn au-btn-secondary au-btn-sm">+ Aufgabe</button>
              </AktionsFormular>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                {!k.lead_id && (
                  <AktionsFormular
                    action={uebernehmeKontaktAlsLead}
                    bestaetigung="Als Seminar-Lead übernehmen? Achtung: Leads mit E-Mail-Adresse bekommen automatische Funnel-Mails, sobald ein „Lead erstellt“-Funnel aktiv ist. Nur machen, wenn die Person das erwartet."
                  >
                    <input type="hidden" name="id" value={k.id} />
                    <button type="submit" className="au-link">als Lead übernehmen</button>
                  </AktionsFormular>
                )}
                <AktionsFormular action={archiviereKontakt} bestaetigung={k.archiviert_am ? "Kontakt wiederherstellen?" : "Kontakt archivieren?"}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="archivieren" value={String(!k.archiviert_am)} />
                  <button type="submit" className="au-link-danger">{k.archiviert_am ? "wiederherstellen" : "archivieren"}</button>
                </AktionsFormular>
              </div>
            </details>
          </div>
        );
      })}
      {!kontakte.length && <div className="au-card au-leer">Keine Kontakte gefunden.</div>}

      <details className="au-card" style={{ marginTop: "1.5rem" }}>
        <summary style={{ fontWeight: 600 }}>+ Kontakt ohne Event anlegen</summary>
        <AktionsFormular action={speichereKontakt} zuruecksetzen className="au-formgrid" style={{ marginTop: "0.75rem" }}>
          <div><label className="au-label">Name</label><input className="au-input" name="name" required /></div>
          <div><label className="au-label">Firma</label><input className="au-input" name="firma" /></div>
          <div><label className="au-label">Position</label><input className="au-input" name="position" /></div>
          <div>
            <label className="au-label">Status</label>
            <select className="au-select" name="status" defaultValue="recherchieren">
              {KONTAKT_STATUS.map((s) => <option key={s} value={s}>{KONTAKT_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}><label className="au-label">Quelle (Pflicht – woher stammt der Kontakt?)</label><input className="au-input" name="quelle" required placeholder="z. B. persönlich bekannt / LinkedIn-Kommentar zu … / Empfehlung von …" /></div>
          <div><label className="au-label">LinkedIn</label><input className="au-input" name="linkedin_url" type="url" /></div>
          <div><label className="au-label">E-Mail</label><input className="au-input" name="email" type="email" /></div>
          <div><button type="submit" className="au-btn au-btn-primary au-btn-sm">Anlegen</button></div>
        </AktionsFormular>
      </details>
    </main>
  );
}
