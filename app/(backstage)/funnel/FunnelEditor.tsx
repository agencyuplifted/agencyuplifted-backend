"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { baueMailHtml, schalterAus, BEISPIEL_WERTE, type MailBausteine } from "@/lib/mail-html";

type Platzhalter = { key: string; beschreibung: string; verfuegbarBei: string[] };

// Rechte Spalte der Funnel-Seite: Editor der ausgewaehlten Mail. Platzhalter
// als Pills, die an der Cursorposition des zuletzt benutzten Feldes (Betreff
// oder Inhalt) eingefuegt werden -- vorher mussten sie aus einer Tabelle
// abgetippt werden, und Tippfehler wie {{vornamen}} blieben unbemerkt leer.
export default function FunnelEditor({
  mail,
  trigger,
  platzhalter,
  speichernAction,
  bausteine,
  istSystem = false,
}: {
  mail: {
    id?: string;
    name: string;
    trigger_typ: string;
    versatz_tage: number;
    betreff: string;
    inhalt: string;
    baustein_signatur?: boolean;
    baustein_rechtliches?: boolean;
    baustein_abmelden?: boolean;
  } | null;
  bausteine: MailBausteine;
  istSystem?: boolean;
  trigger: { key: string; label: string }[];
  platzhalter: Platzhalter[];
  speichernAction: (fd: FormData) => Promise<void>;
}) {
  const [name, setName] = useState(mail?.name || "");
  const [triggerTyp, setTriggerTyp] = useState(mail?.trigger_typ || "vor_seminarstart");
  const [versatz, setVersatz] = useState(String(mail?.versatz_tage ?? 3));
  const [betreff, setBetreff] = useState(mail?.betreff || "");
  const [inhalt, setInhalt] = useState(mail?.inhalt || "");
  const betreffRef = useRef<HTMLInputElement>(null);
  const inhaltRef = useRef<HTMLTextAreaElement>(null);
  const zuletzt = useRef<"betreff" | "inhalt">("inhalt");
  const speichertRef = useRef(false);
  const start = schalterAus(mail || {});
  const [mitSignatur, setMitSignatur] = useState(start.signatur);
  const [mitRechtlichem, setMitRechtlichem] = useState(start.rechtliches);
  // Transaktionale System-Mails (Reservierung/Zahlung) bekommen nie einen Abmeldelink
  const [mitAbmelden, setMitAbmelden] = useState(istSystem ? false : start.abmelden);
  const [vorschau, setVorschau] = useState(false);

  const geaendert =
    name !== (mail?.name || "") ||
    triggerTyp !== (mail?.trigger_typ || "vor_seminarstart") ||
    versatz !== String(mail?.versatz_tage ?? 3) ||
    betreff !== (mail?.betreff || "") ||
    inhalt !== (mail?.inhalt || "") ||
    mitSignatur !== start.signatur ||
    mitRechtlichem !== start.rechtliches ||
    (!istSystem && mitAbmelden !== start.abmelden);

  // Ungespeicherte Aenderungen nicht still verwerfen, wenn links eine andere
  // Mail angeklickt oder die Seite verlassen wird.
  useEffect(() => {
    if (!geaendert) return;
    const beiKlick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest?.("a[data-funnel-link]");
      if (link && !speichertRef.current && !window.confirm("Ungespeicherte Änderungen verwerfen?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const beiVerlassen = (e: BeforeUnloadEvent) => {
      if (!speichertRef.current) e.preventDefault();
    };
    document.addEventListener("click", beiKlick, true);
    window.addEventListener("beforeunload", beiVerlassen);
    return () => {
      document.removeEventListener("click", beiKlick, true);
      window.removeEventListener("beforeunload", beiVerlassen);
    };
  }, [geaendert]);

  function einfuegen(key: string) {
    const feld = zuletzt.current === "betreff" ? betreffRef.current : inhaltRef.current;
    const wert = zuletzt.current === "betreff" ? betreff : inhalt;
    const setze = zuletzt.current === "betreff" ? setBetreff : setInhalt;
    const start = feld?.selectionStart ?? wert.length;
    const ende = feld?.selectionEnd ?? wert.length;
    setze(wert.slice(0, start) + key + wert.slice(ende));
    requestAnimationFrame(() => {
      feld?.focus();
      feld?.setSelectionRange(start + key.length, start + key.length);
    });
  }

  const verfuegbar = platzhalter.filter((p) => p.verfuegbarBei.includes(triggerTyp));
  const nichtVerfuegbar = platzhalter.filter((p) => !p.verfuegbarBei.includes(triggerTyp));
  // Platzhalter im Text, die es fuer diesen Ausloeser nicht gibt -> bleiben im Versand leer
  const benutzt = Array.from(new Set((betreff + " " + inhalt).match(/\{\{[a-z_]+\}\}/g) || []));
  const problematisch = benutzt.filter((b) => !verfuegbar.some((p) => p.key === b));

  const zeitpunkt = trigger.find((t) => t.key === triggerTyp)?.label.replace("X", versatz || "X");

  return (
    <form
      action={speichernAction}
      onSubmit={() => {
        speichertRef.current = true;
      }}
      className="au-fe"
    >
      {mail?.id && <input type="hidden" name="id" value={mail.id} />}

      <label className="au-label" htmlFor="fe-name">Name (intern)</label>
      <input id="fe-name" className="au-input" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Erinnerung 3 Tage vor Seminarstart" />

      <div className="au-fe-zeile">
        <div>
          <label className="au-label" htmlFor="fe-trigger">Auslöser</label>
          <select id="fe-trigger" className="au-select" name="trigger_typ" required value={triggerTyp} onChange={(e) => setTriggerTyp(e.target.value)}>
            {trigger.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="au-label" htmlFor="fe-versatz">Tage (X)</label>
          <input id="fe-versatz" className="au-input" name="versatz_tage" type="number" min={0} max={365} required value={versatz} onChange={(e) => setVersatz(e.target.value)} />
        </div>
      </div>
      <p className="au-klein" style={{ marginTop: "-0.5rem" }}>Geht raus: {zeitpunkt}</p>

      <label className="au-label" htmlFor="fe-betreff">Betreff</label>
      <input
        id="fe-betreff"
        ref={betreffRef}
        className="au-input"
        name="betreff"
        required
        value={betreff}
        onChange={(e) => setBetreff(e.target.value)}
        onFocus={() => (zuletzt.current = "betreff")}
        placeholder="z. B. Bald geht's los, {{vorname}}!"
      />

      <div className="au-fe-pills-kopf">
        <span className="au-label" style={{ margin: 0 }}>Platzhalter einfügen</span>
        <span className="au-klein">Klick fügt ihn an der Cursor-Position ein (Betreff oder Inhalt)</span>
      </div>
      <div className="au-chips au-fe-pills">
        {verfuegbar.map((p) => (
          <button
            key={p.key}
            type="button"
            className="au-chip"
            title={p.beschreibung}
            // mousedown statt click: sonst verliert das Textfeld vorher den Fokus/Cursor
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => einfuegen(p.key)}
          >
            {p.key.replace(/[{}]/g, "")}
          </button>
        ))}
      </div>
      {nichtVerfuegbarZeile(nichtVerfuegbar)}

      <label className="au-label" htmlFor="fe-inhalt">Inhalt</label>
      <textarea
        id="fe-inhalt"
        ref={inhaltRef}
        className="au-textarea au-fe-inhalt"
        name="inhalt"
        required
        value={inhalt}
        onChange={(e) => setInhalt(e.target.value)}
        onFocus={() => (zuletzt.current = "inhalt")}
        placeholder={"Hallo {{vorname}},\n\nnur noch wenige Tage bis {{seminartitel}} am {{datum_start}}.\n\nViele Grüße"}
      />
      <div className="au-fe-bausteine">
        <span className="au-label" style={{ margin: 0 }}>Automatisch anhängen</span>
        <label><input type="checkbox" name="baustein_signatur" checked={mitSignatur} onChange={(e) => setMitSignatur(e.target.checked)} /> Signatur</label>
        <label><input type="checkbox" name="baustein_rechtliches" checked={mitRechtlichem} onChange={(e) => setMitRechtlichem(e.target.checked)} /> Impressum &amp; Datenschutz</label>
        <label title={istSystem ? "Transaktionale Mail – bekommt nie einen Abmeldelink" : undefined}>
          <input type="checkbox" name="baustein_abmelden" checked={mitAbmelden} disabled={istSystem} onChange={(e) => setMitAbmelden(e.target.checked)} /> Abmeldelink
        </label>
        <Link href="/funnel?mail=bausteine" data-funnel-link className="au-klein">Bausteine bearbeiten</Link>
      </div>
      {!istSystem && !mitAbmelden && (
        <p className="au-fe-warnung">Ohne Abmeldelink nur für reine Service-Mails zum gebuchten Seminar (z. B. Anreise-Infos) – nicht für Werbung oder Follow-ups.</p>
      )}

      {problematisch.length > 0 && (
        <p className="au-fe-warnung">
          {problematisch.join(", ")}: gibt es bei diesem Auslöser nicht – bleibt im Versand leer.
        </p>
      )}

      <button type="button" className="au-link" style={{ marginTop: "0.75rem" }} onClick={() => setVorschau((v) => !v)}>
        {vorschau ? "Vorschau ausblenden" : "Vorschau mit Beispieldaten anzeigen"}
      </button>
      {vorschau && (
        <div className="au-fe-vorschau">
          <div className="au-fe-vorschau-betreff">{ersetze(betreff) || "(kein Betreff)"}</div>
          <div
            className="au-fe-vorschau-inhalt"
            dangerouslySetInnerHTML={{
              __html: baueMailHtml(ersetze(inhalt), bausteine, { signatur: mitSignatur, rechtliches: mitRechtlichem, abmelden: mitAbmelden }, null),
            }}
          />
        </div>
      )}

      <div className="au-fe-fuss">
        <SpeichernKnopf neu={!mail?.id} />
        {geaendert && mail?.id && <span className="au-klein">Ungespeicherte Änderungen</span>}
      </div>
    </form>
  );
}

function ersetze(text: string) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in BEISPIEL_WERTE ? BEISPIEL_WERTE[k] : m));
}

function nichtVerfuegbarZeile(liste: Platzhalter[]) {
  if (!liste.length) return null;
  return (
    <p className="au-klein" style={{ margin: "0.35rem 0 0" }}>
      Bei diesem Auslöser leer: {liste.map((p) => p.key.replace(/[{}]/g, "")).join(", ")}
    </p>
  );
}

function SpeichernKnopf({ neu }: { neu: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="au-btn au-btn-primary" disabled={pending}>
      {pending ? "Speichert …" : neu ? "Anlegen (inaktiv)" : "Speichern"}
    </button>
  );
}
