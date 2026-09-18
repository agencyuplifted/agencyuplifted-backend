import { getSupabaseAdmin } from "./supabase";
import { getResend, ABSENDER } from "./email";
import { INBOX_STATUS_GESCHLOSSEN } from "./inbox";
import { berlinHeute, formatTag, tagPlus } from "./events";
import { ladeFaelligkeiten, FAELLIG_ART_LABEL, type FaelligerPunkt } from "./wiedervorlage";

// Phase 3 des Moduls "Ideen & Wiedervorlage": einstellbare Erinnerungsmails
// (Tabelle erinnerungen). Der Cron laeuft einmal taeglich morgens (Vercel
// Hobby erlaubt nur 1x/Tag) und prueft pro Erinnerung, ob sie heute dran ist.
// Empfaenger sind ausschliesslich intern eingetragene Adressen -- an Kontakte
// oder Leads geht aus diesem Modul nie etwas raus.

export const BACKSTAGE_URL = process.env.BACKSTAGE_URL || "https://backstage.agencyuplifted.com";

export const FREQUENZEN = ["taeglich", "werktags", "woechentlich", "monatlich"] as const;
export type Frequenz = (typeof FREQUENZEN)[number];
export const FREQUENZ_LABEL: Record<Frequenz, string> = {
  taeglich: "täglich",
  werktags: "werktags (Mo–Fr)",
  woechentlich: "wöchentlich",
  monatlich: "monatlich",
};
export const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

export type Erinnerung = {
  id: string;
  name: string;
  aktiv: boolean;
  empfaenger: string[];
  frequenz: Frequenz;
  wochentag: number | null;
  monatstag: number | null;
  vorschau_tage: number;
  cfp_vorschau_tage: number;
  mit_aufgaben: boolean;
  mit_wiedervorlagen: boolean;
  mit_events: boolean;
  mit_cfp: boolean;
  mit_unsortiert: boolean;
  nur_wenn_inhalt: boolean;
  zuletzt_gesendet_am: string | null;
  zuletzt_fehler: string | null;
};

// ISO-Wochentag (1 = Montag) eines Kalendertags.
function isoWochentag(isoTag: string): number {
  const [j, m, t] = isoTag.split("-").map(Number);
  return ((new Date(Date.UTC(j, m - 1, t)).getUTCDay() + 6) % 7) + 1;
}

export function istHeuteDran(e: Pick<Erinnerung, "frequenz" | "wochentag" | "monatstag">, heute: string): boolean {
  const wt = isoWochentag(heute);
  if (e.frequenz === "taeglich") return true;
  if (e.frequenz === "werktags") return wt <= 5;
  if (e.frequenz === "woechentlich") return wt === e.wochentag;
  return Number(heute.slice(8, 10)) === e.monatstag;
}

export function frequenzText(e: Pick<Erinnerung, "frequenz" | "wochentag" | "monatstag">): string {
  if (e.frequenz === "woechentlich") return `jeden ${WOCHENTAGE[(e.wochentag || 1) - 1]}`;
  if (e.frequenz === "monatlich") return `monatlich am ${e.monatstag}.`;
  return FREQUENZ_LABEL[e.frequenz];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type MailInhalt = { betreff: string; html: string; anzahl: number };

async function baueMail(e: Erinnerung, heute: string): Promise<MailInhalt> {
  const alle = await ladeFaelligkeiten({ bisTage: e.vorschau_tage, cfpTage: e.cfp_vorschau_tage });
  const punkte = alle.filter(
    (p) =>
      (p.art === "aufgabe" && e.mit_aufgaben) ||
      (p.art === "wiedervorlage" && e.mit_wiedervorlagen) ||
      (p.art === "event" && e.mit_events) ||
      (p.art === "cfp" && e.mit_cfp)
  );

  let unsortiert: { id: string; text: string; erstellt_am: string }[] = [];
  let unsortiertAnzahl = 0;
  if (e.mit_unsortiert) {
    const { data, count, error } = await getSupabaseAdmin()
      .from("inbox_eintraege")
      .select("id, text, erstellt_am", { count: "exact" })
      .is("typ", null)
      .not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`)
      .order("erstellt_am", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    unsortiert = data || [];
    unsortiertAnzahl = count || 0;
  }

  const ueberfaellig = punkte.filter((p) => p.ueberfaellig);
  const heuteP = punkte.filter((p) => !p.ueberfaellig && p.datum === heute);
  const spaeter = punkte.filter((p) => p.datum > heute);

  const zeile = (p: FaelligerPunkt) =>
    `<tr><td style="padding:4px 10px 4px 0;white-space:nowrap;color:${p.ueberfaellig ? "#b3261e" : "#6e6e73"};font-size:13px">${p.datum === heute ? "heute" : esc(formatTag(p.datum))}</td>` +
    `<td style="padding:4px 0;font-size:14px"><span style="color:#6e6e73;font-size:12px">${FAELLIG_ART_LABEL[p.art]}</span> ` +
    `<a href="${BACKSTAGE_URL}${p.href}" style="color:#0b1b33">${esc(p.titel.length > 140 ? p.titel.slice(0, 140) + " …" : p.titel)}</a>` +
    `${p.kontext ? ` <span style="color:#6e6e73;font-size:12px">· ${esc(p.kontext.slice(0, 80))}</span>` : ""}</td></tr>`;
  const block = (titel: string, liste: FaelligerPunkt[]) =>
    liste.length ? `<h3 style="font-size:15px;margin:20px 0 6px">${titel} (${liste.length})</h3><table cellpadding="0" cellspacing="0">${liste.map(zeile).join("")}</table>` : "";

  const unsortiertHtml = unsortiertAnzahl
    ? `<h3 style="font-size:15px;margin:20px 0 6px">Unsortierte Ideen (${unsortiertAnzahl})</h3><ul style="padding-left:18px;margin:0">` +
      unsortiert.map((u) => `<li style="font-size:14px;margin:3px 0">${esc(u.text.length > 140 ? u.text.slice(0, 140) + " …" : u.text)}</li>`).join("") +
      `</ul><p style="font-size:13px"><a href="${BACKSTAGE_URL}/inbox?typ=unsortiert" style="color:#0b1b33">Jetzt einsortieren →</a></p>`
    : "";

  const anzahl = punkte.length + unsortiertAnzahl;
  const leer = anzahl === 0 ? `<p style="font-size:14px">Nichts fällig – alles im grünen Bereich. 🎉</p>` : "";
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f;max-width:640px">` +
    `<h2 style="font-size:18px;margin:0 0 4px">${esc(e.name)}</h2>` +
    `<p style="color:#6e6e73;font-size:13px;margin:0 0 8px">${esc(formatTag(heute))}${e.vorschau_tage ? ` · Vorschau ${e.vorschau_tage} Tage` : ""}</p>` +
    block("Überfällig", ueberfaellig) +
    block("Heute", heuteP) +
    block(e.vorschau_tage ? `Nächste ${e.vorschau_tage} Tage` : "Demnächst", spaeter) +
    unsortiertHtml +
    leer +
    `<p style="font-size:12px;color:#a1a1a6;margin-top:24px">Einstellungen: <a href="${BACKSTAGE_URL}/wiedervorlage/einstellungen" style="color:#a1a1a6">Backstage → Wiedervorlage → Einstellungen</a></p></div>`;

  const teile = [
    ueberfaellig.length ? `${ueberfaellig.length} überfällig` : null,
    heuteP.length ? `${heuteP.length} heute` : null,
    spaeter.length ? `${spaeter.length} demnächst` : null,
    unsortiertAnzahl ? `${unsortiertAnzahl} unsortiert` : null,
  ].filter(Boolean);
  return { betreff: `${e.name}: ${teile.length ? teile.join(", ") : "nichts fällig"}`, html, anzahl };
}

export type VersandErgebnis = { id: string; name: string; status: "gesendet" | "nicht_dran" | "leer" | "keine_empfaenger" | "fehler"; info?: string };

export async function sendeErinnerung(e: Erinnerung, { erzwingen = false } = {}): Promise<VersandErgebnis> {
  const heute = berlinHeute();
  const supabase = getSupabaseAdmin();
  if (!erzwingen && (!e.aktiv || !istHeuteDran(e, heute) || e.zuletzt_gesendet_am === heute)) {
    return { id: e.id, name: e.name, status: "nicht_dran" };
  }
  if (!e.empfaenger.length) return { id: e.id, name: e.name, status: "keine_empfaenger" };

  try {
    const mail = await baueMail(e, heute);
    if (!erzwingen && e.nur_wenn_inhalt && mail.anzahl === 0) {
      await supabase.from("erinnerungen").update({ zuletzt_gesendet_am: heute, zuletzt_fehler: null }).eq("id", e.id);
      return { id: e.id, name: e.name, status: "leer" };
    }
    const { error } = await getResend().emails.send({
      from: ABSENDER,
      to: e.empfaenger,
      subject: erzwingen ? `[Test] ${mail.betreff}` : mail.betreff,
      html: mail.html,
    });
    if (error) throw new Error(error.message);
    if (!erzwingen) await supabase.from("erinnerungen").update({ zuletzt_gesendet_am: heute, zuletzt_fehler: null }).eq("id", e.id);
    return { id: e.id, name: e.name, status: "gesendet", info: mail.betreff };
  } catch (err: any) {
    await supabase.from("erinnerungen").update({ zuletzt_fehler: `${heute}: ${err.message}` }).eq("id", e.id);
    return { id: e.id, name: e.name, status: "fehler", info: err.message };
  }
}

export async function pruefeUndSendeErinnerungen(): Promise<VersandErgebnis[]> {
  const { data, error } = await getSupabaseAdmin().from("erinnerungen").select("*").eq("aktiv", true);
  if (error) throw new Error(error.message);
  const ergebnisse: VersandErgebnis[] = [];
  for (const e of (data || []) as Erinnerung[]) ergebnisse.push(await sendeErinnerung(e));
  return ergebnisse;
}

// ---------------------------------------------------------------------------
// Kalender-Abo (ICS). Apple Kalender, Google Kalender & Co. abonnieren die URL
// und aktualisieren selbststaendig. Apple Erinnerungen koennen keine Abos --
// deshalb Kalender statt Erinnerungen-App.

export type KalenderAbo = {
  id: string;
  name: string;
  token: string;
  aktiv: boolean;
  mit_aufgaben: boolean;
  mit_wiedervorlagen: boolean;
  mit_events: boolean;
  mit_cfp: boolean;
};

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// RFC 5545: Zeilen > 75 Oktette umbrechen, Fortsetzung beginnt mit Leerzeichen.
function falte(zeile: string): string {
  const bytes = Buffer.from(zeile, "utf8");
  if (bytes.length <= 75) return zeile;
  const teile: string[] = [];
  let rest = zeile;
  let max = 75;
  while (Buffer.byteLength(rest, "utf8") > max) {
    let n = max;
    while (Buffer.byteLength(rest.slice(0, n), "utf8") > max) n--;
    teile.push(rest.slice(0, n));
    rest = rest.slice(n);
    max = 74;
  }
  teile.push(rest);
  return teile.join("\r\n ");
}

const kompakt = (isoTag: string) => isoTag.replace(/-/g, "");

type IcsTermin = { uid: string; start: string; ende?: string | null; titel: string; beschreibung?: string | null; url: string; alarm?: boolean };

export async function baueKalender(abo: KalenderAbo): Promise<string> {
  const supabase = getSupabaseAdmin();
  const heute = berlinHeute();
  const von = tagPlus(heute, -60);
  const bis = tagPlus(heute, 400);
  const termine: IcsTermin[] = [];

  const [aufgaben, inbox, ausgaben] = await Promise.all([
    abo.mit_aufgaben
      ? supabase
          .from("aufgaben")
          .select("id, titel, faellig_am, notizen, event_ausgaben(id, jahr, event_reihen(id, name))")
          .is("erledigt_am", null)
          .is("archiviert_am", null)
          .gte("faellig_am", von)
          .lte("faellig_am", bis)
      : Promise.resolve({ data: [], error: null }),
    abo.mit_wiedervorlagen
      ? supabase
          .from("inbox_eintraege")
          .select("id, titel, text, wiedervorlage_am")
          .gte("wiedervorlage_am", von)
          .lte("wiedervorlage_am", bis)
          .not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`)
      : Promise.resolve({ data: [], error: null }),
    abo.mit_events || abo.mit_cfp
      ? supabase
          .from("event_ausgaben")
          .select("id, jahr, datum_start, datum_ende, ort, cfp_start, cfp_ende, teilnahme, event_reihen!inner(id, name, archiviert_am)")
          .is("archiviert_am", null)
          .is("event_reihen.archiviert_am", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [aufgaben, inbox, ausgaben]) if (r.error) throw new Error(r.error.message);

  for (const a of (aufgaben.data || []) as any[]) {
    const ausgabe = a.event_ausgaben;
    termine.push({
      uid: `aufgabe-${a.id}`,
      start: a.faellig_am,
      titel: `☐ ${a.titel}`,
      beschreibung: [ausgabe ? `${ausgabe.event_reihen?.name} ${ausgabe.jahr}` : null, a.notizen].filter(Boolean).join("\n") || null,
      url: ausgabe ? `${BACKSTAGE_URL}/events/${ausgabe.event_reihen?.id}#ausgabe-${ausgabe.id}` : `${BACKSTAGE_URL}/wiedervorlage`,
      alarm: true,
    });
  }
  for (const e of (inbox.data || []) as any[]) {
    termine.push({
      uid: `wiedervorlage-${e.id}`,
      start: e.wiedervorlage_am,
      titel: `💡 ${(e.titel || e.text).slice(0, 120)}`,
      beschreibung: e.titel ? e.text : null,
      url: `${BACKSTAGE_URL}/inbox?wv=gesetzt`,
      alarm: true,
    });
  }
  for (const a of (ausgaben.data || []) as any[]) {
    const name = `${a.event_reihen.name} ${a.jahr}`;
    const url = `${BACKSTAGE_URL}/events/${a.event_reihen.id}#ausgabe-${a.id}`;
    if (abo.mit_events && a.datum_start && a.datum_start >= von && a.datum_start <= bis && a.teilnahme !== "nicht_moeglich") {
      termine.push({ uid: `event-${a.id}`, start: a.datum_start, ende: a.datum_ende, titel: `🎤 ${name}`, beschreibung: a.ort, url });
    }
    if (abo.mit_cfp && a.cfp_start && a.cfp_start >= von && a.cfp_start <= bis) {
      termine.push({ uid: `cfp-start-${a.id}`, start: a.cfp_start, titel: `CfP öffnet: ${name}`, url, alarm: true });
    }
    if (abo.mit_cfp && a.cfp_ende && a.cfp_ende >= von && a.cfp_ende <= bis) {
      termine.push({ uid: `cfp-ende-${a.id}`, start: a.cfp_ende, titel: `⚠️ CfP-Deadline: ${name}`, url, alarm: true });
    }
  }

  const stempel = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AgencyUplifted//Backstage Wiedervorlage//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(`AgencyUplifted – ${abo.name}`)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const t of termine) {
    // Ganztags-Termine: DTEND ist exklusiv, also Folgetag des letzten Tages.
    const ende = tagPlus(t.ende && t.ende > t.start ? t.ende : t.start, 1);
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${t.uid}@backstage.agencyuplifted.com`,
      `DTSTAMP:${stempel}`,
      `DTSTART;VALUE=DATE:${kompakt(t.start)}`,
      `DTEND;VALUE=DATE:${kompakt(ende)}`,
      `SUMMARY:${icsText(t.titel)}`,
      ...(t.beschreibung ? [`DESCRIPTION:${icsText(t.beschreibung)}`] : []),
      `URL:${t.url}`,
      "TRANSP:TRANSPARENT"
    );
    if (t.alarm) {
      // 9:00 Uhr am Tag selbst -- Apple zeigt Alarme aus Abos nur, wenn man
      // beim Abonnieren "Hinweise entfernen" ausschaltet.
      zeilen.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(t.titel)}`, "TRIGGER:PT9H", "END:VALARM");
    }
    zeilen.push("END:VEVENT");
  }
  zeilen.push("END:VCALENDAR");
  return zeilen.map(falte).join("\r\n") + "\r\n";
}
