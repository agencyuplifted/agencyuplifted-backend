"use client";

import { useRef, useState } from "react";

// Bild-Eingabefeld fuer Referenzen/Testimonials: Bild per Cmd+V/Strg+V direkt
// einfuegen (z.B. Screenshot aus der Zwischenablage) ODER klassisch per Klick
// eine Datei auswaehlen. Das eigentliche <input type="file"> bleibt versteckt
// im Hintergrund und wird ganz normal mit dem umgebenden <form action={...}>
// (Server Action) mit abgeschickt - kein eigener Upload-Request noetig.
export default function PasteImageField({ name, label }: { name: string; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [vorschauUrl, setVorschauUrl] = useState<string | null>(null);
  const [dateiname, setDateiname] = useState<string | null>(null);

  function setzeDatei(datei: File) {
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(datei);
      inputRef.current.files = dt.files;
    }
    setVorschauUrl(URL.createObjectURL(datei));
    setDateiname(datei.name);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const datei = item.getAsFile();
        if (datei) {
          e.preventDefault();
          setzeDatei(datei);
        }
        break;
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0];
    if (datei) setzeDatei(datei);
  }

  function entfernen(e: React.MouseEvent) {
    e.stopPropagation();
    if (inputRef.current) inputRef.current.value = "";
    setVorschauUrl(null);
    setDateiname(null);
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label className="au-label">{label}</label>
      <div
        tabIndex={0}
        onPaste={handlePaste}
        onClick={() => inputRef.current?.click()}
        style={{
          border: "1px dashed var(--color-border)",
          borderRadius: "8px",
          padding: vorschauUrl ? "0.6rem" : "1.1rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          background: "var(--color-surface-muted, #f7f7f8)",
        }}
      >
        {vorschauUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={vorschauUrl} alt={dateiname || "Vorschau"} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: "6px" }} />
            <span style={{ fontSize: "0.85rem", flex: 1 }}>{dateiname}</span>
            <button type="button" onClick={entfernen} className="au-btn au-btn-secondary au-btn-sm">Entfernen</button>
          </>
        ) : (
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-faint)" }}>
            Bild einfügen (⌘V / Strg+V) oder klicken zum Hochladen
          </span>
        )}
      </div>
      <input ref={inputRef} type="file" name={name} accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
    </div>
  );
}
