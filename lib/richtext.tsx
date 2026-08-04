import React from "react";

// Sehr einfaches Markup: **text** wird fett dargestellt. Kein volles Markdown,
// bewusst minimal gehalten für Options-Beschreibungen und Features.
export function renderFett(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  const teile = text.split(/(\*\*[^*]+\*\*)/g);
  return teile.map((teil, i) => {
    if (teil.startsWith("**") && teil.endsWith("**") && teil.length > 4) {
      return <strong key={i}>{teil.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{teil}</React.Fragment>;
  });
}

// Erkennt http(s)-Links in einem Freitext und macht sie klickbar. Zeilenumbrueche
// werden als <br/> dargestellt. Bewusst ohne dangerouslySetInnerHTML (reines
// React-Rendering), damit kein HTML aus Nutzereingaben eingeschleust werden kann.
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function renderTextMitLinks(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  return text.split("\n").map((zeile, zeilenIndex) => {
    const teile = zeile.split(URL_REGEX);
    return (
      <React.Fragment key={zeilenIndex}>
        {zeilenIndex > 0 && <br />}
        {teile.map((teil, i) =>
          i % 2 === 1 ? (
            <a key={i} href={teil} target="_blank" rel="noopener noreferrer">
              {teil}
            </a>
          ) : (
            <React.Fragment key={i}>{teil}</React.Fragment>
          )
        )}
      </React.Fragment>
    );
  });
}
