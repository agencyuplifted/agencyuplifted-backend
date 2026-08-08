"use client";

import { useRef } from "react";

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
const hintStyle: React.CSSProperties = { fontSize: "0.75rem", color: "var(--color-text-faint)" };
const wrapStyle: React.CSSProperties = { marginBottom: "0.9rem" };
const toolbarStyle: React.CSSProperties = { display: "flex", alignItems: "center", marginBottom: "0.35rem" };

function toggleFett(el: HTMLTextAreaElement | HTMLInputElement) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return;
  const value = el.value;
  const selected = value.slice(start, end);
  const bereitsFett = selected.startsWith("**") && selected.endsWith("**") && selected.length > 4;
  const neu = bereitsFett ? selected.slice(2, -2) : `**${selected}**`;
  el.value = value.slice(0, start) + neu + value.slice(end);
  el.focus();
  const neuesEnde = start + neu.length;
  el.setSelectionRange(bereitsFett ? start : start + 2, bereitsFett ? neuesEnde : neuesEnde - 2);
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
        <button type="button" style={btnStyle} onClick={() => ref.current && toggleFett(ref.current)}>
          B
        </button>
        <span style={hintStyle}>Text markieren, dann „B“ für fett</span>
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
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1 }}>
      <button type="button" style={{ ...btnStyle, marginRight: 0 }} onClick={() => ref.current && toggleFett(ref.current)}>
        B
      </button>
      <input
        ref={ref}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="au-input"
      />
    </div>
  );
}
