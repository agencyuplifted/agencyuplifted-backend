"use client";

import { useState } from "react";
import { setzeUrgencyPlatzhalter, URGENCY_TEXTBAUSTEINE, URGENCY_PLATZHALTER } from "@/lib/verfuegbarkeit";

// Texteingabe fuer Urgency-Texte mit Bausteinauswahl und Live-Vorschau:
// vorher stand im Formular nur ein leeres Feld mit dem Hinweis, dass
// {remaining}/{total} moeglich sind -- welche Formulierungen ueberhaupt gehen
// (mit/ohne Gesamtzahl, Zahl ausgeschrieben) und wie das Ergebnis aussieht,
// war beim Tippen nicht zu sehen.
export default function UrgencyTextFeld({
  name,
  defaultValue = "",
  label,
  freiePlaetze,
  kapazitaet,
  platzhalter,
  required,
}: {
  name: string;
  defaultValue?: string;
  label: string;
  freiePlaetze: number;
  kapazitaet: number;
  platzhalter?: string;
  required?: boolean;
}) {
  const [text, setText] = useState(defaultValue);
  const vorschau = text ? setzeUrgencyPlatzhalter(text, freiePlaetze, kapazitaet) : "";

  return (
    <div>
      <label className="au-label">{label}</label>
      <select
        className="au-select"
        value={URGENCY_TEXTBAUSTEINE.some((b) => b.wert === text) ? text : ""}
        onChange={(e) => e.target.value && setText(e.target.value)}
        style={{ marginBottom: "0.4rem" }}
        aria-label="Textbaustein wählen"
      >
        <option value="">Textbaustein wählen oder unten frei formulieren …</option>
        {URGENCY_TEXTBAUSTEINE.map((b) => (
          <option key={b.wert} value={b.wert}>{b.titel}</option>
        ))}
      </select>
      <input
        className="au-input"
        name={name}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={platzhalter}
        required={required}
      />
      <div style={{ fontSize: "0.8rem", color: "var(--color-text-faint)", margin: "-0.35rem 0 0.5rem" }}>
        {vorschau ? (
          <>
            Auf der Website: <strong style={{ color: "var(--color-text-muted)" }}>„{vorschau}“</strong>
            {" "}(bei {freiePlaetze} von {kapazitaet} freien Plätzen)
          </>
        ) : (
          "Kein Text — dann zeigt die Website an dieser Stelle keinen Platz-Hinweis."
        )}
        <details style={{ marginTop: "0.2rem" }}>
          <summary style={{ cursor: "pointer" }}>Platzhalter</summary>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem" }}>
            {URGENCY_PLATZHALTER.map((p) => (
              <li key={p.wert}><code>{p.wert}</code> — {p.erklaerung}</li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
