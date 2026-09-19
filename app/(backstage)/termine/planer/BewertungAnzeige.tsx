import type { Bewertung, Grund } from "@/lib/terminplaner";

// Score + alle Gruende sichtbar (keine Black Box). Server- und Client-tauglich.
export function scoreKlasse(score: number) {
  return score >= 80 ? "gut" : score >= 55 ? "mittel" : "schlecht";
}

export default function BewertungAnzeige({ b, kompakt = false }: { b: Pick<Bewertung, "score" | "gruende"> & { gesperrt?: string | null }; kompakt?: boolean }) {
  const gruende = [...(b.gruende as Grund[])].sort((x, y) => x.punkte - y.punkte);
  return (
    <div className={`au-tp-bewertung${kompakt ? " kompakt" : ""}`}>
      <span className={`au-tp-score ${scoreKlasse(b.score)}`} title="Score: 100 = keine bekannten Konflikte, darüber = Boni, darunter = Abzüge">{b.score}</span>
      {gruende.length === 0 ? (
        <span className="au-klein">Keine Konflikte gefunden.</span>
      ) : (
        <ul className="au-tp-gruende">
          {gruende.map((g, i) => (
            <li key={i} className={g.punkte > 0 ? "plus" : g.punkte <= -40 ? "hart" : undefined}>
              {g.punkte !== 0 && <span className="au-tp-punkte">{g.punkte > 0 ? `+${g.punkte}` : g.punkte}</span>}
              {g.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
