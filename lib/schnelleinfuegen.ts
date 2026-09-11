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
