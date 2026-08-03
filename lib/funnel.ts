import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { formatDatum, splitName } from "./format";

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
  { key: "{{veranstaltungsort}}", beschreibung: "Ort des Seminars", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{teilnehmerliste}}", beschreibung: "Liste aller Teilnehmer + Mitarbeiter (Vorname Nachname, eine Zeile je Person)", verfuegbarBei: ["vor_seminarstart", "nach_seminarende"] },
  { key: "{{firma}}", beschreibung: "Organisation des Empfängers (falls vorhanden)", verfuegbarBei: ["buchung_erstellt"] },
];

function heuteISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tageVerschieben(datumISO: string, tage: number): string {
  const d = new Date(datumISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function renderPlatzhalter(text: string, werte: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (treffer, key) => (key in werte ? werte[key] : treffer));
}

async function teilnehmerlisteText(supabase: any, seminarterminId: string): Promise<string> {
  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("teilnehmer(vorname, nachname), buchungen(status)")
    .eq("seminartermin_id", seminarterminId);
  const { data: terminMitarbeiter } = await supabase
    .from("seminartermin_mitarbeiter")
    .select("mitarbeiter(name)")
    .eq("seminartermin_id", seminarterminId);

  const zeilen: string[] = [];
  (positionen || []).forEach((p: any) => {
    if (p.buchungen?.status === "storniert" || !p.teilnehmer) return;
    zeilen.push(`${p.teilnehmer.vorname} ${p.teilnehmer.nachname}`);
  });
  (terminMitarbeiter || []).forEach((tm: any) => {
    if (!tm.mitarbeiter?.name) return;
    const { vorname, nachname } = splitName(tm.mitarbeiter.name);
    zeilen.push(`${vorname} ${nachname}`);
  });
  return zeilen.join("\n") || "(noch keine Teilnehmer)";
}

type Empfaenger = { email: string; werte: Record<string, string> };

async function sammleFaelligeEmpfaenger(
  supabase: any,
  funnel: { id: string; trigger_typ: TriggerTyp; versatz_tage: number }
): Promise<{ bezugTyp: string; bezugId: string; empfaenger: Empfaenger[] }[]> {
  const heute = heuteISO();
  const ergebnis: { bezugTyp: string; bezugId: string; empfaenger: Empfaenger[] }[] = [];

  if (funnel.trigger_typ === "buchung_erstellt") {
    const { data: buchungen } = await supabase
      .from("buchungen")
      .select("id, gebucht_am, status, organisationen(name)")
      .neq("status", "storniert");
    for (const b of buchungen || []) {
      const anchor = tageVerschieben(String(b.gebucht_am).slice(0, 10), funnel.versatz_tage);
      if (anchor > heute) continue;
      const { data: positionen } = await supabase
        .from("buchungspositionen")
        .select("teilnehmer(vorname, nachname, email)")
        .eq("buchung_id", b.id);
      const empfaenger: Empfaenger[] = (positionen || [])
        .filter((p: any) => p.teilnehmer?.email)
        .map((p: any) => ({
          email: p.teilnehmer.email,
          werte: { vorname: p.teilnehmer.vorname, nachname: p.teilnehmer.nachname, firma: b.organisationen?.name || "" },
        }));
      if (empfaenger.length) ergebnis.push({ bezugTyp: "buchung", bezugId: b.id, empfaenger });
    }
  }

  if (funnel.trigger_typ === "vor_seminarstart" || funnel.trigger_typ === "nach_seminarende") {
    const { data: termine } = await supabase
      .from("seminartermine")
      .select("id, titel, datum_start, datum_ende, status, seminartypen(name), veranstaltungsorte(ort)")
      .is("deaktiviert_am", null)
      .neq("status", "abgesagt");
    for (const t of termine || []) {
      const basisDatum =
        funnel.trigger_typ === "vor_seminarstart" ? String(t.datum_start).slice(0, 10) : String(t.datum_ende || t.datum_start).slice(0, 10);
      const richtung = funnel.trigger_typ === "vor_seminarstart" ? -funnel.versatz_tage : funnel.versatz_tage;
      const anchor = tageVerschieben(basisDatum, richtung);
      if (anchor > heute) continue;

      const { data: positionen } = await supabase
        .from("buchungspositionen")
        .select("teilnehmer(vorname, nachname, email), buchungen(status)")
        .eq("seminartermin_id", t.id);
      const titel = t.titel || t.seminartypen?.name || "Seminar";
      const seminardatum = formatDatum(t.datum_start);
      const ort = t.veranstaltungsorte?.ort || "";
      const teilnehmerliste = await teilnehmerlisteText(supabase, t.id);

      const empfaenger: Empfaenger[] = (positionen || [])
        .filter((p: any) => p.buchungen?.status !== "storniert" && p.teilnehmer?.email)
        .map((p: any) => ({
          email: p.teilnehmer.email,
          werte: {
            vorname: p.teilnehmer.vorname,
            nachname: p.teilnehmer.nachname,
            seminartitel: titel,
            seminardatum,
            veranstaltungsort: ort,
            teilnehmerliste,
          },
        }));
      if (empfaenger.length) ergebnis.push({ bezugTyp: "seminartermin", bezugId: t.id, empfaenger });
    }
  }

  if (funnel.trigger_typ === "lead_erstellt") {
    const { data: leads } = await supabase.from("leads").select("id, name, email, erstellt_am, status").neq("status", "kein_interesse");
    for (const l of leads || []) {
      if (!l.email) continue;
      const anchor = tageVerschieben(String(l.erstellt_am).slice(0, 10), funnel.versatz_tage);
      if (anchor > heute) continue;
      const { vorname, nachname } = splitName(l.name || "");
      ergebnis.push({ bezugTyp: "lead", bezugId: l.id, empfaenger: [{ email: l.email, werte: { vorname, nachname } }] });
    }
  }

  if (funnel.trigger_typ === "warteliste_eingetragen") {
    const { data: eintraege } = await supabase.from("warteliste").select("id, name, email, angemeldet_am");
    for (const w of eintraege || []) {
      if (!w.email) continue;
      const anchor = tageVerschieben(String(w.angemeldet_am).slice(0, 10), funnel.versatz_tage);
      if (anchor > heute) continue;
      const { vorname, nachname } = splitName(w.name || "");
      ergebnis.push({ bezugTyp: "warteliste", bezugId: w.id, empfaenger: [{ email: w.email, werte: { vorname, nachname } }] });
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
};

async function ermittleFaelligeEintraege(
  supabase: any
): Promise<{ eintraege: FaelligeVorschauEintrag[]; uebersprungen: number; geprueft: number }> {
  const { data: funnels } = await supabase.from("funnel_mails").select("*").eq("aktiv", true);

  const eintraege: FaelligeVorschauEintrag[] = [];
  let uebersprungen = 0;

  for (const funnel of funnels || []) {
    const gruppen = await sammleFaelligeEmpfaenger(supabase, funnel as any);
    for (const gruppe of gruppen) {
      for (const empf of gruppe.empfaenger) {
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
          inhaltHtml: renderPlatzhalter(funnel.inhalt, empf.werte).replace(/\n/g, "<br/>"),
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
    try {
      const resend = getResend();
      const { error } = await resend.emails.send({
        from: ABSENDER,
        to: [eintrag.empfaengerEmail],
        subject: eintrag.betreff,
        html: eintrag.inhaltHtml,
      });
      if (error) {
        status = "fehler";
        fehlermeldung = error.message;
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
    });

    if (status === "gesendet") gesendet++;
    else fehler++;
  }

  return { geprueft, gesendet, fehler, uebersprungen };
}
