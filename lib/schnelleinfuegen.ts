// "Schnelleinfuegen" fuer Options-Inhalte (Termin-Detailseite, Optionen
// anlegen/bearbeiten): reine Textregeln, kein KI-Parsing. Feste Konvention:
// erste nicht-leere Zeile = Titel, danach Fliesstext bis zur ersten
// Listenzeile = Beschreibung, danach Zeilen mit "-"/"+" = je ein Feature.
// **fett**-Markierungen werden nicht angefasst (bleiben 1:1 erhalten, da sie
// vom bestehenden Minimal-Editor ohnehin so interpretiert werden).

export type GeparstesFeature = {
  label?: string;
  detail: string;
  isHighlighted: boolean;
};

export type GeparsteOption = {
  titel: string;
  beschreibung: string;
  features: GeparstesFeature[];
  introLabel?: string;
};

// "-" = normales Feature, "+" = hervorgehobenes ("neu"-markiertes) Feature.
const LISTENZEILE = /^\s*([-+])\s*(.*)$/;

// Optionale eigene Zeile "Vorspann: <Text>" (vor den Feature-Zeilen) fuer den
// "Alles aus X, plus:"-Text -- wird VOR dem eigentlichen Titel/Beschreibung/
// Feature-Parsing separat herausgeloest, damit sie nirgends versehentlich als
// Beschreibungszeile oder Feature-Zeile landet.
const VORSPANN_ZEILE = /^\s*Vorspann:\s*(.*)$/i;

// Trennt innerhalb einer Feature-Zeile einen optionalen Kurz-Label vom
// Erlaeuterungstext, z.B. "Unterkunft & Verpflegung — 3 Naechte im
// Einzelzimmer". Erkennt neben dem eigentlichen Gedankenstrich ("—") auch
// "--" oder einen einzelnen Bindestrich, jeweils mit Leerzeichen davor und
// danach (aus ChatGPT/Claude-Ausgaben wird das Zeichen nicht immer exakt als
// "—" kopiert) -- ein Bindestrich MITTEN in einem Wort (z.B. "Live-Calls")
// hat kein Leerzeichen drumherum und wird deshalb nie als Trenner erkannt.
// Es wird nur am ERSTEN Vorkommen gesplittet, damit ein weiterer Gedanken-
// strich im Erlaeuterungstext selbst nicht zu falschem Verhalten fuehrt.
const LABEL_TRENNER = /\s+(?:—|-{1,2})\s+/;

function splitteLabelUndDetail(inhalt: string): { label?: string; detail: string } {
  const treffer = LABEL_TRENNER.exec(inhalt);
  if (!treffer) return { detail: inhalt.trim() };
  const label = inhalt.slice(0, treffer.index).trim();
  const detail = inhalt.slice(treffer.index + treffer[0].length).trim();
  if (!label || !detail) return { detail: inhalt.trim() };
  return { label, detail };
}

// Liefert null, wenn der Text nicht der erwarteten Struktur entspricht
// (keine erkennbare erste Zeile als Titel, oder keine "-"/"+"-Liste gefunden)
// -- der Aufrufer zeigt in diesem Fall eine Fehlermeldung und uebernimmt
// nichts.
export function parseSchnelleinfuegenText(rohtext: string): GeparsteOption | null {
  // Vorspann-Zeile zuerst herausloesen (erstes Vorkommen zaehlt), bevor der
  // Rest wie gewohnt in Titel/Beschreibung/Features zerlegt wird.
  let introLabel: string | undefined;
  const bereinigteZeilen: string[] = [];
  for (const zeile of rohtext.split(/\r?\n/)) {
    const vorspannTreffer = introLabel === undefined ? zeile.match(VORSPANN_ZEILE) : null;
    if (vorspannTreffer) {
      introLabel = vorspannTreffer[1].trim() || undefined;
      continue;
    }
    bereinigteZeilen.push(zeile);
  }
  const zeilen = bereinigteZeilen;

  let i = 0;
  while (i < zeilen.length && zeilen[i].trim() === "") i++;
  if (i >= zeilen.length) return null;
  const titel = zeilen[i].trim();
  i++;

  const beschreibungZeilen: string[] = [];
  while (i < zeilen.length && !LISTENZEILE.test(zeilen[i])) {
    beschreibungZeilen.push(zeilen[i]);
    i++;
  }
  while (beschreibungZeilen.length && beschreibungZeilen[0].trim() === "") beschreibungZeilen.shift();
  while (beschreibungZeilen.length && beschreibungZeilen[beschreibungZeilen.length - 1].trim() === "") beschreibungZeilen.pop();
  const beschreibung = beschreibungZeilen.join("\n").trim();

  const features: GeparstesFeature[] = [];
  for (; i < zeilen.length; i++) {
    const treffer = zeilen[i].match(LISTENZEILE);
    const inhalt = treffer?.[2].trim();
    if (treffer && inhalt) {
      features.push({ ...splitteLabelUndDetail(inhalt), isHighlighted: treffer[1] === "+" });
    }
  }

  if (!titel || features.length === 0) return null;

  return { titel, beschreibung, features, introLabel };
}

// ---------------------------------------------------------------------------
// Export: exaktes Gegenstueck zu parseSchnelleinfuegenText -- erzeugt Text,
// der per Schnelleinfuegen wieder dieselben Titel/Beschreibung/Vorspann/
// Features ergibt (Round-Trip, z.B. um Options-Texte zwischen Terminen zu
// kopieren oder zu archivieren). Bewusst NUR diese Felder, genau wie der
// Parser -- Badge, Preisstaffeln, Ratenzahlung usw. sind nicht Teil des Formats.

export type ExportOption = {
  titel: string | null;
  beschreibung: string | null;
  vorspann_text: string | null;
  vorspann_anzeigen: boolean | null;
  seminartermin_options_features?: { label: string | null; text: string; hervorgehoben: boolean | null; sortierung: number | null }[] | null;
};

export function exportiereSchnelleinfuegenText(option: ExportOption): string {
  const zeilen: string[] = [];
  // Titel muss eine einzelne Zeile sein (Parser nimmt nur die erste Zeile).
  zeilen.push((option.titel || "").replace(/\s*\r?\n\s*/g, " ").trim());

  const beschreibung = (option.beschreibung || "").trim();
  if (beschreibung) zeilen.push(beschreibung);

  // Vorspann nur, wenn er auch angezeigt wird: beim Einfuegen schaltet eine
  // "Vorspann:"-Zeile den Schalter automatisch ein -- ein nur hinterlegter,
  // aber ausgeschalteter Text wuerde sonst beim Round-Trip sichtbar.
  const vorspann = (option.vorspann_text || "").replace(/\s*\r?\n\s*/g, " ").trim();
  if (vorspann && option.vorspann_anzeigen) zeilen.push(`Vorspann: ${vorspann}`);

  const features = [...(option.seminartermin_options_features || [])].sort(
    (a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0)
  );
  for (const f of features) {
    const text = (f.text || "").replace(/\s*\r?\n\s*/g, " ").trim();
    if (!text) continue;
    const label = (f.label || "").replace(/\s*\r?\n\s*/g, " ").trim();
    zeilen.push(`${f.hervorgehoben ? "+" : "-"} ${label ? `${label} — ${text}` : text}`);
  }

  return zeilen.join("\n");
}

// Mehrere Optionen: Bloecke durch eine Leerzeile getrennt. Schnelleinfuegen
// uebernimmt immer genau EINE Option -- zum Wiedereinfuegen jeweils einen
// Block (Titel bis letzte Feature-Zeile) kopieren.
export function exportiereAlleSchnelleinfuegenText(optionen: ExportOption[]): string {
  return optionen.map(exportiereSchnelleinfuegenText).join("\n\n");
}

// Das Format kennt kein Escaping. Einige Inhalte lassen sich darin deshalb
// nicht verlustfrei ausdruecken (z.B. eine Beschreibungszeile, die mit "-"
// beginnt, wird beim Einfuegen zum Feature; ein Feature ohne Label mit " - "
// im Text wird in Label/Detail aufgeteilt). Statt das raten zu wollen, wird
// der Export einmal durch den echten Parser geschickt und mit dem Original
// verglichen -- Rueckgabe sind lesbare Hinweise auf die Abweichungen (leer =
// Round-Trip exakt).
export function pruefeSchnelleinfuegenRoundTrip(option: ExportOption): string[] {
  const hinweise: string[] = [];
  const geparst = parseSchnelleinfuegenText(exportiereSchnelleinfuegenText(option));
  const features = [...(option.seminartermin_options_features || [])]
    .sort((a, b) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
    .filter((f) => (f.text || "").trim());

  if (!geparst) {
    return [
      features.length
        ? "Der Export lässt sich nicht wieder einfügen (Titel fehlt)."
        : "Option hat keine Features – Schnelleinfügen braucht mindestens eine Feature-Zeile.",
    ];
  }

  if (geparst.titel !== (option.titel || "").trim()) hinweise.push("Titel wird beim Einfügen verändert (z. B. Zeilenumbruch im Titel).");
  if (geparst.beschreibung !== (option.beschreibung || "").trim()) {
    hinweise.push("Beschreibung wird beim Einfügen verändert – eine Zeile beginnt mit „-“/„+“ oder „Vorspann:“.");
  }
  const vorspannErwartet = option.vorspann_anzeigen ? (option.vorspann_text || "").trim() || undefined : undefined;
  if (geparst.introLabel !== vorspannErwartet) hinweise.push("Vorspann wird beim Einfügen verändert.");

  if (geparst.features.length !== features.length) {
    hinweise.push(`Beim Einfügen entstehen ${geparst.features.length} statt ${features.length} Features.`);
  } else {
    features.forEach((f, i) => {
      const g = geparst.features[i];
      const labelGleich = (g.label || "") === (f.label || "").trim();
      if (!labelGleich || g.detail !== f.text.trim() || g.isHighlighted !== !!f.hervorgehoben) {
        hinweise.push(`Feature ${i + 1} („${f.text.trim().slice(0, 40)}${f.text.trim().length > 40 ? "…" : ""}“) wird beim Einfügen anders aufgeteilt.`);
      }
    });
  }
  return hinweise;
}
