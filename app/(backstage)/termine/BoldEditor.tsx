"use client";

import { useLayoutEffect, useRef } from "react";

const btnStyle: React.CSSProperties = {
  fontWeight: 700,
  border: "1px solid var(--color-border-strong)",
  background: "#fff",
  borderRadius: "var(--radius-sm)",
  padding: "0.15rem 0.6rem",
  cursor: "pointer",
  marginRight: "0.5rem",
  color: "var(--color-accent)",
};
const akzentBtnStyle: React.CSSProperties = { ...btnStyle, color: "var(--color-akzent-rot)" };
const hintStyle: React.CSSProperties = { fontSize: "0.75rem", color: "var(--color-text-faint)" };
const wrapStyle: React.CSSProperties = { marginBottom: "0.9rem" };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "center", marginBottom: "0.35rem" };

// Umschliesst (oder entfernt, falls schon vorhanden -- Toggle bei erneutem
// Klick) die aktuelle Textmarkierung mit dem gegebenen Markup-Zeichen.
// marker "**" = fett, "==" = Akzent (Marken-Rot + fett, siehe lib/richtext.tsx).
function toggleMarkup(el: HTMLTextAreaElement | HTMLInputElement, marker: string) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return;
  const value = el.value;
  const selected = value.slice(start, end);
  const laenge = marker.length;
  const bereitsMarkiert = selected.startsWith(marker) && selected.endsWith(marker) && selected.length > laenge * 2;
  const neu = bereitsMarkiert ? selected.slice(laenge, -laenge) : `${marker}${selected}${marker}`;
  el.value = value.slice(0, start) + neu + value.slice(end);
  el.focus();
  const neuesEnde = start + neu.length;
  el.setSelectionRange(bereitsMarkiert ? start : start + laenge, bereitsMarkiert ? neuesEnde : neuesEnde - laenge);
}

export function FettTextarea({
  name,
  defaultValue,
  placeholder,
  rows = 4,
  required,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div style={wrapStyle}>
      <div style={toolbarStyle}>
        <button type="button" style={btnStyle} onClick={() => ref.current && toggleMarkup(ref.current, "**")}>
          B
        </button>
        <button type="button" style={akzentBtnStyle} onClick={() => ref.current && toggleMarkup(ref.current, "==")}>
          Akzent
        </button>
        <span style={hintStyle}>Text markieren, dann „B“ für fett oder „Akzent“ für Marken-Rot</span>
      </div>
      <textarea
        ref={ref}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className="au-textarea"
      />
    </div>
  );
}

// Einzeiliges Feature (z.B. "Einzelcoaching inklusive") kann in der Praxis
// laengere Texte enthalten -- deshalb ein Textfeld statt <input>, das mit dem
// Inhalt automatisch mitwaechst (kein festes rows, Hoehe wird per scrollHeight
// nachgezogen), statt ein einzeiliges Feld mit abgeschnittenem Text zu zeigen.
export function FettInput({
  name,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const passeHoeheAn = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    passeHoeheAn();
  }, []);

  const alsToggle = (marker: string) => () => {
    if (!ref.current) return;
    toggleMarkup(ref.current, marker);
    passeHoeheAn();
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", flex: 1 }}>
      <div style={{ display: "flex", gap: "0.35rem", flexShrink: 0 }}>
        <button type="button" style={{ ...btnStyle, marginRight: 0 }} onClick={alsToggle("**")}>
          B
        </button>
        <button type="button" style={{ ...akzentBtnStyle, marginRight: 0 }} onClick={alsToggle("==")}>
          Akzent
        </button>
      </div>
      <textarea
        ref={ref}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="au-input"
        rows={1}
        style={{ resize: "none", overflow: "hidden", flex: 1 }}
        onInput={passeHoeheAn}
      />
    </div>
  );
}
