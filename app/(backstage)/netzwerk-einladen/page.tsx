export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getNetzwerkGruppen } from "@/lib/netzwerk";
import {
  ladeInPilotkreisEin,
  setzeAufNetzwerkVormerkliste,
  sendeNetzwerkEinladungErneut,
  entferneVonNetzwerkVormerkliste,
  setzeNetzwerkZugang,
  setzeAgenturRolle,
  ordneNetzwerkAnmeldungZu,
  erledigeNetzwerkPruefung,
} from "@/lib/actions";
import AktionsFormular from "../AktionsFormular";
import EinladenListe, { type EinladenZeile } from "./EinladenListe";

type Filter = { q?: string; einwilligung?: string; netzwerk?: string; unternehmer?: string };

const GRUND_LABEL: Record<string, string> = {
  kein_treffer: "Keine Teilnehmer-E-Mail passt",
  mehrere_treffer: "Mehrere Teilnehmer mit dieser E-Mail",
  nicht_ich: "Person sagt: „Das bin ich nicht“",
  nicht_eingeladen: "Nicht (mehr) im Pilotkreis",
  bereits_verknuepft: "Profil ist schon mit einem anderen Login verknüpft",
};

export default async function NetzwerkEinladenPage({ searchParams }: { searchParams: Promise<Filter> }) {
  const f = await searchParams;
  const supabase = getSupabaseAdmin();
  const { pilot, vormerkliste } = await getNetzwerkGruppen();

  // Harte Regel: abgemeldet/keine_zustimmung erscheinen hier NIE -- auch nicht
  // per Filter. "unbekannt" nur, wenn ausdruecklich gefiltert.
  const einwilligung = f.einwilligung === "mit_unbekannt" ? ["abonniert", "unbekannt"] : f.einwilligung === "unbekannt" ? ["unbekannt"] : ["abonniert"];
  let query = supabase
    .from("teilnehmer")
    .select(
      "id, vorname, nachname, email, marketing_consent_status, unternehmer_status, auth_user_id, teilnehmer_organisationen(id, agentur_rolle, organisationen(name)), teilnehmer_community_status(status, community_gruppe_id), legacy_buchungen(jahr), buchungspositionen(startdatum)"
    )
    .in("marketing_consent_status", einwilligung)
    .is("deaktiviert_am", null)
    .order("nachname");
  if (f.unternehmer === "unternehmer" || f.unternehmer === "mitarbeiter") query = query.eq("unternehmer_status", f.unternehmer);
  const [{ data, error }, { data: pruefliste }] = await Promise.all([
    query,
    supabase.from("netzwerk_anmeldungen_pruefen").select("*").is("erledigt_am", null).order("erstellt_am"),
  ]);
  if (error) throw new Error(error.message);

  let zeilen: EinladenZeile[] = (data || []).map((t: any) => {
    const status = (t.teilnehmer_community_status || []) as { status: string; community_gruppe_id: string }[];
    const jahre = [
      ...(t.legacy_buchungen || []).map((l: any) => Number(l.jahr)).filter(Boolean),
      ...(t.buchungspositionen || []).map((b: any) => Number(String(b.startdatum || "").slice(0, 4))).filter(Boolean),
    ];
    return {
      id: t.id,
      name: `${t.vorname} ${t.nachname}`,
      email: t.email,
      consent: t.marketing_consent_status,
      unternehmer: t.unternehmer_status,
      agenturen: (t.teilnehmer_organisationen || []).filter((z: any) => z.organisationen).map((z: any) => ({ verknuepfungId: z.id, name: z.organisationen.name, rolle: z.agentur_rolle })),
      pilotStatus: status.find((s) => s.community_gruppe_id === pilot)?.status || null,
      vorgemerkt: status.some((s) => s.community_gruppe_id === vormerkliste),
      seminare: (t.legacy_buchungen || []).length + (t.buchungspositionen || []).length,
      letztesJahr: jahre.length ? Math.max(...jahre) : null,
      verknuepft: !!t.auth_user_id,
    };
  });

  const q = (f.q || "").trim().toLowerCase();
  if (q) zeilen = zeilen.filter((z) => [z.name, z.email, ...z.agenturen.map((a) => a.name)].join(" ").toLowerCase().includes(q));
  if (f.netzwerk === "ohne") zeilen = zeilen.filter((z) => !z.pilotStatus && !z.vorgemerkt);
  if (f.netzwerk === "pilot") zeilen = zeilen.filter((z) => z.pilotStatus);
  if (f.netzwerk === "vormerkliste") zeilen = zeilen.filter((z) => z.vorgemerkt);
  // Pilotkreis oben, dann Vormerkliste, dann nach Seminar-Aktualitaet
  zeilen.sort((a, b) => Number(!!b.pilotStatus) - Number(!!a.pilotStatus) || Number(b.vorgemerkt) - Number(a.vorgemerkt) || (b.letztesJahr || 0) - (a.letztesJahr || 0) || a.name.localeCompare(b.name));

  const pilotAnzahl = zeilen.filter((z) => z.pilotStatus).length;
  const alleFuerZuordnung = (data || []).map((t: any) => ({ id: t.id, name: `${t.vorname} ${t.nachname}`, email: t.email }));

  return (
    <main>
      <h1>Uplifted Agencies – Einladen</h1>
      <p style={{ marginTop: "-0.75rem" }}>
        Pilotkreis = bekommt per Klick eine persönliche Einladung mit Zugang. Vormerkliste = reine Notiz für die spätere offizielle Einladung, verschickt nichts.
        Personen mit Einwilligung „abgemeldet“ oder „keine Zustimmung“ erscheinen hier grundsätzlich nicht.
        {" "}<Link href="/netzwerk" target="_blank">Netzwerk öffnen ↗</Link>
      </p>

      {(pruefliste || []).length > 0 && (
        <div className="au-card au-banner-warning">
          <h3 style={{ marginTop: 0 }}>Anmeldungen zum Prüfen ({pruefliste!.length})</h3>
          {pruefliste!.map((p: any) => {
            const kandidaten = alleFuerZuordnung.filter((t) => p.kandidaten.includes(t.id));
            return (
              <div key={p.id} className="au-event-zeile" style={{ flexWrap: "wrap" }}>
                <span>
                  <strong>{p.email}</strong> · {GRUND_LABEL[p.grund] || p.grund}
                  <span className="au-klein"> · {new Date(p.erstellt_am).toLocaleString("de-DE")}</span>
                </span>
                <span style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                  <AktionsFormular action={ordneNetzwerkAnmeldungZu} className="au-inline-form" style={{ marginTop: 0 }} bestaetigung={`Login ${p.email} dem gewählten Teilnehmer zuordnen und freischalten?`}>
                    <input type="hidden" name="pruef_id" value={p.id} />
                    <select name="teilnehmer_id" className="au-select" required defaultValue="">
                      <option value="" disabled>Teilnehmer wählen …</option>
                      {kandidaten.length > 0 && <optgroup label="Kandidaten">{kandidaten.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.email})</option>)}</optgroup>}
                      <optgroup label="Alle (mit Einwilligung)">{alleFuerZuordnung.map((t) => <option key={t.id} value={t.id}>{t.name}{t.email ? ` (${t.email})` : ""}</option>)}</optgroup>
                    </select>
                    <button type="submit" className="au-btn au-btn-primary au-btn-sm">Zuordnen</button>
                  </AktionsFormular>
                  <AktionsFormular action={erledigeNetzwerkPruefung}>
                    <input type="hidden" name="pruef_id" value={p.id} />
                    <button type="submit" className="au-link">ohne Zuordnung erledigt</button>
                  </AktionsFormular>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <form method="get" className="au-card au-inbox-filterform" style={{ padding: "1rem 1.25rem" }}>
        <input className="au-input" name="q" defaultValue={f.q || ""} placeholder="Name, E-Mail, Agentur" />
        <select className="au-select" name="einwilligung" defaultValue={f.einwilligung || ""}>
          <option value="">Einwilligung: abonniert</option>
          <option value="mit_unbekannt">abonniert + unbekannt</option>
          <option value="unbekannt">nur unbekannt</option>
        </select>
        <select className="au-select" name="netzwerk" defaultValue={f.netzwerk || ""}>
          <option value="">Netzwerk: alle</option>
          <option value="ohne">noch nirgends</option>
          <option value="pilot">im Pilotkreis</option>
          <option value="vormerkliste">auf Vormerkliste</option>
        </select>
        <select className="au-select" name="unternehmer" defaultValue={f.unternehmer || ""}>
          <option value="">Unternehmer & Mitarbeiter</option>
          <option value="unternehmer">nur Unternehmer</option>
          <option value="mitarbeiter">nur Mitarbeiter</option>
        </select>
        <button type="submit" className="au-btn au-btn-primary" style={{ marginBottom: "0.9rem" }}>Filtern</button>
      </form>
      <p className="au-klein" style={{ margin: "0 0 0.5rem" }}>{zeilen.length} Personen · {pilotAnzahl} im Pilotkreis</p>

      <EinladenListe
        zeilen={zeilen}
        einladenAction={ladeInPilotkreisEin}
        vormerkenAction={setzeAufNetzwerkVormerkliste}
        erneutAction={sendeNetzwerkEinladungErneut}
        vormerklisteEntfernenAction={entferneVonNetzwerkVormerkliste}
        zugangAction={setzeNetzwerkZugang}
        rolleAction={setzeAgenturRolle}
      />
    </main>
  );
}
