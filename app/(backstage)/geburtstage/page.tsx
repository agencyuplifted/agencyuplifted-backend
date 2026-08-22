export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  ladeAnstehendeGeburtstage,
  ladeAlleGeburtstage,
  gruppiereNachMonat,
  QUARTALE,
  type GeburtstagsEintrag,
} from "@/lib/geburtstage";
import { formatDatum } from "@/lib/format";

const VORLAUF_OPTIONEN = [14, 30, 90, 180];

function tageBisText(tageBis: number) {
  if (tageBis === 0) return "Heute!";
  if (tageBis === 1) return "Morgen";
  return `in ${tageBis} Tagen`;
}

function tagMonat(e: GeburtstagsEintrag) {
  return `${String(e.geburtsTag).padStart(2, "0")}.${String(e.geburtsMonat).padStart(2, "0")}.`;
}

function QuelleBadge({ quelle }: { quelle: GeburtstagsEintrag["quelle"] }) {
  return (
    <span className={`au-badge ${quelle === "teilnehmer" ? "au-badge-neutral" : "au-badge-warning"}`}>
      {quelle === "teilnehmer" ? "Teilnehmer" : "Buch-Kontakt"}
    </span>
  );
}

function GeburtstagsZeile({ e }: { e: GeburtstagsEintrag }) {
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>
        <Link href={e.detailHref}>{e.name}</Link>
      </td>
      <td>{e.firma || "—"}</td>
      <td><QuelleBadge quelle={e.quelle} /></td>
      <td>
        {formatDatum(e.geburtsdatum)} <span style={{ color: "var(--color-text-muted)" }}>(wird {e.wirdAlt})</span>
      </td>
      <td>{tageBisText(e.tageBis)}</td>
      <td>
        {e.bereitsGratuliertDiesesJahr ? (
          <span className="au-badge au-badge-success">gratuliert</span>
        ) : (
          "—"
        )}
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {e.email && (
            <Link
              href={`/geburtstage/senden?quelle=${e.quelle}&id=${e.id}`}
              className="au-btn au-btn-primary au-btn-sm"
            >
              E-Mail senden
            </Link>
          )}
          <Link href={e.detailHref} className="au-btn au-btn-secondary au-btn-sm">
            Bearbeiten
          </Link>
        </div>
      </td>
    </tr>
  );
}

export default async function GeburtstagePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; tage?: string; gruppierung?: string }>;
}) {
  const { ansicht: ansichtRaw, tage: tageRaw, gruppierung: gruppierungRaw } = await searchParams;
  const ansicht = ansichtRaw === "kalender" ? "kalender" : "vorlauf";
  const tage = VORLAUF_OPTIONEN.includes(Number(tageRaw)) ? Number(tageRaw) : 30;
  const gruppierung = gruppierungRaw === "quartal" ? "quartal" : "monat";

  return (
    <main>
      <h1>Geburtstage</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Anstehende Geburtstage aus Teilnehmern und Buch-Kontakten (Presse/Berater), gebündelt für Geburtstagsgrüße
        per Post oder E-Mail. Abgemeldete Teilnehmer (Marketing-Consent) werden nicht angezeigt.
      </p>

      <div className="au-tabs">
        <Link href={`/geburtstage?ansicht=vorlauf&tage=${tage}`} className={`au-tab ${ansicht === "vorlauf" ? "au-tab-active" : ""}`}>
          Vorlauf
        </Link>
        <Link href={`/geburtstage?ansicht=kalender&gruppierung=${gruppierung}`} className={`au-tab ${ansicht === "kalender" ? "au-tab-active" : ""}`}>
          Kalenderansicht
        </Link>
        <Link href="/geburtstage/vorlagen" className="au-tab">
          Vorlagen verwalten
        </Link>
      </div>

      {ansicht === "vorlauf" && <VorlaufAnsicht tage={tage} />}
      {ansicht === "kalender" && <KalenderAnsicht gruppierung={gruppierung} />}
    </main>
  );
}

async function VorlaufAnsicht({ tage }: { tage: number }) {
  const eintraege = await ladeAnstehendeGeburtstage(tage);

  return (
    <>
      <div className="au-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {VORLAUF_OPTIONEN.map((t) => (
            <Link
              key={t}
              href={`/geburtstage?ansicht=vorlauf&tage=${t}`}
              className={`au-btn au-btn-sm ${t === tage ? "au-btn-primary" : "au-btn-secondary"}`}
            >
              {t} Tage
            </Link>
          ))}
        </div>
        <a href={`/api/geburtstage/export?ansicht=vorlauf&tage=${tage}`} className="au-btn au-btn-secondary au-btn-sm">
          CSV exportieren
        </a>
      </div>

      <div className="au-card">
        <h2>
          {eintraege.length} Geburtstag(e) in den nächsten {tage} Tagen
        </h2>
        {!eintraege.length && <p style={{ margin: 0 }}>Keine anstehenden Geburtstage in diesem Zeitraum.</p>}
        {!!eintraege.length && (
          <table className="au-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Firma</th>
                <th>Quelle</th>
                <th>Geburtstag</th>
                <th>Wann</th>
                <th>Status</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {eintraege.map((e) => (
                <GeburtstagsZeile key={`${e.quelle}-${e.id}`} e={e} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

async function KalenderAnsicht({ gruppierung }: { gruppierung: "monat" | "quartal" }) {
  const alle = await ladeAlleGeburtstage();
  const monatsGruppen = gruppiereNachMonat(alle);

  const anzuzeigendeGruppen =
    gruppierung === "quartal"
      ? QUARTALE.map((q) => ({
          label: q.label,
          eintraege: monatsGruppen
            .filter((g) => q.monate.includes(g.monat))
            .flatMap((g) => g.eintraege)
            .sort((a, b) => a.geburtsMonat - b.geburtsMonat || a.geburtsTag - b.geburtsTag),
          exportParam: `quartal=${q.key}`,
        }))
      : monatsGruppen.map((g) => ({ label: g.monatsName, eintraege: g.eintraege, exportParam: `monat=${g.monat}` }));

  return (
    <>
      <div className="au-card" style={{ display: "flex", gap: "0.5rem" }}>
        <Link
          href="/geburtstage?ansicht=kalender&gruppierung=monat"
          className={`au-btn au-btn-sm ${gruppierung === "monat" ? "au-btn-primary" : "au-btn-secondary"}`}
        >
          Monatlich
        </Link>
        <Link
          href="/geburtstage?ansicht=kalender&gruppierung=quartal"
          className={`au-btn au-btn-sm ${gruppierung === "quartal" ? "au-btn-primary" : "au-btn-secondary"}`}
        >
          Vierteljährlich
        </Link>
      </div>

      {anzuzeigendeGruppen.map((gruppe) => (
        <div className="au-card" key={gruppe.label}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            <h2 style={{ margin: 0 }}>
              {gruppe.label} · {gruppe.eintraege.length}
            </h2>
            {!!gruppe.eintraege.length && (
              <a
                href={`/api/geburtstage/export?ansicht=kalender&${gruppe.exportParam}`}
                className="au-btn au-btn-secondary au-btn-sm"
              >
                CSV exportieren
              </a>
            )}
          </div>
          {!gruppe.eintraege.length && <p style={{ margin: 0, color: "var(--color-text-muted)" }}>Keine Geburtstage.</p>}
          {!!gruppe.eintraege.length && (
            <table className="au-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Name</th>
                  <th>Firma</th>
                  <th>Quelle</th>
                  <th>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {gruppe.eintraege.map((e) => (
                  <tr key={`${e.quelle}-${e.id}`}>
                    <td>{tagMonat(e)}</td>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={e.detailHref}>{e.name}</Link>
                    </td>
                    <td>{e.firma || "—"}</td>
                    <td><QuelleBadge quelle={e.quelle} /></td>
                    <td>
                      {e.email && (
                        <Link href={`/geburtstage/senden?quelle=${e.quelle}&id=${e.id}`} className="au-btn au-btn-primary au-btn-sm">
                          E-Mail senden
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
}
