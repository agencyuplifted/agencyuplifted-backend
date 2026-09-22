export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { PROGRAMME, istProgramm, ladeProgrammKalender } from "@/lib/programme";
import Jahresplaner, { MONATSKURZ } from "../../termine/Jahresplaner";

export async function generateMetadata({ params }: { params: Promise<{ programm: string }> }) {
  const { programm } = await params;
  return { title: istProgramm(programm) ? PROGRAMME[programm].titel : "Programm" };
}

// Programm-Seite (Foundation, Uplift, Advance). Vorerst nur der Kalender mit
// den Terminen, die zum Programm gehoeren -- weitere Inhalte folgen.
export default async function ProgrammSeite({ params }: { params: Promise<{ programm: string }> }) {
  const { programm } = await params;
  if (!istProgramm(programm)) notFound();
  const info = PROGRAMME[programm];

  if (programm === "advance") {
    return (
      <main>
        <h1>{info.titel}</h1>
        <div className="au-card au-programm-platzhalter">
          <strong>Hier entsteht das Programm „Advance“.</strong>
          <p className="au-klein" style={{ margin: "0.35rem 0 0" }}>
            Noch keine Inhalte. Sobald es Formate oder Seminarkategorien für Advance gibt, erscheinen deren Termine hier automatisch im Kalender.
          </p>
        </div>
      </main>
    );
  }

  const { eintraege, monate, zaehler, heuteISO } = await ladeProgrammKalender(programm);

  // Legende aus den tatsaechlich vorkommenden Kategorien/Formaten
  const legende = new Map<string, { farbe: string; art: "seminar" | "fest" }>();
  for (const t of eintraege as any[]) {
    if (t.fest || t.vorgeplant) {
      const name = t.seminartypen?.name || t.termin_formate?.name;
      const farbe = t.seminartypen?.farbe || t.termin_formate?.farbe;
      if (name && !legende.has(name)) legende.set(name, { farbe: farbe || "var(--color-accent)", art: t.seminartypen?.name ? "seminar" : "fest" });
    } else if (t.seminartypen?.name && !legende.has(t.seminartypen.name)) {
      legende.set(t.seminartypen.name, { farbe: t.seminartypen.farbe || "var(--color-accent)", art: "seminar" });
    }
  }
  const zeitraum = `${MONATSKURZ[monate[0].monatIndex]} ${monate[0].jahr} – ${MONATSKURZ[monate[monate.length - 1].monatIndex]} ${monate[monate.length - 1].jahr}`;

  return (
    <main>
      <h1>{info.titel}</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        {info.beschreibung}{" "}
        <span className="au-klein">
          {zaehler.seminare > 0 && `${zaehler.seminare} Seminar${zaehler.seminare === 1 ? "" : "e"} · `}
          {zaehler.fest} fest eingeplant · {zaehler.vorgeplant} vorgeplant
        </span>
      </p>

      <section className="au-panel au-panel-breit">
        <div className="au-panel-kopf">
          <h2>Kalender · {zeitraum}</h2>
          <span className="au-planer-legende">
            {[...legende.entries()].map(([name, l]) => (
              <span key={name}>
                <i className={l.art === "fest" ? "au-planer-fest-leg" : undefined} style={{ background: l.farbe }} />
                {name}
              </span>
            ))}
            {eintraege.some((t: any) => t.vorgeplant) && (
              <span><i className="au-planer-vorgeplant-leg" />? = vorgeplant</span>
            )}
          </span>
        </div>
        <div className="au-panel-inhalt" style={{ overflowX: "auto" }}>
          {eintraege.length ? (
            <Jahresplaner monate={monate} termine={eintraege} heuteISO={heuteISO} />
          ) : (
            <p className="au-leer" style={{ margin: 0 }}>Noch keine Termine für {info.titel}.</p>
          )}
        </div>
        <p className="au-klein" style={{ padding: "0 1.15rem 1rem", margin: 0 }}>
          Befüllt sich automatisch: Seminare über die Zuordnung der{" "}
          <Link href="/seminartypen" prefetch={false}>Seminarkategorien</Link>, Online- und Präsenz-Termine über die Formate im{" "}
          <Link href="/termine/planer#formate" prefetch={false}>Terminplaner</Link>. Geändert wird nur im Planer – ein Klick auf einen
          Online-/Präsenz-Termin öffnet ihn dort direkt (Datum ändern oder im Kalender ziehen).
        </p>
      </section>
    </main>
  );
}
