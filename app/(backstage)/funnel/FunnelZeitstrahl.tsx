import Link from "next/link";

export type ZeitstrahlMail = {
  id: string;
  name: string;
  trigger_typ: string;
  versatz_tage: number;
  aktiv: boolean;
  system: boolean;
  /** z. B. "nur Preisfindung" bei Anschluss-Mails */
  hinweis?: string | null;
};

// Linke Spalte der Funnel-Seite: seminarbezogene Mails auf einer echten
// Tagesskala (vor Start → Start → Ende → nach Ende). Buchungs-, Lead- und
// Wartelisten-Mails haengen am Zeitpunkt der jeweiligen Person, nicht am
// Seminar -- sie stehen deshalb bewusst getrennt oben und NICHT auf der Skala,
// sonst saehe "3 Tage nach Buchung" wie "3 Tage nach Seminarende" aus.

const PERSONEN_TRIGGER: Record<string, string> = {
  buchung_erstellt: "nach Buchung",
  lead_erstellt: "nach Lead-Eingang",
  warteliste_eingetragen: "nach Warteliste",
};

const LABEL_HOEHE = 38; // Mindestabstand zweier Labels in px
const KOPF = 14; // Luft oben/unten auf der Achse

function tageText(n: number) {
  return n === 1 ? "1 Tag" : `${n} Tage`;
}

export default function FunnelZeitstrahl({
  mails,
  auswahlId,
  hrefFuer,
  dauerTage,
  heuteOffset,
}: {
  mails: ZeitstrahlMail[];
  auswahlId: string | null;
  hrefFuer: (id: string) => string;
  /** Tage von Start bis Ende (0 = eintaegig) */
  dauerTage: number;
  /** Tage seit Start des Beispieltermins (negativ = davor), null = kein Beispieltermin */
  heuteOffset: number | null;
}) {
  const personen = mails.filter((m) => PERSONEN_TRIGGER[m.trigger_typ]);
  const vor = mails.filter((m) => m.trigger_typ === "vor_seminarstart");
  const nach = mails.filter((m) => m.trigger_typ === "nach_seminarende");

  // Position jeder Markierung in "Tagen relativ zum Seminarstart"
  type Punkt = { tag: number; art: "mail" | "start" | "ende"; mail?: ZeitstrahlMail };
  const punkte: Punkt[] = [
    ...vor.map((m) => ({ tag: -m.versatz_tage, art: "mail" as const, mail: m })),
    { tag: 0, art: "start" as const },
    { tag: dauerTage, art: "ende" as const },
    ...nach.map((m) => ({ tag: dauerTage + m.versatz_tage, art: "mail" as const, mail: m })),
  ].sort((a, b) => a.tag - b.tag || (a.art === "mail" ? 1 : -1));

  const minTag = Math.min(0, ...punkte.map((p) => p.tag));
  const maxTag = Math.max(dauerTage, ...punkte.map((p) => p.tag));
  const spanne = Math.max(maxTag - minTag, 1);
  // Proportional, aber nicht endlos hoch bei langen Abstaenden
  const proTag = Math.max(4, Math.min(26, 460 / spanne));
  const yVon = (tag: number) => KOPF + (tag - minTag) * proTag;

  // Labels duerfen sich nicht ueberlappen: Punkt bleibt an der echten Stelle,
  // das Label rutscht bei Bedarf nach unten (Verbindungslinie zeigt die Zuordnung).
  let naechsteFrei = 0;
  const gelegt = punkte.map((p) => {
    const y = yVon(p.tag);
    const labelY = Math.max(y - LABEL_HOEHE / 2 + 6, naechsteFrei);
    naechsteFrei = labelY + (p.art === "mail" ? LABEL_HOEHE : 26);
    return { ...p, y, labelY };
  });
  const hoehe = Math.max(yVon(maxTag) + KOPF, naechsteFrei + 4);

  const heuteY =
    heuteOffset === null ? null : heuteOffset < minTag ? "davor" : heuteOffset > maxTag ? "danach" : yVon(heuteOffset);

  return (
    <nav className="au-zs" aria-label="Funnel-Mails im Zeitverlauf">
      <div className="au-zs-gruppe">
        <div className="au-zs-titel">Pro Person</div>
        <p className="au-zs-hinweis">Zeitpunkt variiert pro Person</p>
        {personen.length === 0 && <p className="au-zs-hinweis">– keine –</p>}
        {personen.map((m) => (
          <MailLabel key={m.id} mail={m} aktiv={m.id === auswahlId} href={hrefFuer(m.id)} zeit={`${tageText(m.versatz_tage)} ${PERSONEN_TRIGGER[m.trigger_typ]}`} />
        ))}
      </div>

      <div className="au-zs-verbinder" aria-hidden="true" />

      <div className="au-zs-titel">Rund ums Seminar</div>
      {heuteY === "davor" && <p className="au-zs-heute-text">heute: noch {tageText(-heuteOffset!)} bis Start ↓</p>}
      <div className="au-zs-achse" style={{ height: hoehe }}>
        <svg className="au-zs-linien" width="100%" height={hoehe} aria-hidden="true">
          {gelegt.map((p, i) =>
            p.art === "mail" ? (
              <polyline key={i} points={`9,${p.y} 16,${p.y} 22,${p.labelY + 10} 28,${p.labelY + 10}`} fill="none" />
            ) : null
          )}
        </svg>
        {typeof heuteY === "number" && (
          <div className="au-zs-heute" style={{ top: heuteY }}>
            <span>heute</span>
          </div>
        )}
        {gelegt.map((p, i) =>
          p.art === "mail" ? (
            <div key={p.mail!.id}>
              <span className={`au-zs-punkt${p.mail!.aktiv ? " an" : ""}`} style={{ top: p.y }} />
              <div className="au-zs-label" style={{ top: p.labelY }}>
                <MailLabel
                  mail={p.mail!}
                  aktiv={p.mail!.id === auswahlId}
                  href={hrefFuer(p.mail!.id)}
                  zeit={p.mail!.trigger_typ === "vor_seminarstart" ? `${tageText(p.mail!.versatz_tage)} vor Start` : `${tageText(p.mail!.versatz_tage)} nach Ende`}
                />
              </div>
            </div>
          ) : (
            <div key={`m${i}`}>
              <span className="au-zs-marke" style={{ top: p.y }} />
              <div className="au-zs-label au-zs-meilenstein" style={{ top: p.labelY }}>
                {p.art === "start" ? "Seminarstart" : dauerTage === 0 ? "Seminarende (gleicher Tag)" : `Seminarende · +${tageText(dauerTage)}`}
              </div>
            </div>
          )
        )}
      </div>
      {heuteY === "danach" && <p className="au-zs-heute-text">heute: {tageText(heuteOffset! - dauerTage)} nach Ende ↑</p>}
    </nav>
  );
}

function MailLabel({ mail, aktiv, href, zeit }: { mail: ZeitstrahlMail; aktiv: boolean; href: string; zeit: string }) {
  return (
    <Link href={href} scroll={false} data-funnel-link className={`au-zs-mail${aktiv ? " gewaehlt" : ""}${mail.aktiv ? "" : " aus"}`} aria-current={aktiv ? "true" : undefined}>
      <span className="au-zs-mail-name">{mail.name}</span>
      <span className="au-zs-mail-zeit">
        {zeit}
        {mail.hinweis ? ` · ${mail.hinweis}` : ""}
        {mail.system ? " · System" : mail.aktiv ? "" : " · inaktiv"}
      </span>
    </Link>
  );
}
