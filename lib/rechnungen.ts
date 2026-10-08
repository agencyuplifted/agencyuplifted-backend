import { getResend, ABSENDER } from "./email";
import { formatDatum, formatEUR, MWST_SATZ } from "./format";
import { ladeBausteine, baueMailHtml } from "./mail-bausteine";
import { bestaetigeBuchungIntern } from "./buchung-bestaetigen";
import {
  fastbillKundenSuchen,
  fastbillKundeHolen,
  fastbillKundeAnlegen,
  fastbillEntwurfAnlegen,
  fastbillRechnungFertigstellen,
  fastbillRechnungHolen,
  fastbillEntwurfLoeschen,
  fastbillRechnungStornieren,
  fastbillZahlungsstand,
  fastbillDokumentLaden,
} from "./fastbill";

// Seminar-Rechnungen: Backstage baut den Entwurf in FastBill, Markus prueft und
// gibt frei, der Versand laeuft ueber Resend (nicht FastBills sendbyemail), der
// Zahlungsstand kommt per Abgleich zurueck (Markus 10/2026). Tabelle
// buchung_rechnungen -- bewusst getrennt von fastbill_rechnungen, deren
// "status" die Zuordnung (offen/zugeordnet/ignoriert) beim Import meint.
//
// Empfaenger = Rechnungsempfaenger der Buchung: Organisation der Buchung,
// sonst der Rechnungsempfaenger-Teilnehmer privat (Entscheidung Markus).
// Paket-Buchungen und Freiplaetze bekommen nie eine Rechnung.

const AKTIV = ["entwurf", "wird_freigegeben", "freigegeben", "versendet"];

type Empfaenger = {
  typ: "business" | "consumer";
  organisation_id: string | null;
  teilnehmer_id: string | null;
  firma: string | null;
  vorname: string;
  nachname: string;
  email: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;
  ust_id: string | null;
  fastbill_customer_id: string | null;
};

type Position = { beschreibung: string; menge: number; einzelpreis: number; ust_prozent: number };

// FastBill erwartet ISO-Laendercodes; gepflegt wird Klartext (Standard Deutschland).
function laenderCode(land: string | null | undefined): string {
  const l = String(land || "").trim().toLowerCase();
  if (!l || l.startsWith("deutsch") || l === "de" || l === "germany") return "DE";
  if (l.startsWith("österreich") || l.startsWith("oesterreich") || l === "at" || l === "austria") return "AT";
  if (l.startsWith("schweiz") || l === "ch" || l === "switzerland") return "CH";
  return l.length === 2 ? l.toUpperCase() : "DE";
}

async function ladeBuchung(supabase: any, buchungId: string) {
  const { data: b, error } = await supabase
    .from("buchungen")
    .select(
      "id, buchungsnummer, status, metadata, organisation_id, " +
        "organisationen(id, name, rechnungsadresse_strasse, rechnungsadresse_plz, rechnungsadresse_ort, rechnungsadresse_land, ust_id, fastbill_customer_id), " +
        "rechnungsempfaenger:rechnungsempfaenger_teilnehmer_id(id, vorname, nachname, email, privatadresse_strasse, privatadresse_plz, privatadresse_ort, privatadresse_land, fastbill_customer_id), " +
        "buchungspositionen(id, beschreibung, listenpreis, rabatt_betrag, preis, metadata, teilnehmer(id, vorname, nachname, email), " +
        "seminartermin_optionen(titel, rechnung_leistungstext, preisstaffeln(name, preis)), " +
        "seminartermine(id, kennung, titel, datum_start, datum_ende, vorabend_anreise_datum, vorabendanreise_inklusive, veranstaltungsorte(name, ort, nahe_grossstadt), " +
        "seminartypen(name, rechnung_positionsvorlage, rechnung_fastbill_template_id, rechnung_einleitung)), programme(name), programm_optionen(titel))"
    )
    .eq("id", buchungId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!b) throw new Error("Buchung nicht gefunden.");
  return b;
}

function empfaengerAus(b: any): Empfaenger {
  const re = b.rechnungsempfaenger;
  // Ohne Rechnungsempfaenger-Teilnehmer: erster Teilnehmer der Buchung als Kontakt
  const kontakt = re || (b.buchungspositionen || []).find((p: any) => p.teilnehmer)?.teilnehmer || null;
  const o = b.organisationen;
  if (o) {
    return {
      typ: "business",
      organisation_id: o.id,
      teilnehmer_id: kontakt?.id || null,
      firma: o.name,
      vorname: kontakt?.vorname || "",
      nachname: kontakt?.nachname || "",
      email: kontakt?.email || null,
      strasse: o.rechnungsadresse_strasse || null,
      plz: o.rechnungsadresse_plz || null,
      ort: o.rechnungsadresse_ort || null,
      land: laenderCode(o.rechnungsadresse_land),
      ust_id: o.ust_id || null,
      fastbill_customer_id: o.fastbill_customer_id || null,
    };
  }
  return {
    typ: "consumer",
    organisation_id: null,
    teilnehmer_id: kontakt?.id || null,
    firma: null,
    vorname: kontakt?.vorname || "",
    nachname: kontakt?.nachname || "",
    email: kontakt?.email || null,
    strasse: re?.privatadresse_strasse || null,
    plz: re?.privatadresse_plz || null,
    ort: re?.privatadresse_ort || null,
    land: laenderCode(re?.privatadresse_land),
    ust_id: null,
    fastbill_customer_id: re?.fastbill_customer_id || null,
  };
}

function zeitraum(t: any): string {
  if (!t?.datum_start) return "";
  return t.datum_ende && t.datum_ende !== t.datum_start ? `${formatDatum(t.datum_start)} – ${formatDatum(t.datum_ende)}` : formatDatum(t.datum_start);
}

// ---------------------------------------------------------------------------
// Positionstexte aus Vorlagen (Markus 10/2026: "wir koennen nicht nur die
// Option reinmachen"). Pro Seminarkategorie eine Vorlage mit Platzhaltern
// (seminartypen.rechnung_positionsvorlage), pro Option ein Leistungstext
// (seminartermin_optionen.rechnung_leistungstext). Zeilen, deren Platzhalter
// leer bleiben, fallen weg (z. B. "Anreise am Vorabend" ohne Vorabend).
// Keine Teilnehmernamen auf der Rechnung (Entscheidung Markus).

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const ZAHLWORT = ["keine", "eine", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
const teile = (iso: string) => ({ t: Number(iso.slice(8, 10)), m: Number(iso.slice(5, 7)), j: Number(iso.slice(0, 4)) });
const datumLang = (iso: string) => {
  const d = teile(iso);
  return `${d.t}. ${MONATE[d.m - 1]} ${d.j}`;
};
const tageZwischen = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const tagMinus = (iso: string, n: number) => new Date(Date.parse(iso) - n * 86400000).toISOString().slice(0, 10);

// "25. bis 27. November 2026", "14. und 15. April 2027", "30. November bis 2. Dezember 2026"
export function zeitraumRechnung(start: string, ende?: string | null): string {
  if (!ende || ende === start) return datumLang(start);
  const a = teile(start);
  const e = teile(ende);
  if (a.j === e.j && a.m === e.m) return `${a.t}. ${tageZwischen(start, ende) === 1 ? "und" : "bis"} ${e.t}. ${MONATE[e.m - 1]} ${e.j}`;
  if (a.j === e.j) return `${a.t}. ${MONATE[a.m - 1]} bis ${datumLang(ende)}`;
  return `${datumLang(start)} bis ${datumLang(ende)}`;
}

export function fuelleRechnungsvorlage(vorlage: string, werte: Record<string, string>): string {
  const zeilen = vorlage.split(/\r?\n/).flatMap((zeile) => {
    const platzhalter = [...zeile.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const ersetzt = zeile.replace(/\{\{(\w+)\}\}/g, (_, k) => werte[k] ?? "");
    // Zeile nur aus leeren Platzhaltern (+ Satzzeichen/Klammern) -> weg
    if (platzhalter.length && platzhalter.every((k) => !werte[k])) return [];
    return ersetzt.split(/\r?\n/);
  });
  return zeilen.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Text fuer FastBill: die Postentabelle versteht einfaches HTML (<b>, <i>, <br>),
// deshalb erst & < > maskieren, dann **fett** -> <b>. Umbrueche als \r\n wie in
// Markus' von Hand geschriebenen Rechnungen -- mit nacktem \n sahen sie im
// Entwurf "komisch" aus (Markus 10/2026).
//
// Geschuetzte Leerzeichen, damit FastBill in der schmalen Positionsspalte nicht
// mitten in Datum und Betrag umbricht ("25." | "bis 27." oder "4.360,00" |
// "€ netto", Markus 10/2026): als &nbsp;, weil die Postentabelle HTML versteht.
const MONATS_RE = "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember";
const NBSP = "\u00A0";

export function schuetzeZahlenUndDaten(text: string): string {
  return text
    .replace(new RegExp(`(\\d{1,2}\\.) +(bis|und) +(\\d{1,2}\\.)`, "g"), `$1${NBSP}$2${NBSP}$3`)
    .replace(new RegExp(`(\\d{1,2}\\.) +(${MONATS_RE})`, "g"), `$1${NBSP}$2`)
    .replace(new RegExp(`(${MONATS_RE}) +(\\d{4})`, "g"), `$1${NBSP}$2`)
    .replace(/(\d) +(€|EUR|Euro|Uhr|%)/g, `$1${NBSP}$2`)
    .replace(/€ +(netto|brutto)/g, `€${NBSP}$1`)
    .replace(/(Preisstufe|Rate) +(\d+) +von +(\d+)/g, `$1${NBSP}$2${NBSP}von${NBSP}$3`);
}

export function textFuerFastbill(text: string): string {
  return schuetzeZahlenUndDaten(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\u00A0/g, "&nbsp;")
    .replace(/\r?\n/g, "\r\n");
}

type Textvorgaben = { einleitung: string | null; preisstufeVorlage: string; positionsvorlage: string | null; zusatzVorlage: string };

const STANDARD_POSITION = "Seminar {{seminartitel}}\n{{zeitraum}}\n{{ort}}\n\n{{leistungen}}\n\n{{preisstufe}}";
const STANDARD_ZUSATZ = "Weitere Teilnehmer aus Deiner Agentur\nSeminar {{seminartitel}}, {{zeitraum}}\nLeistungen wie oben";
const STANDARD_PREISSTUFE = "Frühbucherpreis – Preisstufe {{stufe}} von {{stufen}} (Normalpreis {{normalpreis}} netto)";

function terminWerte(t: any, opt: any, vorgaben: Textvorgaben, listenpreis: number, gewaehlt?: any): Record<string, string> {
  // Vorabend: gepflegter Anreisetag, sonst bei inkl. Vorabendanreise der Tag vor dem Start
  const vorabendISO = t.vorabendanreise_inklusive ? (t.vorabend_anreise_datum ? String(t.vorabend_anreise_datum).slice(0, 10) : tagMinus(t.datum_start, 1)) : null;
  const naechte = Math.max(0, tageZwischen(vorabendISO || t.datum_start, t.datum_ende || t.datum_start));
  const vo = t.veranstaltungsorte;
  // Preisstufe: keine "Rabatt"-Logik -- der Fruehbucherpreis IST das Entgelt
  // (§ 14 Abs. 4 Nr. 7 UStG verlangt nur nicht schon eingerechnete Minderungen).
  // Die Info-Zeile macht die Preisdifferenzierung fuer den Kunden nachvollziehbar.
  const preise = [...new Set(((opt?.preisstaffeln || []) as any[]).map((s) => Number(s.preis || 0)).filter((x) => x > 0))].sort((x, y) => x - y);
  const normalpreis = preise.length ? preise[preise.length - 1] : 0;
  const stufe = preise.findIndex((x) => Math.abs(x - listenpreis) < 0.005) + 1;
  // Bei der Buchung bewusst gewaehlte Stufe (ggf. aus anderem Termin) hat Vorrang
  const preisstufe = gewaehlt?.normalpreis && listenpreis < Number(gewaehlt.normalpreis) - 0.005
    ? fuelleRechnungsvorlage(vorgaben.preisstufeVorlage, { stufe: String(gewaehlt.stufe || ""), stufen: String(gewaehlt.stufen || ""), normalpreis: formatEUR(Number(gewaehlt.normalpreis)) })
    : opt && normalpreis && stufe && listenpreis < normalpreis - 0.005
      ? fuelleRechnungsvorlage(vorgaben.preisstufeVorlage, {
          stufe: stufe ? String(stufe) : "",
          stufen: String(preise.length),
          normalpreis: formatEUR(normalpreis),
        })
      : "";
  return {
    seminartitel: t.titel || t.seminartypen?.name || "Seminar",
    kennung: t.kennung || "",
    option: opt?.titel || "",
    zeitraum: zeitraumRechnung(String(t.datum_start).slice(0, 10), t.datum_ende ? String(t.datum_ende).slice(0, 10) : null),
    ort: vo ? `${vo.name || vo.ort || ""}${vo.nahe_grossstadt ? ` (bei ${vo.nahe_grossstadt})` : ""}` : "",
    vorabend: vorabendISO ? datumLang(vorabendISO) : "",
    uebernachtungen: naechte ? `${ZAHLWORT[naechte] || naechte} Übernachtung${naechte === 1 ? "" : "en"}` : "",
    leistungen: opt?.rechnung_leistungstext || "",
    preisstufe,
  };
}

function positionenAus(b: any, vorgaben: Textvorgaben): { positionen: Position[]; raten: { anzahl: number; netto: number } | null } {
  const ust = Math.round(MWST_SATZ * 100);
  const roh: Position[] = [];
  const raten = { anzahl: 0, netto: 0 };
  const alle = (b.buchungspositionen || []) as any[];

  // Pro Termin+Option: teuerste Person = Hauptposition (volle Vorlage), alle
  // weiteren = "Weitere Teilnehmer aus Deiner Agentur" (eigener, meist
  // guenstigerer Preis). Keine Namen auf der Rechnung (Entscheidung Markus).
  const gruppen = new Map<string, any[]>();
  for (const p of alle) {
    if (!p.seminartermine || !p.seminartermin_optionen) continue;
    const k = `${p.seminartermine.id}|${p.seminartermin_optionen.titel}`;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k)!.push(p);
  }
  const istZusatz = new Set<string>();
  for (const liste of gruppen.values()) {
    liste.sort((x, y) => Number(y.listenpreis || 0) - Number(x.listenpreis || 0));
    liste.slice(1).forEach((p) => istZusatz.add(p.id));
  }

  for (const p of alle) {
    const preis = Number(p.preis ?? 0);
    const t = p.seminartermine;
    const opt = p.seminartermin_optionen;
    let text: string;
    if (t) {
      const werte = { ...terminWerte(t, opt, vorgaben, Number(p.listenpreis || 0), p.metadata?.preisstufe), beschreibung: p.beschreibung || "" };
      const vorlage = !opt
        ? "{{beschreibung}}\n{{seminartitel}}, {{zeitraum}}" // z. B. Zimmer-Upgrade
        : istZusatz.has(p.id)
          ? vorgaben.zusatzVorlage
          : t.seminartypen?.rechnung_positionsvorlage || vorgaben.positionsvorlage || STANDARD_POSITION;
      text = fuelleRechnungsvorlage(vorlage, istZusatz.has(p.id) ? { ...werte, preisstufe: "" } : werte);
    } else if (p.programme) {
      text = `${p.programme.name}${p.programm_optionen?.titel ? ` – ${p.programm_optionen.titel}` : ""}`;
    } else {
      text = p.beschreibung || "Leistung";
    }
    // Individuell vereinbarter Nachlass (rabatt_betrag) ist eine echte
    // Entgeltminderung und wird ausgewiesen -- anders als die Preisstufe.
    const rabatt = Number(p.rabatt_betrag || 0);
    if (rabatt > 0) text += `\nabzüglich ${formatEUR(rabatt)} Nachlass (Listenpreis ${formatEUR(Number(p.listenpreis || 0))})`;
    roh.push({ beschreibung: text, menge: 1, einzelpreis: Math.round(preis * 100) / 100, ust_prozent: ust });
    if (p.metadata?.zahlweise === "raten" && Number(p.metadata?.anzahl_raten) > 1) {
      raten.anzahl = Number(p.metadata.anzahl_raten);
      raten.netto += preis;
    }
  }
  // Gleiche Leistung zum gleichen Preis -> eine Position mit Menge (Anzahl Teilnehmer)
  const positionen: Position[] = [];
  for (const p of roh) {
    const gleich = positionen.find((x) => x.beschreibung === p.beschreibung && x.einzelpreis === p.einzelpreis);
    if (gleich) gleich.menge += 1;
    else positionen.push({ ...p });
  }
  return { positionen, raten: raten.anzahl ? raten : null };
}

// Zahlungsplan fuer Ratenzahlung: eine Rechnung ueber den Gesamtbetrag, die
// Raten als Text (Markus erfasst jede Rate in FastBill als Teilzahlung, der
// Abgleich zeigt "teilbezahlt"). Bruttobetraege, Rundungsrest in der letzten Rate.
export function zahlungsplanText(anzahl: number, nettoGesamt: number): string {
  const brutto = Math.round(nettoGesamt * (1 + MWST_SATZ) * 100);
  const rate = Math.floor(brutto / anzahl);
  const faellig = ["bei Erhalt der Rechnung", "einen Monat später", "zwei Monate später", "drei Monate später", "vier Monate später", "fünf Monate später"];
  const zeilen = Array.from({ length: anzahl }, (_, i) => {
    const betrag = i === anzahl - 1 ? brutto - rate * (anzahl - 1) : rate;
    return `Rate ${i + 1} von ${anzahl}: ${formatEUR(betrag / 100)} – fällig ${faellig[i] || `${i} Monate später`}`;
  });
  return `Zahlungsplan (Ratenzahlung, Beträge inkl. USt.):\n${zeilen.join("\n")}`;
}

async function ladeTextvorgaben(supabase: any, b: any): Promise<Textvorgaben & { templateId: string | null }> {
  const { data: konf } = await supabase
    .from("finanz_konfiguration")
    .select("fastbill_template_id, rechnung_einleitung, rechnung_preisstufe_text, rechnung_positionsvorlage, rechnung_zusatz_vorlage")
    .eq("id", 1)
    .maybeSingle();
  const typ = (b.buchungspositionen || []).find((p: any) => p.seminartermine)?.seminartermine?.seminartypen;
  // Standard fuer alle Seminare aus den Einstellungen; eine Kategorie weicht nur
  // ab, wenn dort etwas eingetragen ist (z. B. Konferenz).
  return {
    einleitung: typ?.rechnung_einleitung || konf?.rechnung_einleitung || null,
    preisstufeVorlage: konf?.rechnung_preisstufe_text || STANDARD_PREISSTUFE,
    positionsvorlage: konf?.rechnung_positionsvorlage || null,
    zusatzVorlage: konf?.rechnung_zusatz_vorlage || STANDARD_ZUSATZ,
    templateId: typ?.rechnung_fastbill_template_id || konf?.fastbill_template_id || null,
  };
}

// Bestehenden FastBill-Kunden wiedererkennen (gespeicherte ID, sonst Suche nach
// Firma bzw. E-Mail), sonst anlegen -- und die ID in Backstage merken, damit
// kuenftige Buchungen denselben Kunden nehmen statt Dubletten anzulegen.
async function sichereFastbillKunde(supabase: any, e: Empfaenger): Promise<string> {
  if (e.fastbill_customer_id) {
    const k = await fastbillKundeHolen(e.fastbill_customer_id).catch(() => null);
    if (k) return e.fastbill_customer_id;
  }
  let id: string | null = null;
  const norm = (x: any) => String(x || "").trim().toLowerCase();
  if (e.typ === "business" && e.firma) {
    const treffer = await fastbillKundenSuchen(e.firma);
    id = treffer.find((k) => norm(k.ORGANIZATION) === norm(e.firma))?.CUSTOMER_ID ?? null;
  } else if (e.email) {
    const treffer = await fastbillKundenSuchen(e.email);
    id = treffer.find((k) => norm(k.EMAIL) === norm(e.email) && !String(k.ORGANIZATION || "").trim())?.CUSTOMER_ID ?? null;
  }
  if (!id) {
    id = await fastbillKundeAnlegen({
      CUSTOMER_TYPE: e.typ,
      ...(e.typ === "business" ? { ORGANIZATION: e.firma } : {}),
      FIRST_NAME: e.vorname,
      LAST_NAME: e.nachname || e.vorname || e.firma,
      ADDRESS: e.strasse,
      ZIPCODE: e.plz,
      CITY: e.ort,
      COUNTRY_CODE: e.land,
      EMAIL: e.email,
      ...(e.ust_id ? { VAT_ID: e.ust_id } : {}),
      PAYMENT_TYPE: 1,
      // Seminarrechnungen sind sofort faellig (Markus 10/2026). Nur bei neu
      // angelegten Kunden -- bestehende behalten ihr Zahlungsziel aus FastBill.
      DAYS_FOR_PAYMENT: 0,
    });
  }
  const kundenId = String(id);
  if (e.typ === "business" && e.organisation_id) await supabase.from("organisationen").update({ fastbill_customer_id: kundenId }).eq("id", e.organisation_id);
  else if (e.teilnehmer_id) await supabase.from("teilnehmer").update({ fastbill_customer_id: kundenId }).eq("id", e.teilnehmer_id);
  return kundenId;
}

export async function aktiveRechnung(supabase: any, buchungId: string) {
  const { data } = await supabase.from("buchung_rechnungen").select("*").eq("buchung_id", buchungId).in("status", AKTIV).maybeSingle();
  return data;
}

// Vorschau ohne FastBill-Aufruf (Buchungsseite, bevor ein Entwurf existiert).
export async function rechnungsVorschau(supabase: any, buchungId: string) {
  const b = await ladeBuchung(supabase, buchungId);
  const empfaenger = empfaengerAus(b);
  const vorgaben = await ladeTextvorgaben(supabase, b);
  const { positionen, raten } = positionenAus(b, vorgaben);
  const ratenhinweis = raten ? zahlungsplanText(raten.anzahl, raten.netto) : null;
  const einleitung = [vorgaben.einleitung, ratenhinweis].filter(Boolean).join("\n\n") || null;
  const netto = positionen.reduce((s, p) => s + p.einzelpreis * p.menge, 0);
  const fehlt: string[] = [];
  if (!empfaenger.strasse || !empfaenger.plz || !empfaenger.ort) fehlt.push(empfaenger.typ === "business" ? `Rechnungsadresse der Organisation „${empfaenger.firma}“` : "Rechnungsadresse (Privatadresse) des Rechnungsempfängers");
  if (!empfaenger.email) fehlt.push("E-Mail-Adresse des Rechnungsempfängers");
  if (!positionen.length) fehlt.push("Positionen");
  const art = b.metadata?.buchungsart;
  const keineRechnung = art === "paket" ? "Paket-Buchung – keine eigene Rechnung." : art === "freiplatz" ? "Freiplatz – keine Rechnung." : b.status === "storniert" ? "Buchung ist storniert." : null;
  return { buchung: b, empfaenger, positionen, raten, ratenhinweis, einleitung, templateId: vorgaben.templateId, netto, brutto: Math.round(netto * (1 + MWST_SATZ) * 100) / 100, fehlt, keineRechnung };
}

export async function erstelleRechnungsentwurf(supabase: any, buchungId: string, bearbeiter: string): Promise<{ id: string; fastbillInvoiceId: string }> {
  const vorhanden = await aktiveRechnung(supabase, buchungId);
  if (vorhanden) throw new Error("Für diese Buchung gibt es schon eine Rechnung.");
  const v = await rechnungsVorschau(supabase, buchungId);
  if (v.keineRechnung) throw new Error(v.keineRechnung);
  if (v.fehlt.length) throw new Error(`Es fehlt: ${v.fehlt.join(", ")}.`);

  // Platz zuerst in Backstage reservieren (Unique-Index auf aktive Rechnung):
  // ein Doppelklick scheitert hier, bevor in FastBill ein zweiter Entwurf entsteht.
  const { data: zeile, error: insErr } = await supabase
    .from("buchung_rechnungen")
    .insert({
      buchung_id: buchungId,
      status: "entwurf",
      empfaenger: v.empfaenger,
      empfaenger_email: v.empfaenger.email,
      positionen: v.positionen,
      raten_anzahl: v.raten?.anzahl || null,
      betrag_netto: v.netto,
      betrag_brutto: v.brutto,
      erstellt_von: bearbeiter,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.code === "23505" ? "Für diese Buchung gibt es schon eine Rechnung." : insErr.message);

  try {
    const kundenId = await sichereFastbillKunde(supabase, v.empfaenger);
    const termin = (v.buchung.buchungspositionen || []).find((p: any) => p.seminartermine)?.seminartermine;
    const einleitung = v.einleitung;
    const invoiceId = await fastbillEntwurfAnlegen({
      CUSTOMER_ID: kundenId,
      ...(v.templateId ? { TEMPLATE_ID: v.templateId } : {}),
      ...(termin ? { INVOICE_TITLE: `Seminar ${termin.kennung || termin.titel || ""}`.trim(), SERVICE_PERIOD_START: termin.datum_start, SERVICE_PERIOD_END: termin.datum_ende || termin.datum_start } : {}),
      ...(einleitung ? { INTROTEXT: textFuerFastbill(einleitung) } : {}),
      ORDER_REFERENCE: v.buchung.buchungsnummer || undefined,
      ITEMS: v.positionen.map((p) => ({ DESCRIPTION: textFuerFastbill(p.beschreibung), QUANTITY: p.menge, UNIT_PRICE: p.einzelpreis, VAT_PERCENT: p.ust_prozent })),
    });
    await supabase.from("buchung_rechnungen").update({ fastbill_invoice_id: invoiceId, fastbill_customer_id: kundenId, einleitung, ratenhinweis: v.ratenhinweis }).eq("id", zeile.id);
    await supabase.from("aenderungsprotokoll").insert({ bezug_typ: "buchung", bezug_id: buchungId, ereignis: "rechnung_entwurf", beschreibung: `Rechnungsentwurf in FastBill angelegt (${formatEUR(v.netto)} netto).`, bearbeiter });
    return { id: zeile.id, fastbillInvoiceId: invoiceId };
  } catch (e: any) {
    // Reservierung zuruecknehmen, damit ein neuer Versuch moeglich ist
    await supabase.from("buchung_rechnungen").delete().eq("id", zeile.id);
    throw e;
  }
}

// PDF der fertigen Rechnung: DOCUMENT_URL aus invoice.get.
async function ladePdf(url: string): Promise<Buffer> {
  return fastbillDokumentLaden(url);
}

export async function sendeRechnungsmail(supabase: any, rechnungId: string): Promise<void> {
  const { data: r } = await supabase.from("buchung_rechnungen").select("*").eq("id", rechnungId).maybeSingle();
  if (!r || !["freigegeben", "versendet"].includes(r.status)) throw new Error("Rechnung ist noch nicht freigegeben.");
  if (!r.empfaenger_email) throw new Error("Keine E-Mail-Adresse für den Rechnungsempfänger.");
  if (!r.dokument_url) throw new Error("Kein PDF zur Rechnung vorhanden.");
  const pdf = await ladePdf(r.dokument_url);
  const b = await ladeBuchung(supabase, r.buchung_id);
  const termin = (b.buchungspositionen || []).find((p: any) => p.seminartermine)?.seminartermine;
  const leistung = termin ? `${termin.titel || termin.seminartypen?.name || "Seminar"} (${zeitraum(termin)})` : "Deine Buchung";
  const vorname = r.empfaenger?.vorname || "";
  const text =
    `Hallo${vorname ? ` ${vorname}` : ""},\n\n` +
    `anbei erhältst Du die Rechnung ${r.rechnungsnummer} für ${leistung}.` +
    (r.ratenhinweis ? `\n\n${r.ratenhinweis}` : "") +
    `\n\nBei Fragen antworte einfach auf diese Mail.`;
  const bausteine = await ladeBausteine(supabase);
  const { data, error } = await getResend().emails.send({
    from: ABSENDER,
    to: [r.empfaenger_email],
    subject: `Rechnung ${r.rechnungsnummer} – ${termin?.kennung || "AgencyUplifted"}`,
    html: baueMailHtml(text, bausteine, { signatur: true, rechtliches: true, abmelden: false }, null),
    attachments: [{ filename: `Rechnung-${r.rechnungsnummer}.pdf`, content: pdf }],
  });
  if (error) throw new Error(`Versand fehlgeschlagen: ${error.message}`);
  await supabase.from("buchung_rechnungen").update({ status: "versendet", versendet_am: new Date().toISOString(), resend_email_id: data?.id || null, fehler: null }).eq("id", rechnungId);
}

// Freigabe: Entwurf in FastBill fertigstellen (vergibt die Rechnungsnummer),
// PDF holen, per Resend verschicken. Sperre ueber den Status, damit ein
// Doppelklick nicht zweimal fertigstellt.
export async function gibRechnungFrei(supabase: any, rechnungId: string, bearbeiter: string): Promise<{ rechnungsnummer: string; versendet: boolean; fehler: string | null }> {
  const { data: gesperrt } = await supabase
    .from("buchung_rechnungen")
    .update({ status: "wird_freigegeben", fehler: null })
    .eq("id", rechnungId)
    .eq("status", "entwurf")
    .select("*")
    .maybeSingle();
  if (!gesperrt) throw new Error("Diese Rechnung ist kein offener Entwurf (mehr).");
  if (!gesperrt.fastbill_invoice_id) {
    await supabase.from("buchung_rechnungen").update({ status: "entwurf" }).eq("id", rechnungId);
    throw new Error("Entwurf ohne FastBill-ID.");
  }
  try {
    await fastbillRechnungFertigstellen(gesperrt.fastbill_invoice_id);
  } catch (e: any) {
    await supabase.from("buchung_rechnungen").update({ status: "entwurf", fehler: e?.message || "Freigabe fehlgeschlagen." }).eq("id", rechnungId);
    throw e;
  }
  const inv = await fastbillRechnungHolen(gesperrt.fastbill_invoice_id);
  const rechnungsnummer = String(inv?.INVOICE_NUMBER ?? "");
  await supabase
    .from("buchung_rechnungen")
    .update({
      status: "freigegeben",
      rechnungsnummer,
      dokument_url: inv?.DOCUMENT_URL || null,
      faellig_am: /^\d{4}-\d{2}-\d{2}/.test(String(inv?.DUE_DATE || "")) && !String(inv.DUE_DATE).startsWith("0000") ? String(inv.DUE_DATE).slice(0, 10) : null,
      betrag_netto: inv?.SUB_TOTAL != null ? Number(inv.SUB_TOTAL) : gesperrt.betrag_netto,
      betrag_brutto: inv?.TOTAL != null ? Number(inv.TOTAL) : gesperrt.betrag_brutto,
      freigegeben_am: new Date().toISOString(),
    })
    .eq("id", rechnungId);
  await supabase.from("aenderungsprotokoll").insert({ bezug_typ: "buchung", bezug_id: gesperrt.buchung_id, ereignis: "rechnung_freigegeben", beschreibung: `Rechnung ${rechnungsnummer} freigegeben.`, bearbeiter });
  try {
    await sendeRechnungsmail(supabase, rechnungId);
    return { rechnungsnummer, versendet: true, fehler: null };
  } catch (e: any) {
    const fehler = e?.message || "Versand fehlgeschlagen.";
    await supabase.from("buchung_rechnungen").update({ fehler }).eq("id", rechnungId);
    return { rechnungsnummer, versendet: false, fehler };
  }
}

// Entwurf verwerfen (nur Entwuerfe -- fertige Rechnungen bleiben, Storno s. u.).
export async function verwirfEntwurf(supabase: any, rechnungId: string, bearbeiter: string): Promise<void> {
  const { data: r } = await supabase.from("buchung_rechnungen").select("*").eq("id", rechnungId).maybeSingle();
  if (!r || r.status !== "entwurf") throw new Error("Nur Entwürfe lassen sich verwerfen.");
  if (r.fastbill_invoice_id) await fastbillEntwurfLoeschen(r.fastbill_invoice_id);
  await supabase.from("buchung_rechnungen").update({ status: "geloescht", geloescht_am: new Date().toISOString() }).eq("id", rechnungId);
  await supabase.from("aenderungsprotokoll").insert({ bezug_typ: "buchung", bezug_id: r.buchung_id, ereignis: "rechnung_verworfen", beschreibung: "Rechnungsentwurf verworfen (in FastBill gelöscht).", bearbeiter });
}

// Storno einer Buchung: Entwurf loeschen; fertige, unbezahlte Rechnung in
// FastBill stornieren (invoice.cancel); bezahlte/teilbezahlte NIE automatisch
// -- Rueckerstattung ist ein manueller Fall, nur Hinweis.
export async function behandleRechnungBeiStorno(supabase: any, buchungId: string, bearbeiter: string): Promise<string | null> {
  const r = await aktiveRechnung(supabase, buchungId);
  if (!r) return null;
  if (r.status === "entwurf") {
    await verwirfEntwurf(supabase, r.id, bearbeiter);
    return "Rechnungsentwurf in FastBill gelöscht.";
  }
  if (r.zahlungsstatus !== "offen") {
    const hinweis = `Rechnung ${r.rechnungsnummer} ist ${r.zahlungsstatus} – nicht automatisch storniert, Rückerstattung bitte manuell klären.`;
    await supabase.from("buchung_rechnungen").update({ hinweis }).eq("id", r.id);
    return hinweis;
  }
  if (r.fastbill_invoice_id && ["freigegeben", "versendet"].includes(r.status)) {
    await fastbillRechnungStornieren(r.fastbill_invoice_id);
    await supabase.from("buchung_rechnungen").update({ status: "storniert", storniert_am: new Date().toISOString() }).eq("id", r.id);
    await supabase.from("aenderungsprotokoll").insert({ bezug_typ: "buchung", bezug_id: buchungId, ereignis: "rechnung_storniert", beschreibung: `Rechnung ${r.rechnungsnummer} in FastBill storniert.`, bearbeiter });
    return `Rechnung ${r.rechnungsnummer} in FastBill storniert.`;
  }
  return null;
}

// Zahlungsabgleich: fertige Rechnungen in FastBill nachsehen. Bezahlt oder
// teilbezahlt (erste Rate) -> Buchung automatisch bestaetigen wie per Klick
// (Zahlungsbestaetigungs-Mail, Funnel startet; Entscheidung Markus 10/2026).
export async function pruefeRechnungszahlungen(supabase: any, nurBuchungId?: string) {
  let q = supabase.from("buchung_rechnungen").select("id, buchung_id, fastbill_invoice_id, zahlungsstatus, rechnungsnummer").in("status", ["freigegeben", "versendet"]).neq("zahlungsstatus", "bezahlt");
  if (nurBuchungId) q = q.eq("buchung_id", nurBuchungId);
  const { data: offene } = await q;
  const ergebnis = { geprueft: 0, bezahlt: 0, teilbezahlt: 0, bestaetigt: 0, fehler: [] as string[] };
  for (const r of offene || []) {
    if (!r.fastbill_invoice_id) continue;
    try {
      const inv = await fastbillRechnungHolen(r.fastbill_invoice_id);
      ergebnis.geprueft++;
      if (!inv) continue;
      const stand = fastbillZahlungsstand(inv);
      if (stand.storniert) {
        await supabase.from("buchung_rechnungen").update({ status: "storniert", storniert_am: new Date().toISOString(), zahlung_geprueft_am: new Date().toISOString() }).eq("id", r.id);
        continue;
      }
      await supabase
        .from("buchung_rechnungen")
        .update({ zahlungsstatus: stand.status, bezahlt_am: stand.bezahltAm, bezahlt_betrag: stand.betrag || null, zahlung_geprueft_am: new Date().toISOString() })
        .eq("id", r.id);
      if (stand.status === "offen") continue;
      if (stand.status === "bezahlt") ergebnis.bezahlt++;
      else ergebnis.teilbezahlt++;
      const { data: b } = await supabase.from("buchungen").select("status").eq("id", r.buchung_id).maybeSingle();
      if (b?.status === "angefragt") {
        await bestaetigeBuchungIntern(supabase, r.buchung_id, "FastBill-Zahlungsabgleich");
        ergebnis.bestaetigt++;
      }
    } catch (e: any) {
      ergebnis.fehler.push(`${r.rechnungsnummer || r.id}: ${e?.message || e}`);
    }
  }
  return ergebnis;
}

// Ueberfaellige Zahlungen fuer das Dashboard (nur fuer Markus, keine Kunden-Mail).
// Erst ab KARENZ Tagen nach Faelligkeit -- kurze Banklaufzeiten sollen keinen
// Alarm ausloesen ("nur wenn signifikant ueberfaellig", Markus 10/2026).
// Raten: Rate i faellig i Monate nach Versand (wie im Zahlungsplan-Text);
// sonst Faelligkeit aus FastBill (DUE_DATE), ersatzweise 14 Tage nach Versand.
// Zahlungsstand kommt aus dem taeglichen FastBill-Abgleich.
export const UEBERFAELLIG_KARENZ_TAGE = 7;

const plusMonate = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export type UeberfaelligeZahlung = { rechnungId: string; buchungId: string; buchungsnummer: string | null; kunde: string; rechnungsnummer: string | null; was: string; offen: number; faelligAm: string; tage: number };

export async function ladeUeberfaelligeZahlungen(supabase: any, heute: string): Promise<UeberfaelligeZahlung[]> {
  const { data } = await supabase
    .from("buchung_rechnungen")
    .select("id, buchung_id, rechnungsnummer, empfaenger, betrag_brutto, bezahlt_betrag, raten_anzahl, faellig_am, versendet_am, freigegeben_am, zahlungsstatus, buchungen(buchungsnummer)")
    .in("status", ["freigegeben", "versendet"])
    .neq("zahlungsstatus", "bezahlt");
  const grenze = Date.parse(heute) - UEBERFAELLIG_KARENZ_TAGE * 86400000;
  const liste: UeberfaelligeZahlung[] = [];
  for (const r of data || []) {
    const basis = String(r.versendet_am || r.freigegeben_am || "").slice(0, 10);
    if (!basis) continue;
    const brutto = Number(r.betrag_brutto || 0);
    const bezahlt = Number(r.bezahlt_betrag || 0);
    const kunde = r.empfaenger?.firma || [r.empfaenger?.vorname, r.empfaenger?.nachname].filter(Boolean).join(" ") || "—";
    let faelligAm: string;
    let offen: number;
    let was: string;
    const n = Number(r.raten_anzahl || 0);
    if (n > 1) {
      // erste noch nicht (voll) bezahlte Rate
      const rate = Math.floor((brutto * 100) / n) / 100;
      let kumuliert = 0;
      let k = 0;
      for (; k < n; k++) {
        kumuliert = k === n - 1 ? brutto : Math.round((kumuliert + rate) * 100) / 100;
        if (kumuliert > bezahlt + 0.01) break;
      }
      if (k >= n) continue;
      faelligAm = k === 0 && r.faellig_am ? r.faellig_am : plusMonate(basis, k);
      offen = Math.round((kumuliert - bezahlt) * 100) / 100;
      was = `Rate ${k + 1} von ${n}`;
    } else {
      faelligAm = r.faellig_am || new Date(Date.parse(basis) + 14 * 86400000).toISOString().slice(0, 10);
      offen = Math.round((brutto - bezahlt) * 100) / 100;
      was = bezahlt > 0 ? "Restbetrag" : "Rechnung";
    }
    if (Date.parse(faelligAm) > grenze || offen <= 0.01) continue;
    liste.push({
      rechnungId: r.id,
      buchungId: r.buchung_id,
      buchungsnummer: r.buchungen?.buchungsnummer || null,
      kunde,
      rechnungsnummer: r.rechnungsnummer,
      was,
      offen,
      faelligAm,
      tage: Math.round((Date.parse(heute) - Date.parse(faelligAm)) / 86400000),
    });
  }
  return liste.sort((a, b) => b.tage - a.tage);
}

// Entwurf mit den aktuellen Vorlagen neu aufbauen: alten Entwurf in FastBill
// loeschen, neuen anlegen (Vorlagen anpassen -> Ergebnis sofort ansehen).
export async function erneuereRechnungsentwurf(supabase: any, rechnungId: string, bearbeiter: string) {
  const { data: r } = await supabase.from("buchung_rechnungen").select("id, buchung_id, status").eq("id", rechnungId).maybeSingle();
  if (!r || r.status !== "entwurf") throw new Error("Nur Entwürfe lassen sich neu aufbauen.");
  await verwirfEntwurf(supabase, r.id, bearbeiter);
  return erstelleRechnungsentwurf(supabase, r.buchung_id, bearbeiter);
}

// PDF einer Rechnung bzw. eines Entwurfs aus FastBill (fuer die Vorschau in Backstage).
export async function rechnungsPdf(supabase: any, rechnungId: string): Promise<Buffer> {
  const { data: r } = await supabase.from("buchung_rechnungen").select("fastbill_invoice_id").eq("id", rechnungId).maybeSingle();
  if (!r?.fastbill_invoice_id) throw new Error("Keine FastBill-Rechnung.");
  const inv = await fastbillRechnungHolen(r.fastbill_invoice_id);
  // Entwuerfe haben in FastBill noch kein PDF (Download-Link liefert 0 Bytes,
  // getestet 10/2026) -- erst nach invoice.complete.
  if (String(inv?.TYPE || "") === "draft") throw new Error("FastBill erzeugt das PDF erst bei der Freigabe – den Entwurf siehst Du in FastBill.");
  if (!inv?.DOCUMENT_URL) throw new Error("FastBill liefert für diese Rechnung (noch) kein PDF.");
  return ladePdf(inv.DOCUMENT_URL);
}

// Link in FastBills Oberflaeche (DETAILS_URL) -- fuer Entwuerfe, die noch kein PDF haben.
export async function fastbillDetailsLink(fastbillInvoiceId: string): Promise<string | null> {
  try {
    const inv = await fastbillRechnungHolen(fastbillInvoiceId);
    return inv?.DETAILS_URL || null;
  } catch {
    return null;
  }
}
