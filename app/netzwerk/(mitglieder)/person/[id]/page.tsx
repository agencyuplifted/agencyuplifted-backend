import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMitglied } from "@/lib/netzwerk";
import { initialen, AGENTUR_ROLLE_LABEL, whatsappNummer, kanonischesPaar, staerkeText } from "../../../hilfen";

export const metadata = { title: "Profil" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, teilnehmerId } = await requireMitglied();
  const { data: p } = await client
    .from("teilnehmer")
    .select("id, vorname, nachname, position, email, telefon, mobiltelefon, linkedin_url, netzwerk_gastgeber, netzwerk_spezialisierungen, netzwerk_standort, netzwerk_kurzprofil, teilnehmer_organisationen(agentur_rolle, ist_hauptorganisation, organisationen(id, name, rechnungsadresse_ort, branche))")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound(); // unsichtbar, kein Mitglied oder gibt es nicht -- bewusst nicht unterscheidbar

  const ich = id === teilnehmerId;
  const { data: meinProfil } = await client.from("teilnehmer").select("netzwerk_gastgeber").eq("id", teilnehmerId).single();
  // Mit dem Gastgeber gibt es bewusst keine Fadenstaerke (siehe Migration netzwerk_gastgeber).
  const gastgeberBeteiligt = !!p.netzwerk_gastgeber || !!meinProfil?.netzwerk_gastgeber;
  const [a, b] = kanonischesPaar(teilnehmerId, id);
  const [{ data: gemeinsam }, { data: alleStaerken }] = await Promise.all([
    ich ? Promise.resolve({ data: [] as any[] }) : client.from("verbindungs_events").select("quelle_bezeichnung, erstellt_am").eq("typ", "seminar_gemeinsam").eq("teilnehmer_a_id", a).eq("teilnehmer_b_id", b),
    client.from("verbindungsstaerke").select("teilnehmer_a_id, teilnehmer_b_id, staerke"),
  ]);

  const nachbarn = (x: string) =>
    new Set((alleStaerken || []).filter((s) => s.teilnehmer_a_id === x || s.teilnehmer_b_id === x).map((s) => (s.teilnehmer_a_id === x ? s.teilnehmer_b_id : s.teilnehmer_a_id)));
  const staerke = (alleStaerken || []).find((s) => s.teilnehmer_a_id === a && s.teilnehmer_b_id === b)?.staerke || 0;
  const meine = nachbarn(teilnehmerId);
  const gemeinsameIds = ich ? [] : [...nachbarn(id)].filter((x) => meine.has(x) && x !== id && x !== teilnehmerId);
  const { data: gemeinsamePersonen } = gemeinsameIds.length
    ? await client.from("teilnehmer").select("id, vorname, nachname").in("id", gemeinsameIds)
    : { data: [] as any[] };

  const seminare = (gemeinsam || [])
    .map((g: any) => g.quelle_bezeichnung || "Seminar")
    .sort((x: string, y: string) => (y.match(/\d{4}/)?.[0] || "").localeCompare(x.match(/\d{4}/)?.[0] || ""));
  const wa = whatsappNummer(p.mobiltelefon);
  const kontakt = (weg: string) => `/netzwerk/person/${id}/kontakt?weg=${weg}`;

  return (
    <main>
      <p className="ua-klein" style={{ margin: "0 0 0.75rem" }}><Link href="/netzwerk">← Verzeichnis</Link></p>
      <div className="ua-karte">
        <div className="ua-zeile" style={{ alignItems: "flex-start" }}>
          <span className="ua-avatar ua-avatar-gross">{initialen(p.vorname, p.nachname)}</span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0 }}>{p.vorname} {p.nachname}</h1>
            {p.netzwerk_gastgeber && <span className="ua-gastgeber" style={{ marginLeft: 0 }}>Gastgeber von Uplifted Agencies</span>}
            {p.position && <div className="ua-klein" style={{ fontSize: "0.95rem" }}>{p.position}</div>}
            {p.netzwerk_standort && <div className="ua-klein">📍 {p.netzwerk_standort}</div>}
          </div>
        </div>
        {p.netzwerk_kurzprofil && <p style={{ whiteSpace: "pre-wrap", color: "var(--color-text)" }}>{p.netzwerk_kurzprofil}</p>}
        {(p.netzwerk_spezialisierungen || []).length > 0 && (
          <div className="ua-tags">{p.netzwerk_spezialisierungen.map((s: string) => <span key={s} className="ua-tag">{s}</span>)}</div>
        )}
        {!ich && (
          <div className="ua-kontakt">
            {wa && <a className="au-btn au-btn-primary au-btn-sm" href={kontakt("whatsapp")}>WhatsApp</a>}
            {p.email && <a className="au-btn au-btn-secondary au-btn-sm" href={kontakt("mail")}>E-Mail</a>}
            {(p.mobiltelefon || p.telefon) && <a className="au-btn au-btn-secondary au-btn-sm" href={kontakt("telefon")}>Anrufen</a>}
            {p.linkedin_url && <a className="au-btn au-btn-secondary au-btn-sm" href={kontakt("linkedin")} target="_blank" rel="noreferrer">LinkedIn</a>}
            <a className="au-btn au-btn-secondary au-btn-sm" href={`/netzwerk/person/${id}/vcard`}>Kontakt speichern (vCard)</a>
          </div>
        )}
        {ich && <p className="ua-klein" style={{ marginTop: "0.9rem" }}>Das ist dein Profil. <Link href="/netzwerk/einstellungen">Bearbeiten</Link></p>}
      </div>

      {(p.teilnehmer_organisationen || []).filter((z: any) => z.organisationen).map((z: any) => (
        <Link key={z.organisationen.id} href={`/netzwerk/agentur/${z.organisationen.id}`} className="ua-karte ua-person">
          <div className="ua-klein">Agentur{AGENTUR_ROLLE_LABEL[z.agentur_rolle] ? ` · ${AGENTUR_ROLLE_LABEL[z.agentur_rolle]}` : ""}</div>
          <strong>{z.organisationen.name}</strong>
          <div className="ua-klein">{[z.organisationen.branche, z.organisationen.rechnungsadresse_ort].filter(Boolean).join(" · ")}</div>
        </Link>
      ))}

      {!ich && p.netzwerk_gastgeber && (
        <div className="ua-karte ua-klein">
          {p.vorname} hat {"Uplifted Agencies"} ins Leben gerufen und begleitet das Netzwerk persönlich – melde dich jederzeit, wenn du eine Idee, eine Frage oder einen Kontaktwunsch hast.
        </div>
      )}

      {!ich && !gastgeberBeteiligt && (
        <div className="ua-karte">
          <h2 style={{ marginBottom: "0.4rem" }}>Eure Verbindung</h2>
          <div className="ua-faden" style={{ height: 8 }}><span style={{ width: `${staerke}%` }} /></div>
          <p className="ua-klein" style={{ margin: "0.4rem 0 0.8rem" }}>{staerkeText(staerke)} ({staerke}/100)</p>
          <strong style={{ fontSize: "0.9rem" }}>Gemeinsame Seminare</strong>
          {seminare.length ? (
            <ul style={{ margin: "0.3rem 0 0.8rem", paddingLeft: "1.1rem" }}>{seminare.map((s: string) => <li key={s}>{s}</li>)}</ul>
          ) : (
            <p className="ua-klein" style={{ margin: "0.3rem 0 0.8rem" }}>Noch kein gemeinsames Seminar.</p>
          )}
          <strong style={{ fontSize: "0.9rem" }}>Gemeinsame Verbindungen</strong>
          {gemeinsamePersonen?.length ? (
            <div className="ua-tags">
              {gemeinsamePersonen.map((g: any) => <Link key={g.id} href={`/netzwerk/person/${g.id}`} className="ua-tag">{g.vorname} {g.nachname}</Link>)}
            </div>
          ) : (
            <p className="ua-klein" style={{ margin: "0.3rem 0 0" }}>Noch keine.</p>
          )}
        </div>
      )}
    </main>
  );
}
