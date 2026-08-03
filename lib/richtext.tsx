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
