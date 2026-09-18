"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { baueMailHtml, schalterAus, BEISPIEL_WERTE, type MailBausteine } from "@/lib/mail-html";
import LinkChecker from "../LinkChecker";

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
  tags,
  seminartypen,
  optionen,
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
    tag_nach_versand?: string | null;
    tag_bedingung_mit?: string | null;
    tag_bedingung_ohne?: string | null;
    nur_seminartyp_id?: string | null;
    ausschluss_seminartyp_id?: string | null;
    mindestabstand_tage?: number;
    nur_optionen?: string[];
    ausschluss_optionen?: string[];
  } | null;
  /** Alle Options-Titel ueber alle Termine (Shift, Alignment, …) */
  optionen: string[];
  seminartypen: { id: string; name: string }[];
  bausteine: MailBausteine;
  tags: { id: string; label: string; aktiv: boolean }[];
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
  const [tagNach, setTagNach] = useState(mail?.tag_nach_versand || "");
  const [tagMit, setTagMit] = useState(mail?.tag_bedingung_mit || "");
  const [tagOhne, setTagOhne] = useState(mail?.tag_bedingung_ohne || "");
  const [nurTyp, setNurTyp] = useState(mail?.nur_seminartyp_id || "");
  const [ohneTyp, setOhneTyp] = useState(mail?.ausschluss_seminartyp_id || "");
  const [abstand, setAbstand] = useState(String(mail?.mindestabstand_tage ?? 0));
  const [nurOpt, setNurOpt] = useState<string[]>(mail?.nur_optionen || []);
  const [ohneOpt, setOhneOpt] = useState<string[]>(mail?.ausschluss_optionen || []);

  const geaendert =
    name !== (mail?.name || "") ||
    triggerTyp !== (mail?.trigger_typ || "vor_seminarstart") ||
    versatz !== String(mail?.versatz_tage ?? 3) ||
    betreff !== (mail?.betreff || "") ||
    inhalt !== (mail?.inhalt || "") ||
    mitSignatur !== start.signatur ||
    mitRechtlichem !== start.rechtliches ||
    (!istSystem && mitAbmelden !== start.abmelden) ||
    tagNach !== (mail?.tag_nach_versand || "") ||
    tagMit !== (mail?.tag_bedingung_mit || "") ||
    tagOhne !== (mail?.tag_bedingung_ohne || "") ||
    nurTyp !== (mail?.nur_seminartyp_id || "") ||
    ohneTyp !== (mail?.ausschluss_seminartyp_id || "") ||
    abstand !== String(mail?.mindestabstand_tage ?? 0) ||
    nurOpt.join("|") !== (mail?.nur_optionen || []).join("|") ||
    ohneOpt.join("|") !== (mail?.ausschluss_optionen || []).join("|");
  const optionsBezogen = seminarBezogenOderBuchung(triggerTyp);
  const seminarBezogen = triggerTyp === "vor_seminarstart" || triggerTyp === "nach_seminarende";

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
      <LinkChecker
        text={`${betreff}\n${inhalt}`}
        zusatzLinks={
          mitRechtlichem
            ? [
                { label: "Impressum", url: bausteine.impressum_url },
                { label: "Datenschutz", url: bausteine.datenschutz_url },
              ]
            : []
        }
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

      {!istSystem && (
        <div className="au-fe-tags">
          <span className="au-label" style={{ margin: 0 }}>Tags</span>
          {tags.length === 0 ? (
            <span className="au-klein">Noch keine Tags angelegt – <Link href="/tags">Tags anlegen</Link></span>
          ) : (
            <div className="au-fe-tags-raster">
              <label>
                <span className="au-klein">Nur an Personen mit Tag</span>
                <select className="au-select" name="tag_bedingung_mit" value={tagMit} onChange={(e) => setTagMit(e.target.value)}>
                  {tagOptionen(tags, tagMit)}
                </select>
              </label>
              <label>
                <span className="au-klein">Nicht an Personen mit Tag</span>
                <select className="au-select" name="tag_bedingung_ohne" value={tagOhne} onChange={(e) => setTagOhne(e.target.value)}>
                  {tagOptionen(tags, tagOhne)}
                </select>
              </label>
              <label>
                <span className="au-klein">Nach dem Versand Tag setzen</span>
                <select className="au-select" name="tag_nach_versand" value={tagNach} onChange={(e) => setTagNach(e.target.value)}>
                  {tagOptionen(tags, tagNach)}
                </select>
              </label>
            </div>
          )}
          {tagMit && ["lead_erstellt", "warteliste_eingetragen"].includes(triggerTyp) && (
            <p className="au-fe-warnung" style={{ margin: 0 }}>Leads und Wartelisten-Einträge haben keine Tags – mit „Nur an Personen mit Tag“ geht diese Mail an niemanden.</p>
          )}
        </div>
      )}

      {!istSystem && (
        <div className="au-fe-tags">
          <span className="au-label" style={{ margin: 0 }}>Bedingungen (z. B. Anschluss-Angebot „nach Preisfindung → Führung“)</span>
          <div className="au-fe-tags-raster">
            <label>
              <span className="au-klein">Nur nach Seminaren der Kategorie</span>
              <select className="au-select" name="nur_seminartyp_id" value={seminarBezogen ? nurTyp : ""} disabled={!seminarBezogen} onChange={(e) => setNurTyp(e.target.value)}>
                <option value="">{seminarBezogen ? "– alle –" : "nur bei vor/nach Seminar"}</option>
                {seminartypen.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="au-klein">Nicht, wenn schon besucht oder gebucht</span>
              <select className="au-select" name="ausschluss_seminartyp_id" value={ohneTyp} onChange={(e) => setOhneTyp(e.target.value)}>
                <option value="">– keine Einschränkung –</option>
                {seminartypen.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="au-klein">Mindestabstand zu anderen Mails (Tage)</span>
              <input className="au-input" name="mindestabstand_tage" type="number" min={0} max={90} value={abstand} onChange={(e) => setAbstand(e.target.value)} style={{ margin: 0 }} />
            </label>
          </div>
          {optionsBezogen && optionen.length > 0 && (
            <div className="au-fe-optionen">
              <OptionsWahl titel="Nur bei gebuchter Option" name="nur_optionen" optionen={optionen} werte={nurOpt} setWerte={setNurOpt} sperre={ohneOpt} />
              <OptionsWahl titel="Nicht bei Option" name="ausschluss_optionen" optionen={optionen} werte={ohneOpt} setWerte={setOhneOpt} sperre={nurOpt} />
              <span className="au-klein">
                Beispiel Upgrade-Angebot: „Nur bei Shift“. Gilt für jeden Termin mit einer Option dieses Namens. Im Text steht <code>{"{{option}}"}</code> für die gebuchte Option.
              </span>
            </div>
          )}
          <span className="au-klein">
            Mindestabstand 0 = aus (Standard für Service-Mails). Bei Werbe-/Anschluss-Mails z. B. 4: Wer gerade eine Mail bekommen hat, bekommt diese ein paar Tage später – nicht verworfen, nur verschoben.
          </span>
        </div>
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

function seminarBezogenOderBuchung(trigger: string) {
  return trigger === "buchung_erstellt" || trigger === "vor_seminarstart" || trigger === "nach_seminarende";
}

// Mehrfachauswahl von Options-Titeln als Chips; versteckte Inputs fuer das Formular
function OptionsWahl({
  titel,
  name,
  optionen,
  werte,
  setWerte,
  sperre,
}: {
  titel: string;
  name: string;
  optionen: string[];
  werte: string[];
  setWerte: (w: string[]) => void;
  sperre: string[];
}) {
  return (
    <div>
      <span className="au-klein">{titel}</span>
      <div className="au-chips">
        {optionen.map((o) => {
          const an = werte.includes(o);
          return (
            <button
              key={o}
              type="button"
              className={`au-chip${an ? " aktiv" : ""}`}
              disabled={sperre.includes(o)}
              aria-pressed={an}
              onClick={() => setWerte(an ? werte.filter((w) => w !== o) : [...werte, o])}
            >
              {o}
            </button>
          );
        })}
      </div>
      {werte.map((w) => (
        <input key={w} type="hidden" name={name} value={w} />
      ))}
    </div>
  );
}

function tagOptionen(tags: { id: string; label: string; aktiv: boolean }[], gewaehlt: string) {
  return [
    <option key="" value="">– keiner –</option>,
    ...tags
      .filter((t) => t.aktiv || t.id === gewaehlt)
      .map((t) => (
        <option key={t.id} value={t.id}>{t.label}{t.aktiv ? "" : " (deaktiviert)"}</option>
      )),
  ];
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
