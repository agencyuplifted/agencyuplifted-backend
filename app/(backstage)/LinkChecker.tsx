"use client";

import { useMemo, useState, useTransition } from "react";
import { findeLinks } from "@/lib/link-finden";
import { pruefeLinks, type LinkErgebnis } from "@/lib/link-check-actions";

// Sammelt alle Links einer Mail in einem eigenen Kasten und prueft sie auf
// Knopfdruck (erreichbar? Weiterleitung? 404?). Persoenliche {{..._link}} und
// Merker wie "[Link]" werden separat ausgewiesen.
export default function LinkChecker({
  text,
  zusatzLinks = [],
  titel = "Links in dieser Mail",
}: {
  text: string;
  /** z. B. Impressum/Datenschutz aus der Fusszeile */
  zusatzLinks?: { label: string; url: string }[];
  titel?: string;
}) {
  const gefunden = useMemo(() => findeLinks(text), [text]);
  const urls = useMemo(
    () => Array.from(new Set([...gefunden.flatMap((g) => (g.art === "url" ? [g.url] : [])), ...zusatzLinks.map((z) => z.url).filter(Boolean)])),
    [gefunden, zusatzLinks]
  );
  const [ergebnisse, setErgebnisse] = useState<Record<string, LinkErgebnis>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();
  const platzhalter = gefunden.filter((g) => g.art === "platzhalter");
  const merker = gefunden.filter((g) => g.art === "merker");
  const zusatzLabel = new Map(zusatzLinks.map((z) => [z.url, z.label]));
  const geprueft = urls.filter((u) => ergebnisse[u]);
  const kaputt = geprueft.filter((u) => !ergebnisse[u].ok).length;

  if (!urls.length && !platzhalter.length && !merker.length) {
    return (
      <div className="au-linkcheck">
        <div className="au-linkcheck-kopf"><span className="au-label" style={{ margin: 0 }}>{titel}</span></div>
        <p className="au-klein" style={{ margin: 0 }}>Keine Links gefunden.</p>
      </div>
    );
  }

  return (
    <div className="au-linkcheck">
      <div className="au-linkcheck-kopf">
        <span className="au-label" style={{ margin: 0 }}>
          {titel} <span className="au-klein">({urls.length + platzhalter.length + merker.length})</span>
        </span>
        {urls.length > 0 && (
          <button
            type="button"
            className="au-btn au-btn-secondary au-btn-sm"
            disabled={laeuft}
            onClick={() =>
              starte(async () => {
                setFehler(null);
                try {
                  const r = await pruefeLinks(urls);
                  setErgebnisse(Object.fromEntries(r.map((e) => [e.url, e])));
                } catch (e: any) {
                  setFehler(e?.message || "Prüfung fehlgeschlagen.");
                }
              })
            }
          >
            {laeuft ? "Prüfe …" : geprueft.length ? "Erneut prüfen" : "Links prüfen"}
          </button>
        )}
      </div>
      {geprueft.length > 0 && (
        <p className={`au-klein au-linkcheck-fazit${kaputt ? " schlecht" : " gut"}`}>
          {kaputt ? `${kaputt} von ${geprueft.length} Links haben ein Problem.` : `Alle ${geprueft.length} Links funktionieren.`}
        </p>
      )}
      {fehler && <p className="au-klein" style={{ color: "var(--color-danger)" }}>{fehler}</p>}
      <ul className="au-linkcheck-liste">
        {merker.map((m) => (
          <li key={m.text} className="schlecht">
            <span className="au-linkcheck-status">✗</span>
            <span className="au-linkcheck-url">{m.text}</span>
            <span className="au-linkcheck-hinweis">Noch kein echter Link – wird wörtlich so verschickt</span>
          </li>
        ))}
        {urls.map((u) => {
          const e = ergebnisse[u];
          return (
            <li key={u} className={e ? (e.ok ? (e.hinweis ? "warnung" : "gut") : "schlecht") : undefined}>
              <span className="au-linkcheck-status">{!e ? "·" : e.ok ? (e.hinweis ? "!" : "✓") : "✗"}</span>
              <a href={u} target="_blank" rel="noreferrer" className="au-linkcheck-url">
                {zusatzLabel.get(u) ? <strong>{zusatzLabel.get(u)}: </strong> : null}
                {u.replace(/^https?:\/\//, "")}
              </a>
              <span className="au-linkcheck-hinweis">
                {!e
                  ? "noch nicht geprüft"
                  : [e.status ? `${e.status}` : null, e.hinweis, e.ziel ? `→ leitet weiter auf ${e.ziel.replace(/^https?:\/\//, "")}` : null].filter(Boolean).join(" · ")}
              </span>
            </li>
          );
        })}
        {platzhalter.map((p) => (
          <li key={p.text} className="info">
            <span className="au-linkcheck-status">i</span>
            <span className="au-linkcheck-url">{p.text}</span>
            <span className="au-linkcheck-hinweis">Persönlicher Link – wird pro Empfänger erzeugt, nicht vorab prüfbar</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
