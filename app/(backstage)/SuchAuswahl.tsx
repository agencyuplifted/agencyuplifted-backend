"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Durchsuchbare Auswahl statt langer <select>-Listen (Markus 10/2026: "schnöde,
// kann man die Firma/Person besser suchen?"). Mehrere Suchwoerter, Gross-/
// Kleinschreibung egal, durchsucht Bezeichnung + Zusatz (E-Mail, Firma).
// Der Wert geht ueber ein verstecktes Feld mit "name" ins Formular.
export type SuchOption = { value: string; label: string; sub?: string };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export default function SuchAuswahl({
  name,
  optionen,
  value,
  onChange,
  placeholder = "Suchen …",
  required = false,
  leerText,
}: {
  name: string;
  optionen: SuchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Eintrag fuer "nichts gewaehlt" (z. B. "keine Organisation") */
  leerText?: string;
}) {
  const gewaehlt = optionen.find((o) => o.value === value) || null;
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState(false);
  const [markiert, setMarkiert] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  const treffer = useMemo(() => {
    const woerter = norm(suche).split(/\s+/).filter(Boolean);
    const liste = woerter.length ? optionen.filter((o) => woerter.every((w) => norm(`${o.label} ${o.sub || ""}`).includes(w))) : optionen;
    return liste.slice(0, 60);
  }, [suche, optionen]);

  useEffect(() => {
    const zu = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, []);

  function waehle(v: string) {
    onChange(v);
    setSuche("");
    setOffen(false);
  }

  const eintraege: SuchOption[] = leerText ? [{ value: "", label: leerText }, ...treffer] : treffer;

  return (
    <div className="au-suchauswahl" ref={box}>
      <input type="hidden" name={name} value={value} />
      <input
        ref={eingabe}
        className="au-input"
        style={{ marginBottom: 0 }}
        value={offen ? suche : gewaehlt ? `${gewaehlt.label}${gewaehlt.sub ? ` · ${gewaehlt.sub}` : ""}` : ""}
        placeholder={gewaehlt ? undefined : leerText && !value ? leerText : placeholder}
        onFocus={() => {
          setOffen(true);
          setSuche("");
          setMarkiert(0);
        }}
        onChange={(e) => {
          setSuche(e.target.value);
          setOffen(true);
          setMarkiert(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setMarkiert((m) => Math.min(m + 1, eintraege.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setMarkiert((m) => Math.max(m - 1, 0));
          } else if (e.key === "Enter" && offen) {
            e.preventDefault();
            if (eintraege[markiert]) waehle(eintraege[markiert].value);
          } else if (e.key === "Escape") {
            setOffen(false);
            eingabe.current?.blur();
          }
        }}
        aria-expanded={offen}
        role="combobox"
        autoComplete="off"
      />
      {/* Pflichtfeld-Pruefung des Browsers: unsichtbares, aber pruefbares Feld */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="au-suchauswahl-pflicht"
          value={value}
          required
          onChange={() => {}}
          onInvalid={(e) => {
            (e.target as HTMLInputElement).setCustomValidity("Bitte auswählen.");
            eingabe.current?.focus();
          }}
          onInput={(e) => (e.target as HTMLInputElement).setCustomValidity("")}
        />
      )}
      {offen && (
        <ul className="au-suchauswahl-liste" role="listbox">
          {eintraege.map((o, i) => (
            <li
              key={o.value || "leer"}
              role="option"
              aria-selected={o.value === value}
              className={`${i === markiert ? "markiert" : ""}${o.value === value ? " gewaehlt" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                waehle(o.value);
              }}
              onMouseEnter={() => setMarkiert(i)}
            >
              <span>{o.label}</span>
              {o.sub && <small>{o.sub}</small>}
            </li>
          ))}
          {!treffer.length && <li className="leer">Nichts gefunden</li>}
          {optionen.length > 60 && treffer.length === 60 && <li className="leer">Weitertippen grenzt ein …</li>}
        </ul>
      )}
    </div>
  );
}
