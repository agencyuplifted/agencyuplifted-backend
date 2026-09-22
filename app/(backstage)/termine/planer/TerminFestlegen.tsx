"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { legeTerminAusKandidatAn } from "@/lib/terminplaner-actions";

// "Als Termin festlegen" im Terminplaner. Knopf (Kopfzeile der Kandidaten-
// Zeile) und Panel (volle Breite darunter) sind zwei Komponenten, weil sie
// an verschiedenen Stellen der server-gerenderten Zeile sitzen -- sie
// verstaendigen sich ueber ein Browser-Event mit der Kandidaten-ID.

const EVENT = "tp-termin-festlegen";

export type QuellTermin = {
  id: string;
  label: string;
  seminartyp_id: string | null;
  kategorie: string;
  datum_start: string;
  titel: string | null;
  anzahl: { optionen: number; staffeln: number; urgency: number; mitarbeiter: number; unterlagen: number };
};

export function TerminFestlegenKnopf({ kandidatId }: { kandidatId: string }) {
  return (
    <button
      type="button"
      className="au-btn au-btn-primary au-btn-sm"
      onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: kandidatId }))}
    >
      Als Termin festlegen
    </button>
  );
}

type Bereich = "optionen" | "preisstaffeln" | "einstellungen" | "urgency" | "mitarbeiter" | "unterlagen";

// Standard-Quelle: juengster Termin derselben Kategorie, der Optionen hat
// (sonst juengster ueberhaupt) -- meist der direkte Vorgaenger.
function standardQuelle(quellen: QuellTermin[], kategorieId: string): string {
  const passend = quellen.filter((q) => q.seminartyp_id === kategorieId).sort((a, b) => b.datum_start.localeCompare(a.datum_start));
  return (passend.find((q) => q.anzahl.optionen > 0) || passend[0])?.id || "";
}

export function TerminFestlegenPanel({
  kandidat,
  typen,
  orte,
  quellen,
}: {
  kandidat: { id: string; seminartyp_id: string | null; veranstaltungsort_id: string | null; spanne: string };
  typen: { id: string; name: string }[];
  orte: { id: string; name: string }[];
  quellen: QuellTermin[];
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [kategorie, setKategorie] = useState(kandidat.seminartyp_id || "");
  const [quelleId, setQuelleId] = useState(() => standardQuelle(quellen, kandidat.seminartyp_id || ""));
  // Hat Markus die Quelle selbst gewaehlt, folgt sie der Kategorie nicht mehr.
  const [quelleManuell, setQuelleManuell] = useState(false);
  const [bereiche, setBereiche] = useState<Record<Bereich, boolean>>({
    optionen: true,
    preisstaffeln: true,
    einstellungen: true,
    urgency: true,
    mitarbeiter: true,
    unterlagen: true,
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === kandidat.id) setOffen((o) => !o);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [kandidat.id]);

  const quelle = quellen.find((q) => q.id === quelleId) || null;

  // Quellen nach Kategorie gruppiert, gewaehlte Kategorie zuerst
  const gruppen = useMemo(() => {
    const map = new Map<string, QuellTermin[]>();
    for (const q of [...quellen].sort((a, b) => b.datum_start.localeCompare(a.datum_start))) {
      map.set(q.kategorie, [...(map.get(q.kategorie) || []), q]);
    }
    const eigene = typen.find((t) => t.id === kategorie)?.name;
    return Array.from(map.entries()).sort(([a], [b]) => (a === eigene ? -1 : b === eigene ? 1 : a.localeCompare(b)));
  }, [quellen, kategorie, typen]);

  if (!offen) return null;

  function waehleKategorie(id: string) {
    setKategorie(id);
    if (!quelleManuell) setQuelleId(standardQuelle(quellen, id));
  }

  const zeilen: { key: Bereich; label: string; anzahl?: number; hinweis?: string }[] = [
    { key: "optionen", label: "Optionen inkl. Features, Badge, Ratenzahlung", anzahl: quelle?.anzahl.optionen },
    {
      key: "preisstaffeln",
      label: "Preisstaffeln – relativ zum neuen Start",
      anzahl: quelle?.anzahl.staffeln,
      hinweis: "Gleicher Abstand zum Start; feste Stichtage bleiben auf ihrem Wochentag (±3 Tage, keine Feiertage DE/AT/CH). Schon verstrichene Stufen entfallen, die späteste bleibt immer.",
    },
    {
      key: "einstellungen",
      label: "Termin-Einstellungen",
      hinweis: "Kapazität, Puffer, Mindest-TN, Trainer, Uhrzeiten, Buchungsschluss, Zusatz-TN-Preis, Zimmerupgrade, Eyebrow/Untertitel/Titel, Selbstauskunft, Verfügbarkeitsanzeige",
    },
    { key: "urgency", label: "Urgency-Stufen", anzahl: quelle?.anzahl.urgency },
    { key: "mitarbeiter", label: "Mitarbeiter-Zuordnung", anzahl: quelle?.anzahl.mitarbeiter },
    { key: "unterlagen", label: "Seminar-Unterlagen (Dateien werden kopiert)", anzahl: quelle?.anzahl.unterlagen },
  ];

  function absenden(fd: FormData) {
    setFehler(null);
    starte(async () => {
      try {
        const r = await legeTerminAusKandidatAn(fd);
        if (r.fehler) {
          setFehler(r.fehler);
          return;
        }
        router.push(`/termine/${r.terminId}${r.info ? `?uebernahme=${encodeURIComponent(r.info)}` : ""}`);
      } catch (e: any) {
        setFehler(`Fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
      }
    });
  }

  return (
    <form action={absenden} className="au-tp-festlegen" style={{ opacity: laeuft ? 0.6 : undefined }}>
      <input type="hidden" name="id" value={kandidat.id} />
      <div className="au-tp-festlegen-kopf">
        <strong>{kandidat.spanne} als Termin festlegen</strong>
        <button type="button" className="au-link" onClick={() => setOffen(false)}>schließen</button>
      </div>

      <div className="au-tp-festlegen-raster">
        <label>
          <span className="au-label">Kategorie *</span>
          <select className="au-select" name="seminartyp_id" value={kategorie} onChange={(e) => waehleKategorie(e.target.value)} required>
            <option value="">bitte wählen</option>
            {typen.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-label">Veranstaltungsort *</span>
          <select className="au-select" name="veranstaltungsort_id" defaultValue={kandidat.veranstaltungsort_id || ""} required>
            <option value="">bitte wählen</option>
            {orte.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="au-label">Kennung</span>
          <input className="au-input" name="kennung" placeholder="z. B. ORG127" />
        </label>
        <label>
          <span className="au-label">Titel</span>
          <input
            className="au-input"
            name="titel"
            placeholder={quelle?.titel && bereiche.einstellungen ? `leer = „${quelle.titel}“` : "optional"}
          />
        </label>
      </div>

      <div className="au-tp-festlegen-quelle">
        <label>
          <span className="au-label">Einstellungen übernehmen aus</span>
          <select
            className="au-select"
            name="quelle_id"
            value={quelleId}
            onChange={(e) => {
              setQuelleId(e.target.value);
              setQuelleManuell(true);
            }}
          >
            <option value="">– nichts übernehmen (leerer Termin) –</option>
            {gruppen.map(([name, liste]) => (
              <optgroup key={name} label={name}>
                {liste.map((q) => (
                  <option key={q.id} value={q.id}>{q.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {quelle && (
          <ul className="au-tp-festlegen-bereiche">
            {zeilen.map((z) => {
              const leer = z.anzahl === 0;
              const gesperrt = leer || (z.key === "preisstaffeln" && !bereiche.optionen);
              return (
                <li key={z.key} className={gesperrt ? "gesperrt" : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      name={`uebernahme_${z.key}`}
                      checked={bereiche[z.key] && !gesperrt}
                      disabled={gesperrt}
                      onChange={(e) => setBereiche((b) => ({ ...b, [z.key]: e.target.checked }))}
                    />
                    <span>
                      {z.label}
                      {z.anzahl !== undefined && <span className="au-klein"> ({leer ? "keine" : z.anzahl})</span>}
                      {z.hinweis && <span className="au-klein au-tp-festlegen-hinweis">{z.hinweis}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {fehler && (
        <div className="au-banner au-banner-error" style={{ margin: "0.6rem 0 0", padding: "0.5rem 0.75rem" }}>{fehler}</div>
      )}

      <div className="au-tp-festlegen-fuss">
        <button type="submit" className="au-btn au-btn-primary au-btn-sm" disabled={laeuft}>
          {laeuft ? "Wird angelegt …" : quelle ? "Termin anlegen & übernehmen" : "Leeren Termin anlegen"}
        </button>
        <span className="au-klein">Danach öffnet sich der neue Termin zum Weiterbearbeiten.</span>
      </div>
    </form>
  );
}
