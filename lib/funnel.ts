import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { formatDatum, splitName } from "./format";
import { seminarLinks } from "./seminar-links";
import { ladeBausteine, schalterAus, baueMailHtml, abmeldeUrl, abmeldeHeader, ladeSperrliste, type AbmeldeTyp } from "./mail-bausteine";

// Diese beiden Mails verschickt der Code direkt (Buchungseingang in
// app/api/public/buchungen, Zahlungsbestaetigung in bestaetigeBuchung) --
// unabhaengig von "aktiv". Der taegliche Cron ignoriert sie deshalb immer,
// sonst gingen sie doppelt bzw. rueckwirkend an alle Alt-Buchungen.
export const SYSTEM_FUNNEL_IDS: Record<string, string> = {
  "95628e52-7ba8-4987-a10b-4fb02c7db4e1": "wird automatisch direkt beim Buchungseingang verschickt",
  "b8c1927c-c660-454c-bb02-e6db2d93e8c0": "wird automatisch beim Bestätigen einer Buchung (Zahlung) verschickt",
  "3f1a6c2e-5b7d-4e8a-9c01-2d4b6e8f0a11": "wird automatisch beim Eingang einer Programm-Buchung (z. B. Uplift) verschickt – Platzhalter {{vorname}}, {{programm}}, {{option}}, {{zahlweise}}",
  "7c2d9e4b-1a3f-4b6c-8d20-5e7f9a1b3c22": "wird automatisch beim Bestätigen einer Programm-Buchung (Zahlung) verschickt – Platzhalter {{vorname}}, {{programm}}, {{option}}",
};

export type TriggerTyp =
  | "buchung_erstellt"
  | "vor_seminarstart"
  | "nach_seminarende"
  | "lead_erstellt"
  | "warteliste_eingetragen";

export const TRIGGER_LABEL: Record<TriggerTyp, string> = {
  buchung_erstellt: "X Tage nach Buchungseingang",
  vor_seminarstart: "X Tage vor Seminarstart",
  nach_seminarende: "X Tage nach Seminarende",
  lead_erstellt: "X Tage nach Lead-Erstellung",
  warteliste_eingetragen: "X Tage nach Wartelisten-Eintragung",
};

export const PLATZHALTER_HILFE: { key: string; beschreibung: string; verfuegbarBei: TriggerTyp[] }[] = [
  { key: "{{vorname}}", beschreibung: "Vorname des Empfängers", verfuegbarBei: ["buchung_erstellt", "vor_seminarstart", "nach_seminarende", "lead_erstellt", "warteliste_eingetragen"] },
  { key: "{{nachname}}", beschreibung: "Nachname des Empfängers", verfuegbarBei: ["buchung_erstellt", "vor_seminarstart", "nach_seminarende", "lead_erstellt", "warteliste_eingetragen"] },
  { key: "{{seminartitel}}", beschreibung: "Titel bzw. Name des Seminars", verfuegbarBei: ["buchung_erstellt", "vor_seminarstart", "nach_seminarende"] },
  { key: "{{seminardatum}}", beschreibung: "Datum des Seminartermins", verfuegbarBei: ["buchung_erstellt", "vor_seminarstart", "nach_seminarende"] },
  { key: "{{datum_start}}", beschreibung: "Erster Seminartag, ausgeschrieben (z. B. Mittwoch, 7. Oktober 2026)", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{zeit_start}}", beschreibung: "Beginn-Uhrzeit (z. B. 09:00)", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{ort}}", beschreibung: "Veranstaltungsort mit Adresse bzw. Ort", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{veranstaltungsort}}", beschreibung: "Ort des Seminars (nur Ortsname)", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{teilnehmerliste}}", beschreibung: "Liste aller Teilnehmer + Mitarbeiter als Text (ohne Opt-outs)", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{teilnehmerliste_link}}", beschreibung: "Persönlicher Link zur Teilnehmerliste-Seite (Foto/LinkedIn nur mit Freigabe)", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{unterlagen_link}}", beschreibung: "Persönlicher Link zur Unterlagen-Seite des Termins", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{freigabe_link}}", beschreibung: "Persönlicher Link, um in der Teilnehmerliste mit Foto/LinkedIn zu erscheinen", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{firma}}", beschreibung: "Organisation des Empfängers (falls vorhanden)", verfuegbarBei: ["buchung_erstellt"] },
  { key: "{{option}}", beschreibung: "Gebuchte Option, z. B. Shift", verfuegbarBei: ["buchung_erstellt", "vor_seminarstart", "nach_seminarende"] },
];

// Deutscher Kalendertag -- der Cron laeuft um 06:00 UTC, Stichtage sind
// deutsche Tage.
function heuteISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

function datumLang(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(j, m - 1, t))
  );
}

function tageVerschieben(datumISO: string, tage: number): string {
  const d = new Date(datumISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export function renderPlatzhalter(text: string, werte: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (treffer, key) => (key in werte ? werte[key] : treffer));
}

async function teilnehmerlisteText(supabase: any, seminarterminId: string): Promise<string> {
  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("teilnehmer(vorname, nachname, teilnehmerliste_opt_out), buchungen(status)")
    .eq("seminartermin_id", seminarterminId);
  const { data: terminMitarbeiter } = await supabase
    .from("seminartermin_mitarbeiter")
    .select("mitarbeiter(name)")
    .eq("seminartermin_id", seminarterminId);

  const zeilen: string[] = [];
  (positionen || []).forEach((p: any) => {
    // Opt-out respektieren -- vorher standen auch Personen mit
    // "Nicht auf Teilnehmerlisten aufführen" in der Mail-Liste.
    if (p.buchungen?.status === "storniert" || !p.teilnehmer || p.teilnehmer.teilnehmerliste_opt_out) return;
    zeilen.push(`${p.teilnehmer.vorname} ${p.teilnehmer.nachname}`);
  });
  (terminMitarbeiter || []).forEach((tm: any) => {
    if (!tm.mitarbeiter?.name) return;
    const { vorname, nachname } = splitName(tm.mitarbeiter.name);
    zeilen.push(`${vorname} ${nachname}`);
  });
  return zeilen.join("\n") || "(noch keine Teilnehmer)";
}

type Empfaenger = {
  email: string;
  werte: Record<string, string>;
  abmelde: { typ: AbmeldeTyp; id: string };
  /** Titel der gebuchten Option (seminartermin_optionen.titel), fuer Options-Filter */
  option?: string | null;
};

async function sammleFaelligeEmpfaenger(
  supabase: any,
  funnel: { id: string; trigger_typ: TriggerTyp; versatz_tage: number; aktiviert_am?: string | null; nur_seminartyp_id?: string | null }
): Promise<{ bezugTyp: string; bezugId: string; empfaenger: Empfaenger[] }[]> {
  const heute = heuteISO();
  // Nur Stichtage ab der Aktivierung (siehe funnel_mails.aktiviert_am). Ohne
  // diese Untergrenze war jeder vergangene Stichtag "faellig": eine frisch
  // aktivierte "10 Tage vorher"-Mail haette alle Teilnehmer aller Alt-Seminare
  // angeschrieben.
  const abStichtag = funnel.aktiviert_am
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date(funnel.aktiviert_am))
    : heute;
  const imFenster = (anchor: string) => anchor <= heute && anchor >= abStichtag;
  const ergebnis: { bezugTyp: string; bezugId: string; empfaenger: Empfaenger[] }[] = [];

  if (funnel.trigger_typ === "buchung_erstellt") {
    // Nur bezahlte Buchungen: der Platz ist zwar ab Buchungseingang belegt,
    // die Mailstrecke startet aber erst mit der Zahlungsbestaetigung
    // (Markus). Stichtag ist deshalb bestaetigt_am, nicht gebucht_am --
    // sonst waeren bei spaeter Zahlung sofort mehrere Mails faellig.
    const { data: buchungen } = await supabase
      .from("buchungen")
      .select("id, gebucht_am, bestaetigt_am, status, metadata, organisationen(name)")
      .eq("status", "bestaetigt");
    for (const b of buchungen || []) {
      // Retroaktiv per FastBill zugeordnete Buchungen sind kein echter
      // Online-Buchungseingang -- dafuer soll keine automatische
      // "Buchung erstellt"-Mail (z.B. Reservierungsbestaetigung) rausgehen.
      // Markierung erfolgt in bestaetigeFastbillZuordnung() (lib/actions.ts).
      if ((b as any).metadata?.quelle === "fastbill") continue;
      // Programm-Buchungen (Uplift-Mitgliedschaft …) sind keine Seminarbuchung --
      // "Buchung erstellt"-Funnel-Mails sprechen vom Seminar und gehen dort
      // nicht raus; Programme haben eigene System-Mails.
      if ((b as any).metadata?.buchungsart === "programm") continue;
      const anchor = tageVerschieben(String(b.bestaetigt_am || b.gebucht_am).slice(0, 10), funnel.versatz_tage);
      if (!imFenster(anchor)) continue;
      const { data: positionen } = await supabase
        .from("buchungspositionen")
        .select("teilnehmer(id, vorname, nachname, email, marketing_consent_status), seminartermin_optionen(titel)")
        .eq("buchung_id", b.id);
      const empfaenger: Empfaenger[] = (positionen || [])
        .filter((p: any) => p.teilnehmer?.email && p.teilnehmer?.marketing_consent_status !== "abgemeldet")
        .map((p: any) => ({
          email: p.teilnehmer.email,
          werte: {
            vorname: p.teilnehmer.vorname,
            nachname: p.teilnehmer.nachname,
            firma: b.organisationen?.name || "",
            option: p.seminartermin_optionen?.titel || "",
          },
          abmelde: { typ: "t" as const, id: p.teilnehmer.id },
          option: p.seminartermin_optionen?.titel || null,
        }));
      if (empfaenger.length) ergebnis.push({ bezugTyp: "buchung", bezugId: b.id, empfaenger });
    }
  }

  if (funnel.trigger_typ === "vor_seminarstart" || funnel.trigger_typ === "nach_seminarende") {
    const { data: termine } = await supabase
      .from("seminartermine")
      .select("id, titel, datum_start, datum_ende, zeit_start, status, seminartyp_id, seminartypen(name), veranstaltungsorte(name, ort, adresse)")
      .is("deaktiviert_am", null)
      .neq("status", "abgesagt");
    for (const t of termine || []) {
      // Anschluss-Mails: nur nach Seminaren einer bestimmten Kategorie
      if (funnel.nur_seminartyp_id && t.seminartyp_id !== funnel.nur_seminartyp_id) continue;
      const basisDatum =
        funnel.trigger_typ === "vor_seminarstart" ? String(t.datum_start).slice(0, 10) : String(t.datum_ende || t.datum_start).slice(0, 10);
      const richtung = funnel.trigger_typ === "vor_seminarstart" ? -funnel.versatz_tage : funnel.versatz_tage;
      const anchor = tageVerschieben(basisDatum, richtung);
      if (!imFenster(anchor)) continue;
      // "Vorher"-Mails nie mehr ab Seminarbeginn verschicken
      if (funnel.trigger_typ === "vor_seminarstart" && heute >= String(t.datum_start).slice(0, 10)) continue;

      const { data: positionen } = await supabase
        .from("buchungspositionen")
        .select("teilnehmer(id, vorname, nachname, email, marketing_consent_status), buchungen(status), seminartermin_optionen(titel)")
        .eq("seminartermin_id", t.id);
      const titel = t.titel || t.seminartypen?.name || "Seminar";
      const seminardatum = formatDatum(t.datum_start);
      const ort = t.veranstaltungsorte?.ort || "";
      const ortLang = [t.veranstaltungsorte?.name, t.veranstaltungsorte?.adresse || t.veranstaltungsorte?.ort].filter(Boolean).join(", ");
      const teilnehmerliste = await teilnehmerlisteText(supabase, t.id);

      // Wie bei "buchung_erstellt": Seminar-Mails gehen nur an bezahlte
      // Buchungen; unbezahlte haben ihren Platz, aber noch keine Strecke.
      const empfaenger: Empfaenger[] = (positionen || [])
        .filter(
          (p: any) =>
            p.buchungen?.status === "bestaetigt" &&
            p.teilnehmer?.email &&
            p.teilnehmer?.marketing_consent_status !== "abgemeldet"
        )
        .map((p: any) => ({
          email: p.teilnehmer.email,
          werte: {
            vorname: p.teilnehmer.vorname,
            nachname: p.teilnehmer.nachname,
            seminartitel: titel,
            seminardatum,
            veranstaltungsort: ort,
            teilnehmerliste,
            datum_start: datumLang(String(t.datum_start)),
            zeit_start: t.zeit_start ? String(t.zeit_start).slice(0, 5) : "",
            ort: ortLang || ort,
            ...seminarLinks(p.teilnehmer.id, t.id),
            option: p.seminartermin_optionen?.titel || "",
          },
          abmelde: { typ: "t" as const, id: p.teilnehmer.id },
          option: p.seminartermin_optionen?.titel || null,
        }));
      if (empfaenger.length) ergebnis.push({ bezugTyp: "seminartermin", bezugId: t.id, empfaenger });
    }
  }

  if (funnel.trigger_typ === "lead_erstellt") {
    const { data: leads } = await supabase.from("leads").select("id, name, email, erstellt_am, status").neq("status", "kein_interesse");
    for (const l of leads || []) {
      if (!l.email) continue;
      const anchor = tageVerschieben(String(l.erstellt_am).slice(0, 10), funnel.versatz_tage);
      if (!imFenster(anchor)) continue;
      const { vorname, nachname } = splitName(l.name || "");
      ergebnis.push({ bezugTyp: "lead", bezugId: l.id, empfaenger: [{ email: l.email, werte: { vorname, nachname }, abmelde: { typ: "l", id: l.id } }] });
    }
  }

  if (funnel.trigger_typ === "warteliste_eingetragen") {
    const { data: eintraege } = await supabase.from("warteliste").select("id, name, email, angemeldet_am");
    for (const w of eintraege || []) {
      if (!w.email) continue;
      const anchor = tageVerschieben(String(w.angemeldet_am).slice(0, 10), funnel.versatz_tage);
      if (!imFenster(anchor)) continue;
      const { vorname, nachname } = splitName(w.name || "");
      ergebnis.push({ bezugTyp: "warteliste", bezugId: w.id, empfaenger: [{ email: w.email, werte: { vorname, nachname }, abmelde: { typ: "w", id: w.id } }] });
    }
  }

  return ergebnis;
}

export type FaelligeVorschauEintrag = {
  funnelMailId: string;
  funnelName: string;
  bezugTyp: string;
  bezugId: string;
  empfaengerEmail: string;
  betreff: string;
  inhaltHtml: string;
  headers?: Record<string, string>;
  /** Nur bei Teilnehmern: nach erfolgreichem Versand zu setzender Tag */
  tagNachVersand?: { teilnehmerId: string; tagId: string } | null;
};

async function ermittleFaelligeEintraege(
  supabase: any
): Promise<{ eintraege: FaelligeVorschauEintrag[]; uebersprungen: number; geprueft: number }> {
  const { data: alleAktiven } = await supabase.from("funnel_mails").select("*").eq("aktiv", true).is("geloescht_am", null);
  const funnels = (alleAktiven || []).filter((f: any) => !SYSTEM_FUNNEL_IDS[f.id]);

  const eintraege: FaelligeVorschauEintrag[] = [];
  let uebersprungen = 0;
  const bausteine = await ladeBausteine(supabase);
  // Wer sich per Abmeldelink abgemeldet hat, bekommt keine Funnel-Mail mehr --
  // gilt auch fuer Leads/Warteliste, die kein marketing_consent_status haben.
  // Dazu Bounces und Spam-Beschwerden (ladeSperrliste).
  const abgemeldet = await ladeSperrliste(supabase);

  // Tag-Bedingungen: nur laden, wenn eine aktive Mail sie nutzt
  const tagsProTeilnehmer = new Map<string, Set<string>>();
  const genutzteTags = Array.from(
    new Set(funnels.flatMap((f: any) => [f.tag_bedingung_mit, f.tag_bedingung_ohne]).filter(Boolean))
  ) as string[];
  if (genutzteTags.length) {
    for (let von = 0; ; von += 1000) {
      const { data } = await supabase.from("teilnehmer_tags").select("teilnehmer_id, tag_id").in("tag_id", genutzteTags).range(von, von + 999);
      for (const z of data || []) {
        if (!tagsProTeilnehmer.has(z.teilnehmer_id)) tagsProTeilnehmer.set(z.teilnehmer_id, new Set());
        tagsProTeilnehmer.get(z.teilnehmer_id)!.add(z.tag_id);
      }
      if (!data || data.length < 1000) break;
    }
  }
  // Anschluss-Mails: wer die Zielkategorie schon besucht ODER kuenftig gebucht hat, bekommt das Angebot nicht
  const ausschlussKategorien = Array.from(new Set(funnels.map((f: any) => f.ausschluss_seminartyp_id).filter(Boolean))) as string[];
  const kategorieTeilnehmer = new Map<string, Set<string>>();
  if (ausschlussKategorien.length) {
    for (let von = 0; ; von += 1000) {
      const { data } = await supabase
        .from("teilnehmer_seminar_besuche")
        .select("teilnehmer_id, seminartyp_id")
        .in("seminartyp_id", ausschlussKategorien)
        .range(von, von + 999);
      for (const z of data || []) {
        if (!kategorieTeilnehmer.has(z.seminartyp_id)) kategorieTeilnehmer.set(z.seminartyp_id, new Set());
        kategorieTeilnehmer.get(z.seminartyp_id)!.add(z.teilnehmer_id);
      }
      if (!data || data.length < 1000) break;
    }
  }
  // Frequency-Capping nur fuer Mails, die es ausdruecklich einschalten (Standard 0 = aus).
  // Innerhalb der Sperrfrist wird nichts verworfen: der Stichtag bleibt im Fenster,
  // der naechste taegliche Lauf prueft erneut und schickt nach Ablauf der Frist.
  const letzteMail = new Map<string, number>();
  if (funnels.some((f: any) => f.mindestabstand_tage > 0)) {
    for (let von = 0; ; von += 1000) {
      const { data } = await supabase.from("letzte_marketing_mail_pro_email").select("email, letzte_marketing_mail_am").range(von, von + 999);
      for (const z of data || []) {
        const key = String(z.email).trim().toLowerCase();
        letzteMail.set(key, Math.max(letzteMail.get(key) || 0, Date.parse(z.letzte_marketing_mail_am)));
      }
      if (!data || data.length < 1000) break;
    }
  }
  const { data: aktiveTags } = await supabase.from("tags").select("id").eq("aktiv", true);
  const aktiveTagIds = new Set((aktiveTags || []).map((t: any) => t.id));

  for (const funnel of funnels || []) {
    const gruppen = await sammleFaelligeEmpfaenger(supabase, funnel as any);
    for (const gruppe of gruppen) {
      for (const empf of gruppe.empfaenger) {
        if (abgemeldet.has(empf.email.trim().toLowerCase())) continue;
        // Tags gibt es nur bei Teilnehmern: "nur mit Tag X" schliesst Leads/Warteliste aus
        const personTags = empf.abmelde.typ === "t" ? tagsProTeilnehmer.get(empf.abmelde.id) : undefined;
        if (funnel.tag_bedingung_mit && !personTags?.has(funnel.tag_bedingung_mit)) continue;
        if (funnel.tag_bedingung_ohne && personTags?.has(funnel.tag_bedingung_ohne)) continue;
        // Options-Filter (z. B. Upgrade-Angebot nur an "Shift"); ohne gebuchte Option faellt man bei "nur" raus
        if (funnel.nur_optionen?.length && !(empf.option && funnel.nur_optionen.includes(empf.option))) continue;
        if (funnel.ausschluss_optionen?.length && empf.option && funnel.ausschluss_optionen.includes(empf.option)) continue;
        if (funnel.ausschluss_seminartyp_id && empf.abmelde.typ === "t" && kategorieTeilnehmer.get(funnel.ausschluss_seminartyp_id)?.has(empf.abmelde.id)) continue;
        if (funnel.mindestabstand_tage > 0) {
          const zuletzt = letzteMail.get(empf.email.trim().toLowerCase());
          if (zuletzt && Date.now() - zuletzt < funnel.mindestabstand_tage * 86_400_000) continue;
        }
        const { data: bereitsGesendet } = await supabase
          .from("funnel_versand_log")
          .select("id")
          .eq("funnel_mail_id", funnel.id)
          .eq("bezug_id", gruppe.bezugId)
          .eq("empfaenger_email", empf.email)
          .maybeSingle();
        if (bereitsGesendet) {
          uebersprungen++;
          continue;
        }

        eintraege.push({
          funnelMailId: funnel.id,
          funnelName: funnel.name,
          bezugTyp: gruppe.bezugTyp,
          bezugId: gruppe.bezugId,
          empfaengerEmail: empf.email,
          betreff: renderPlatzhalter(funnel.betreff, empf.werte),
          inhaltHtml: baueMailHtml(
            renderPlatzhalter(funnel.inhalt, empf.werte),
            bausteine,
            schalterAus(funnel),
            abmeldeUrl(empf.abmelde.typ, empf.abmelde.id)
          ),
          headers: schalterAus(funnel).abmelden ? abmeldeHeader(empf.abmelde.typ, empf.abmelde.id) : undefined,
          tagNachVersand:
            funnel.tag_nach_versand && empf.abmelde.typ === "t" && aktiveTagIds.has(funnel.tag_nach_versand)
              ? { teilnehmerId: empf.abmelde.id, tagId: funnel.tag_nach_versand }
              : null,
        });
      }
    }
  }

  return { eintraege, uebersprungen, geprueft: (funnels || []).length };
}

/**
 * Liefert alle aktuell fälligen, noch nicht verschickten Funnel-Mails als Vorschau
 * (ohne etwas zu versenden). Wird von der Vorschau-Seite im Admin-UI genutzt, damit
 * vor dem tatsächlichen Versand geprüft werden kann, was rausgehen würde.
 */
export async function ermittleFaelligeVorschau(): Promise<{
  eintraege: FaelligeVorschauEintrag[];
  uebersprungen: number;
  geprueft: number;
}> {
  const supabase = getSupabaseAdmin();
  return ermittleFaelligeEintraege(supabase);
}

export async function pruefeUndSendeFaelligeFunnelMails(): Promise<{
  geprueft: number;
  gesendet: number;
  fehler: number;
  uebersprungen: number;
}> {
  const supabase = getSupabaseAdmin();
  const { eintraege, uebersprungen, geprueft } = await ermittleFaelligeEintraege(supabase);

  let gesendet = 0;
  let fehler = 0;

  for (const eintrag of eintraege) {
    let status: "gesendet" | "fehler" = "gesendet";
    let fehlermeldung: string | null = null;
    let resendEmailId: string | null = null;
    try {
      const resend = getResend();
      const { data, error } = await resend.emails.send({
        from: ABSENDER,
        to: [eintrag.empfaengerEmail],
        subject: eintrag.betreff,
        html: eintrag.inhaltHtml,
        headers: eintrag.headers,
      });
      if (error) {
        status = "fehler";
        fehlermeldung = error.message;
      } else {
        resendEmailId = data?.id || null;
      }
    } catch (e: any) {
      status = "fehler";
      fehlermeldung = e?.message || "Unbekannter Fehler beim Versand.";
    }

    await supabase.from("funnel_versand_log").insert({
      funnel_mail_id: eintrag.funnelMailId,
      bezug_typ: eintrag.bezugTyp,
      bezug_id: eintrag.bezugId,
      empfaenger_email: eintrag.empfaengerEmail,
      status,
      fehlermeldung,
      resend_email_id: resendEmailId,
    });

    // Automatischer Tag nach erfolgreichem Versand (z. B. "Funnel SPS abgeschlossen").
    // Bereits vorhandener Tag bleibt unveraendert (inkl. urspruenglichem Datum/Quelle).
    if (status === "gesendet" && eintrag.tagNachVersand) {
      const { error: tagFehler } = await supabase
        .from("teilnehmer_tags")
        .upsert(
          { teilnehmer_id: eintrag.tagNachVersand.teilnehmerId, tag_id: eintrag.tagNachVersand.tagId, quelle: "automatisch" },
          { onConflict: "teilnehmer_id,tag_id", ignoreDuplicates: true }
        );
      if (tagFehler) console.error("Funnel-Tag setzen:", tagFehler.message);
    }

    if (status === "gesendet") gesendet++;
    else fehler++;
  }

  return { geprueft, gesendet, fehler, uebersprungen };
}
