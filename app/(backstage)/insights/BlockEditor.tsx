"use client";

import { useMemo, useRef, useState } from "react";
import type { Block } from "@/lib/insights";
import { parseTextZuBloecke, serialisiereBloeckeZuText } from "@/lib/insights";

type Faq = { frage: string; antwort: string };

function zeilenGrenzen(value: string, start: number, end: number) {
  const vorNewline = value.lastIndexOf("\n", Math.max(0, start - 1));
  const zeilenStart = vorNewline === -1 ? 0 : vorNewline + 1;
  const nachNewline = value.indexOf("\n", end);
  const zeilenEnde = nachNewline === -1 ? value.length : nachNewline;
  return { zeilenStart, zeilenEnde };
}

function wrappeAuswahl(
  el: HTMLTextAreaElement,
  marker: string,
  setText: (v: string) => void
) {
  const { value, selectionStart: start, selectionEnd: end } = el;
  if (start === end) return;
  const ausgewaehlt = value.slice(start, end);
  const bereitsMarkiert = ausgewaehlt.startsWith(marker) && ausgewaehlt.endsWith(marker) && ausgewaehlt.length > marker.length * 2;
  const neu = bereitsMarkiert ? ausgewaehlt.slice(marker.length, -marker.length) : `${marker}${ausgewaehlt}${marker}`;
  const neuerText = value.slice(0, start) + neu + value.slice(end);
  setText(neuerText);
  requestAnimationFrame(() => el.focus());
}

function togglePraefixProZeile(
  el: HTMLTextAreaElement,
  praefix: string,
  setText: (v: string) => void
) {
  const { value } = el;
  const { zeilenStart, zeilenEnde } = zeilenGrenzen(value, el.selectionStart, el.selectionEnd);
  const block = value.slice(zeilenStart, zeilenEnde);
  const zeilen = block.split("\n");
  const alleHaben = zeilen.every((z) => z.trim() === "" || z.startsWith(praefix));
  const neueZeilen = zeilen.map((z) => (z.trim() === "" ? z : alleHaben ? z.slice(praefix.length) : praefix + z));
  const neuerText = value.slice(0, zeilenStart) + neueZeilen.join("\n") + value.slice(zeilenEnde);
  setText(neuerText);
  requestAnimationFrame(() => el.focus());
}

function toggleNummerierteListe(el: HTMLTextAreaElement, setText: (v: string) => void) {
  const { value } = el;
  const { zeilenStart, zeilenEnde } = zeilenGrenzen(value, el.selectionStart, el.selectionEnd);
  const block = value.slice(zeilenStart, zeilenEnde);
  const zeilen = block.split("\n");
  const alleHaben = zeilen.every((z) => z.trim() === "" || /^\d+\.\s/.test(z));
  let zaehler = 1;
  const neueZeilen = zeilen.map((z) => {
    if (z.trim() === "") return z;
    if (alleHaben) return z.replace(/^\d+\.\s/, "");
    return `${zaehler++}. ${z}`;
  });
  const neuerText = value.slice(0, zeilenStart) + neueZeilen.join("\n") + value.slice(zeilenEnde);
  setText(neuerText);
  requestAnimationFrame(() => el.focus());
}

function fuegeBildEin(el: HTMLTextAreaElement, setText: (v: string) => void) {
  const { value, selectionStart: pos } = el;
  const schnipsel = "![Alt-Text](https://... \"Bildunterschrift optional\")";
  const braucht_zeilenumbruch = pos > 0 && value[pos - 1] !== "\n";
  const einfuegung = (braucht_zeilenumbruch ? "\n\n" : "") + schnipsel + "\n\n";
  const neuerText = value.slice(0, pos) + einfuegung + value.slice(pos);
  setText(neuerText);
  requestAnimationFrame(() => el.focus());
}

const werkzeugBtn: React.CSSProperties = {
  fontSize: "0.8rem",
  border: "1px solid var(--color-border-strong)",
  background: "#fff",
  borderRadius: "var(--radius-sm)",
  padding: "0.3rem 0.7rem",
  cursor: "pointer",
};

export default function BlockEditor({ name, initial }: { name: string; initial: Block[] }) {
  const initialText = useMemo(
    () => serialisiereBloeckeZuText((initial || []).filter((b) => b.typ !== "faq")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const initialFaqs = useMemo(
    () =>
      (initial || [])
        .filter((b): b is Extract<Block, { typ: "faq" }> => b.typ === "faq")
        .map((b) => ({ frage: b.frage, antwort: b.antwort })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [haupttext, setHaupttext] = useState(initialText);
  const [faqs, setFaqs] = useState<Faq[]>(initialFaqs);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historieRef = useRef<string[]>([]);
  const [historieVorhanden, setHistorieVorhanden] = useState(false);

  const bloecke = useMemo(() => {
    const textBloecke = parseTextZuBloecke(haupttext);
    const faqBloecke: Block[] = faqs
      .filter((f) => f.frage.trim() || f.antwort.trim())
      .map((f) => ({ typ: "faq" as const, frage: f.frage, antwort: f.antwort }));
    return [...textBloecke, ...faqBloecke];
  }, [haupttext, faqs]);

  function mitTextarea(fn: (el: HTMLTextAreaElement, setText: (v: string) => void) => void) {
    if (!textareaRef.current) return;
    historieRef.current = [...historieRef.current.slice(-19), haupttext];
    setHistorieVorhanden(true);
    fn(textareaRef.current, setHaupttext);
  }

  function rueckgaengig() {
    const letztes = historieRef.current.pop();
    if (letztes !== undefined) setHaupttext(letztes);
    setHistorieVorhanden(historieRef.current.length > 0);
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(bloecke)} />

      <div className="au-toolbar" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
        <button type="button" style={{ ...werkzeugBtn, fontWeight: 700 }} onClick={() => mitTextarea((el, s) => wrappeAuswahl(el, "**", s))}>
          Fett
        </button>
        <button type="button" style={werkzeugBtn} onClick={() => mitTextarea((el, s) => togglePraefixProZeile(el, "## ", s))}>
          Überschrift H2
        </button>
        <button type="button" style={werkzeugBtn} onClick={() => mitTextarea((el, s) => togglePraefixProZeile(el, "### ", s))}>
          Überschrift H3
        </button>
        <button type="button" style={werkzeugBtn} onClick={() => mitTextarea((el, s) => togglePraefixProZeile(el, "> ", s))}>
          Zitat
        </button>
        <button type="button" style={werkzeugBtn} onClick={() => mitTextarea((el, s) => togglePraefixProZeile(el, "- ", s))}>
          Liste
        </button>
        <button type="button" style={werkzeugBtn} onClick={() => mitTextarea((el, s) => toggleNummerierteListe(el, s))}>
          Nummerierte Liste
        </button>
        <button type="button" style={werkzeugBtn} onClick={() => mitTextarea((el, s) => fuegeBildEin(el, s))}>
          Bild einfügen
        </button>
        <button
          type="button"
          style={{ ...werkzeugBtn, opacity: historieVorhanden ? 1 : 0.4 }}
          onClick={rueckgaengig}
          disabled={!historieVorhanden}
        >
          ↺ Rückgängig
        </button>
      </div>

      <textarea
        ref={textareaRef}
        className="au-textarea"
        rows={18}
        placeholder="Schreib einfach los. Text markieren und einen Button oben klicken für Fett, Überschriften, Zitate oder Listen."
        value={haupttext}
        onChange={(e) => setHaupttext(e.target.value)}
        style={{ fontFamily: "inherit" }}
      />

      <div className="au-card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Häufig gestellte Fragen (optional)</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: 0 }}>
          Getrennt vom Fließtext, da diese Fragen als eigenes Google-Markup ausgezeichnet werden.
        </p>
        {faqs.map((f, i) => (
          <div key={i} className="au-subcard" style={{ marginBottom: "0.6rem" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.35rem" }}>
              <button
                type="button"
                className="au-btn au-btn-danger au-btn-sm"
                onClick={() => setFaqs((liste) => liste.filter((_, idx) => idx !== i))}
              >
                Entfernen
              </button>
            </div>
            <input
              className="au-input"
              placeholder="Frage"
              value={f.frage}
              onChange={(e) => setFaqs((liste) => liste.map((x, idx) => (idx === i ? { ...x, frage: e.target.value } : x)))}
              style={{ marginBottom: "0.5rem" }}
            />
            <textarea
              className="au-textarea"
              rows={2}
              placeholder="Antwort"
              value={f.antwort}
              onChange={(e) => setFaqs((liste) => liste.map((x, idx) => (idx === i ? { ...x, antwort: e.target.value } : x)))}
            />
          </div>
        ))}
        <button
          type="button"
          className="au-btn au-btn-secondary au-btn-sm"
          onClick={() => setFaqs((liste) => [...liste, { frage: "", antwort: "" }])}
        >
          + Frage hinzufügen
        </button>
      </div>
    </div>
  );
}
