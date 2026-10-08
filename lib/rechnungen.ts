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
        "buchungspositionen(id, beschreibung, listenpreis, rabatt_betrag, preis, metadata, teilnehmer(id, vorname, nachname, email), seminartermin_optionen(titel), " +
        "seminartermine(id, kennung, titel, datum_start, datum_ende, seminartypen(name)), programme(name), programm_optionen(titel))"
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

function positionenAus(b: any): { positionen: Position[]; raten: { anzahl: number; betrag: number } | null } {
  const ust = Math.round(MWST_SATZ * 100);
  const positionen: Position[] = [];
  const raten = { anzahl: 0, betrag: 0 };
  for (const p of b.buchungspositionen || []) {
    const preis = Number(p.preis ?? 0);
    const name = p.teilnehmer ? `${p.teilnehmer.vorname || ""} ${p.teilnehmer.nachname || ""}`.trim() : "";
    const t = p.seminartermine;
    let text: string;
    if (t && p.seminartermin_optionen) {
      text = `Seminarteilnahme ${t.kennung || ""} – ${t.titel || t.seminartypen?.name || "Seminar"} (${zeitraum(t)}), Option ${p.seminartermin_optionen.titel}`;
    } else if (t) {
      text = `${p.beschreibung || "Zusatzleistung"} – ${t.kennung || t.titel || "Seminar"} (${zeitraum(t)})`;
    } else if (p.programme) {
      text = `${p.programme.name}${p.programm_optionen?.titel ? ` – ${p.programm_optionen.titel}` : ""}`;
    } else {
      text = p.beschreibung || "Leistung";
    }
    if (name) text += ` · Teilnehmer: ${name}`;
    const rabatt = Number(p.rabatt_betrag || 0);
    if (rabatt > 0) text += ` (Listenpreis ${formatEUR(Number(p.listenpreis || 0))} abzüglich ${formatEUR(rabatt)} Rabatt)`;
    positionen.push({ beschreibung: text, menge: 1, einzelpreis: Math.round(preis * 100) / 100, ust_prozent: ust });
    if (p.metadata?.zahlweise === "raten" && Number(p.metadata?.anzahl_raten) > 1) {
      const anzahl = Number(p.metadata.anzahl_raten);
      raten.anzahl = anzahl;
      raten.betrag += Number(p.metadata.rate_betrag || preis / anzahl);
    }
  }
  return { positionen, raten: raten.anzahl ? raten : null };
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
  const { positionen, raten } = positionenAus(b);
  const netto = positionen.reduce((s, p) => s + p.einzelpreis * p.menge, 0);
  const fehlt: string[] = [];
  if (!empfaenger.strasse || !empfaenger.plz || !empfaenger.ort) fehlt.push(empfaenger.typ === "business" ? `Rechnungsadresse der Organisation „${empfaenger.firma}“` : "Rechnungsadresse (Privatadresse) des Rechnungsempfängers");
  if (!empfaenger.email) fehlt.push("E-Mail-Adresse des Rechnungsempfängers");
  if (!positionen.length) fehlt.push("Positionen");
  const art = b.metadata?.buchungsart;
  const keineRechnung = art === "paket" ? "Paket-Buchung – keine eigene Rechnung." : art === "freiplatz" ? "Freiplatz – keine Rechnung." : b.status === "storniert" ? "Buchung ist storniert." : null;
  return { buchung: b, empfaenger, positionen, raten, netto, brutto: Math.round(netto * (1 + MWST_SATZ) * 100) / 100, fehlt, keineRechnung };
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
      betrag_netto: v.netto,
      betrag_brutto: v.brutto,
      erstellt_von: bearbeiter,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.code === "23505" ? "Für diese Buchung gibt es schon eine Rechnung." : insErr.message);

  try {
    const { data: konf } = await supabase.from("finanz_konfiguration").select("fastbill_template_id").eq("id", 1).maybeSingle();
    const kundenId = await sichereFastbillKunde(supabase, v.empfaenger);
    const termin = (v.buchung.buchungspositionen || []).find((p: any) => p.seminartermine)?.seminartermine;
    const einleitung = v.raten
      ? `Zahlbar in ${v.raten.anzahl} monatlichen Raten à ${formatEUR(v.raten.betrag)} zzgl. ${Math.round(MWST_SATZ * 100)} % USt. – die erste Rate bei Erhalt dieser Rechnung, die weiteren jeweils einen Monat später.`
      : null;
    const invoiceId = await fastbillEntwurfAnlegen({
      CUSTOMER_ID: kundenId,
      ...(konf?.fastbill_template_id ? { TEMPLATE_ID: konf.fastbill_template_id } : {}),
      ...(termin ? { INVOICE_TITLE: `Seminar ${termin.kennung || termin.titel || ""}`.trim(), SERVICE_PERIOD_START: termin.datum_start, SERVICE_PERIOD_END: termin.datum_ende || termin.datum_start } : {}),
      ...(einleitung ? { INTROTEXT: einleitung } : {}),
      ORDER_REFERENCE: v.buchung.buchungsnummer || undefined,
      ITEMS: v.positionen.map((p) => ({ DESCRIPTION: p.beschreibung, QUANTITY: p.menge, UNIT_PRICE: p.einzelpreis, VAT_PERCENT: p.ust_prozent })),
    });
    await supabase.from("buchung_rechnungen").update({ fastbill_invoice_id: invoiceId, fastbill_customer_id: kundenId, einleitung }).eq("id", zeile.id);
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
  const res = await fetch(url);
  const typ = res.headers.get("content-type") || "";
  if (!res.ok || !(typ.includes("pdf") || typ.includes("octet-stream"))) throw new Error(`PDF konnte nicht geladen werden (Status ${res.status}, ${typ || "ohne Typ"}).`);
  return Buffer.from(await res.arrayBuffer());
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
    (r.einleitung ? `\n\n${r.einleitung}` : "") +
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
