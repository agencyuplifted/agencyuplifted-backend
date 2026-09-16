"use client";

import { useState, type ReactNode } from "react";
import MarkdownExportBox from "./MarkdownExportBox";

// Import aus anderem Termin und Export aller Optionen als Schnelleinfuegen-
// Text teilen sich eine Karte (Tabs), damit beide als zusammengehoeriges Paar
// an derselben Stelle stehen. Der Import-Inhalt bleibt serverseitig gerendert
// (GET-Formular mit ?importVon=) und kommt als children herein.
export default function OptionenImportExportTabs({
  children,
  exportText,
  exportHinweise,
  anzahlOptionen,
  anzahlDeaktiviert,
}: {
  children: ReactNode;
  exportText: string;
  exportHinweise: { titel: string; texte: string[] }[];
  anzahlOptionen: number;
  anzahlDeaktiviert: number;
}) {
  const [tab, setTab] = useState<"import" | "export">("import");

  return (
    <div className="au-card">
      <div className="au-tabs" style={{ marginBottom: "0.75rem" }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "import"}
          className={`au-tab ${tab === "import" ? "au-tab-active" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={() => setTab("import")}
        >
          Optionen aus anderem Termin importieren
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "export"}
          className={`au-tab ${tab === "export" ? "au-tab-active" : ""}`}
          style={{ cursor: "pointer" }}
          onClick={() => setTab("export")}
        >
          Alle Optionen als Markdown exportieren
        </button>
      </div>

      {tab === "import" ? (
        children
      ) : anzahlOptionen === 0 ? (
        <p style={{ color: "var(--color-text-faint)", fontSize: "0.9rem", margin: 0 }}>Noch keine Optionen angelegt – es gibt nichts zu exportieren.</p>
      ) : (
        <>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: "0 0 0.75rem" }}>
            Titel, Beschreibung, Vorspann und Features aller {anzahlOptionen} Option(en)
            {anzahlDeaktiviert ? ` (inkl. ${anzahlDeaktiviert} deaktivierter)` : ""} im Schnelleinfügen-Format – je Option ein Block, getrennt
            durch eine Leerzeile. Schnelleinfügen übernimmt immer eine Option: zum Wiedereinfügen jeweils einen Block kopieren. Badge,
            Preisstaffeln, Ratenzahlung usw. sind nicht enthalten.
          </p>
          <MarkdownExportBox text={exportText} hinweise={exportHinweise} />
        </>
      )}
    </div>
  );
}
