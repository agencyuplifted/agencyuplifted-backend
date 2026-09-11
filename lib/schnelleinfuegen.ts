// "Schnelleinfuegen" fuer Options-Inhalte (Termin-Detailseite, Optionen
// anlegen/bearbeiten): reine Textregeln, kein KI-Parsing. Feste Konvention:
// erste nicht-leere Zeile = Titel, danach Fliesstext bis zur ersten
// Listenzeile = Beschreibung, danach Zeilen mit "-" = je ein Feature.
// **fett**-Markierungen werden nicht angefasst (bleiben 1:1 erhalten, da sie
// vom bestehenden Minimal-Editor ohnehin so interpretiert werden).

export type GeparsteOption = {
  titel: string;
  beschreibung: string;
  features: string[];
};

const LISTENZEILE = /^\s*-\s*(.*)$/;

// Liefert null, wenn der Text nicht der erwarteten Struktur entspricht
// (keine erkennbare erste Zeile als Titel, oder keine "-"-Liste gefunden) --
// der Aufrufer zeigt in diesem Fall eine Fehlermeldung und uebernimmt nichts.
export function parseSchnelleinfuegenText(rohtext: string): GeparsteOption | null {
  const zeilen = rohtext.split(/\r?\n/);

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

  const features: string[] = [];
  for (; i < zeilen.length; i++) {
    const treffer = zeilen[i].match(LISTENZEILE);
    if (treffer && treffer[1].trim()) features.push(treffer[1].trim());
  }

  if (!titel || features.length === 0) return null;

  return { titel, beschreibung, features };
}
