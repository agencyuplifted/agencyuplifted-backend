"use client";

import { useState, useTransition } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import {
  INBOX_TYPEN,
  INBOX_TYP_LABEL,
  INBOX_BEREICHE,
  INBOX_BEREICH_LABEL,
  INBOX_FORMATE,
  INBOX_FORMAT_LABEL,
  INBOX_STATUS,
  INBOX_STATUS_LABEL,
  INBOX_QUELLE_LABEL,
  type InboxEintrag,
  type Themencluster,
} from "@/lib/inbox";

type Aktion = (formData: FormData) => Promise<VorlagenAktionsErgebnis>;

type Zustand = Pick<
  InboxEintrag,
  "text" | "titel" | "typ" | "bereiche" | "formate" | "status" | "ist_fokus" | "wiedervorlage_am" | "notizen" | "cluster_ids"
>;

function umschalten<T>(liste: T[], wert: T): T[] {
  return liste.includes(wert) ? liste.filter((w) => w !== wert) : [...liste, wert];
}

// Eine Inbox-Karte mit Inline-Einsortieren. Jede Aenderung speichert sofort
// den kompletten Stand (speichereInboxEintrag) -- Auswahlfelder/Chips direkt,
// Textfelder erst beim Verlassen, damit nicht bei jedem Tastendruck
// gespeichert wird. Karte statt Tabellenzeile, weil das auf dem iPhone
// bedienbar bleiben muss.
export default function InboxKarte({
  eintrag,
  cluster,
  heute,
  speichernAction,
  themenRadarAction,
}: {
  eintrag: InboxEintrag;
  cluster: Themencluster[];
  heute: string;
  speichernAction: Aktion;
  themenRadarAction: Aktion;
}) {
  const [z, setZ] = useState<Zustand>({
    text: eintrag.text,
    titel: eintrag.titel,
    typ: eintrag.typ,
    bereiche: eintrag.bereiche || [],
    formate: eintrag.formate || [],
    status: eintrag.status,
    ist_fokus: eintrag.ist_fokus,
    wiedervorlage_am: eintrag.wiedervorlage_am,
    notizen: eintrag.notizen,
    cluster_ids: eintrag.cluster_ids,
  });
  const [gespeichert, setGespeichert] = useState<Zustand>(z);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [laeuft, starte] = useTransition();

  function speichern(neu: Zustand) {
    setZ(neu);
    const fd = new FormData();
    fd.set("id", eintrag.id);
    fd.set("text", neu.text);
    fd.set("titel", neu.titel || "");
    fd.set("typ", neu.typ || "");
    fd.set("status", neu.status);
    fd.set("ist_fokus", String(neu.ist_fokus));
    fd.set("wiedervorlage_am", neu.wiedervorlage_am || "");
    fd.set("notizen", neu.notizen || "");
    neu.bereiche.forEach((b) => fd.append("bereiche", b));
    neu.formate.forEach((f) => fd.append("formate", f));
    neu.cluster_ids.forEach((c) => fd.append("cluster_ids", c));
    starte(async () => {
      setFehler(null);
      try {
        const r = await speichernAction(fd);
        if (r.fehler) {
          setFehler(r.fehler);
          setZ(gespeichert);
        } else {
          setGespeichert(neu);
          setMeldung("gespeichert");
          setTimeout(() => setMeldung(null), 1500);
        }
      } catch (e: any) {
        setFehler(`Speichern fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
        setZ(gespeichert);
      }
    });
  }

  function textfeldVerlassen(feld: "text" | "titel" | "notizen") {
    if ((z[feld] || "") !== (gespeichert[feld] || "")) speichern(z);
  }

  function zuTheme() {
    const fd = new FormData();
    fd.set("id", eintrag.id);
    starte(async () => {
      setFehler(null);
      const r = await themenRadarAction(fd);
      if (r.fehler) setFehler(r.fehler);
    });
  }

  const faellig = z.wiedervorlage_am && z.wiedervorlage_am <= heute;
  const geschlossen = z.status === "erledigt" || z.status === "verworfen" || z.status === "archiviert";
  const aktiveCluster = cluster.filter((c) => !c.archiviert_am || z.cluster_ids.includes(c.id));

  return (
    <div className={`au-inbox-karte${z.ist_fokus ? " au-inbox-fokus" : ""}${geschlossen ? " au-inbox-geschlossen" : ""}`}>
      <div className="au-inbox-kopf">
        <button
          type="button"
          className={`au-inbox-stern${z.ist_fokus ? " aktiv" : ""}`}
          onClick={() => speichern({ ...z, ist_fokus: !z.ist_fokus })}
          title={z.ist_fokus ? "Fokus entfernen" : "Als Fokus-Thema markieren"}
          aria-pressed={z.ist_fokus}
        >
          {z.ist_fokus ? "★" : "☆"}
        </button>
        <select
          className="au-select au-inbox-select"
          value={z.typ || ""}
          onChange={(e) => speichern({ ...z, typ: (e.target.value || null) as Zustand["typ"] })}
          aria-label="Typ"
        >
          <option value="">– unsortiert –</option>
          {INBOX_TYPEN.map((t) => (
            <option key={t} value={t}>{INBOX_TYP_LABEL[t]}</option>
          ))}
        </select>
        <select
          className="au-select au-inbox-select"
          value={z.status}
          onChange={(e) => speichern({ ...z, status: e.target.value as Zustand["status"] })}
          aria-label="Status"
        >
          {INBOX_STATUS.map((s) => (
            <option key={s} value={s}>{INBOX_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <label className={`au-inbox-wv${faellig ? " faellig" : ""}`} title="Wiedervorlage">
          ⏰
          <input
            type="date"
            value={z.wiedervorlage_am || ""}
            onChange={(e) => speichern({ ...z, wiedervorlage_am: e.target.value || null })}
            aria-label="Wiedervorlage am"
          />
        </label>
        <span className="au-inbox-status">
          {laeuft ? "speichert …" : meldung}
        </span>
      </div>

      {z.titel && !offen && <strong className="au-inbox-titel">{z.titel}</strong>}
      <textarea
        className="au-inbox-text"
        value={z.text}
        rows={Math.min(8, Math.max(2, Math.ceil(z.text.length / 70)))}
        onChange={(e) => setZ({ ...z, text: e.target.value })}
        onBlur={() => textfeldVerlassen("text")}
        aria-label="Text"
      />

      <div className="au-chips" aria-label="Bereiche">
        {INBOX_BEREICHE.map((b) => (
          <button
            key={b}
            type="button"
            className={`au-chip${z.bereiche.includes(b) ? " aktiv" : ""}`}
            onClick={() => speichern({ ...z, bereiche: umschalten(z.bereiche, b) })}
            aria-pressed={z.bereiche.includes(b)}
          >
            {INBOX_BEREICH_LABEL[b]}
          </button>
        ))}
      </div>
      {aktiveCluster.length > 0 && (
        <div className="au-chips" aria-label="Themencluster">
          {aktiveCluster.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`au-chip au-chip-cluster${z.cluster_ids.includes(c.id) ? " aktiv" : ""}`}
              onClick={() => speichern({ ...z, cluster_ids: umschalten(z.cluster_ids, c.id) })}
              aria-pressed={z.cluster_ids.includes(c.id)}
              title={c.beschreibung || undefined}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {(z.typ === "thema" || z.formate.length > 0) && (
        <div className="au-chips" aria-label="Formate">
          {INBOX_FORMATE.map((f) => (
            <button
              key={f}
              type="button"
              className={`au-chip au-chip-format${z.formate.includes(f) ? " aktiv" : ""}`}
              onClick={() => speichern({ ...z, formate: umschalten(z.formate, f) })}
              aria-pressed={z.formate.includes(f)}
            >
              {INBOX_FORMAT_LABEL[f]}
            </button>
          ))}
        </div>
      )}

      {fehler && <p className="au-inbox-fehler">{fehler}</p>}

      <div className="au-inbox-fuss">
        <span>
          {INBOX_QUELLE_LABEL[eintrag.quelle]} · {new Date(eintrag.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
          {eintrag.themen_radar_idee_id && <> · <a href="/content-creation">im Themen-Radar</a></>}
        </span>
        <span style={{ display: "flex", gap: "0.9rem" }}>
          <button type="button" className="au-link" onClick={() => setOffen((o) => !o)}>
            {offen ? "weniger" : "Details"}
          </button>
          {!geschlossen && (
            <button type="button" className="au-link-danger" onClick={() => speichern({ ...z, status: "verworfen" })}>
              verwerfen
            </button>
          )}
        </span>
      </div>

      {offen && (
        <div className="au-inbox-details">
          <label className="au-label">Titel (optional)</label>
          <input
            className="au-input"
            value={z.titel || ""}
            onChange={(e) => setZ({ ...z, titel: e.target.value })}
            onBlur={() => textfeldVerlassen("titel")}
          />
          <label className="au-label">Notizen (Markdown)</label>
          <textarea
            className="au-textarea"
            rows={5}
            value={z.notizen || ""}
            onChange={(e) => setZ({ ...z, notizen: e.target.value })}
            onBlur={() => textfeldVerlassen("notizen")}
          />
          {z.typ !== "thema" && z.formate.length === 0 && (
            <div className="au-chips" aria-label="Formate">
              {INBOX_FORMATE.map((f) => (
                <button key={f} type="button" className="au-chip au-chip-format" onClick={() => speichern({ ...z, formate: [f] })}>
                  {INBOX_FORMAT_LABEL[f]}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
            {!eintrag.themen_radar_idee_id && (
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={zuTheme} disabled={laeuft}>
                An Themen-Radar übergeben
              </button>
            )}
            {z.status !== "archiviert" && (
              <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => speichern({ ...z, status: "archiviert" })}>
                Archivieren
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
