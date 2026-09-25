export const dynamic = "force-dynamic";

import { ladeBausteine, schalterAus, baueMailHtml } from "@/lib/mail-bausteine";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getResend, ABSENDER } from "@/lib/email";
import { formatDatum, effektiveTerminNaechte } from "@/lib/format";
import { renderPlatzhalter } from "@/lib/funnel";
import { ermittleKontakte, verknuepfeMitOrganisation, type Teilnehmerangabe } from "@/lib/buchung-kontakte";
import { aktuellerPreisNetto } from "@/lib/preisstaffeln";
import { berechneRatenbetrag } from "@/lib/ratenzahlung";

// Oeffentliche, schreibende Schnittstelle fuer das Onepage-Buchungsformular.
// Ersetzt den fruehreren Umweg ueber Pipedrive bzw. das Onepage-eigene CRM:
// eine Buchung ueber die Marketing-Seite landet jetzt direkt als echte
// Buchung (Teilnehmer, ggf. Organisation, Buchungspositionen) in der
// Verwaltung - Status "angefragt", da Markus jede Buchung manuell bestaetigt
// (siehe bestaetigeBuchung in lib/actions.ts). Von der Login-Middleware
// ausgenommen (siehe middleware.ts), da ohne Session erreichbar sein muss.
// Preise werden bewusst NICHT vom Client uebernommen, sondern serverseitig
// aus den aktuellen Preisstaffeln/Zimmerupgrade-Feldern neu berechnet.

const RESERVIERUNG_FUNNEL_MAIL_ID = "95628e52-7ba8-4987-a10b-4fb02c7db4e1";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// Der 1. Teilnehmer (Hauptkontakt) zahlt immer den vollen (Staffel-)Preis.
// Ab dem 2. Teilnehmer gilt - falls am Termin hinterlegt - der
// Zusatzteilnehmer-Festpreis, sonst der Zusatzteilnehmer-Rabatt in Prozent
// auf den vollen Preis, sonst (nichts hinterlegt) ebenfalls der volle Preis.
// Vorher wurde hier faelschlich fuer jede Person derselbe volle Preis
// multipliziert, ohne den Zusatzteilnehmer-Preis/-Rabatt zu beruecksichtigen.
function preisFuerTeilnehmer(
  index: number,
  preisNettoVoll: number,
  zusatzteilnehmerPreis: number | null | undefined,
  zusatzteilnehmerRabattProzent: number | null | undefined
): number {
  if (index === 0) return preisNettoVoll;
  if (zusatzteilnehmerPreis !== null && zusatzteilnehmerPreis !== undefined) return Number(zusatzteilnehmerPreis);
  if (zusatzteilnehmerRabattProzent !== null && zusatzteilnehmerRabattProzent !== undefined) {
    return Math.round(preisNettoVoll * (1 - Number(zusatzteilnehmerRabattProzent) / 100) * 100) / 100;
  }
  return preisNettoVoll;
}


export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: "invalid_json" }, { status: 400 }));
  }

  const { seminarterminId, tierId, mainContact, additionalParticipants, comment, paymentPlan } = body || {};

  if (!seminarterminId || !tierId || !mainContact?.firstName || !mainContact?.lastName || !mainContact?.email || !mainContact?.street || !mainContact?.postalCode || !mainContact?.city) {
    return withCors(NextResponse.json({ error: "missing_fields" }, { status: 400 }));
  }

  const rechnungsadresse = {
    strasse: String(mainContact.street).trim(),
    plz: String(mainContact.postalCode).trim(),
    ort: String(mainContact.city).trim(),
  };
  if (body.privacyAccepted !== true) {
    return withCors(NextResponse.json({ error: "privacy_not_accepted" }, { status: 400 }));
  }
  if (body.trustGuaranteeAccepted !== true) {
    return withCors(NextResponse.json({ error: "trust_guarantee_not_accepted" }, { status: 400 }));
  }

  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select(
      "id, titel, datum_start, datum_ende, status, vorabendanreise_inklusive, zimmerupgrade_beschreibung, zimmerupgrade_preis_pro_nacht_netto, zusatzteilnehmer_preis, zusatzteilnehmer_rabatt_prozent, seminartypen(name)"
    )
    .eq("id", seminarterminId)
    .single();

  if (!termin || termin.status === "abgesagt") {
    return withCors(NextResponse.json({ error: "termin_not_found" }, { status: 404 }));
  }

  const { data: option } = await supabase
    .from("seminartermin_optionen")
    .select(
      "id, titel, seminartermin_id, zimmerupgrade_zusatznaechte, deaktiviert_am, ratenzahlung_aktiv, ratenzahlung_anzahl_raten, preisstaffeln(stichtag_tage_vor_start, stichtag_datum, preis)"
    )
    .eq("id", tierId)
    .single();

  // Deaktivierte Optionen sind nicht mehr buchbar (z.B. veraltete/gecachte
  // Onepage-Seite mit einer inzwischen deaktivierten Option) -- derselbe
  // Fehler wie bei einer nicht existierenden Option.
  if (!option || option.deaktiviert_am) {
    return withCors(NextResponse.json({ error: "option_not_found" }, { status: 404 }));
  }

  // Die Option MUSS zu diesem Termin gehoeren (Fix vom 25.09.2026): Zeigt eine
  // Onepage-Seite mangels eigener Optionen ihre statischen Vorlagen-Werte an
  // (z.B. frisch duplizierte Seminarseite), schickt sie Options-IDs eines
  // voellig anderen Termins mit. Bisher wurde das anstandslos gebucht -- mit
  // dem Preis der fremden Option, belegtem Platz und Reservierungsmail.
  if (option.seminartermin_id !== seminarterminId) {
    return withCors(NextResponse.json({ error: "option_gehoert_nicht_zum_termin" }, { status: 400 }));
  }

  const preisNetto =
    aktuellerPreisNetto(
      (option.preisstaffeln || []).map((p: any) => ({
        stichtag_tage_vor_start: p.stichtag_tage_vor_start,
        stichtag_datum: p.stichtag_datum,
        preis: Number(p.preis),
      })),
      termin.datum_start
    ) ?? 0;

  // Ratenzahlung ist reine Zahlungsvereinbarung (keine automatische
  // Abbuchung) und nur moeglich, wenn diese Option sie aktiv anbietet -- die
  // Anzahl der Raten kommt ausschliesslich aus der Options-Konfiguration,
  // nie vom Client, genau wie der Preis selbst.
  const ratenzahlungGewaehlt =
    paymentPlan === "raten" && option.ratenzahlung_aktiv && (option.ratenzahlung_anzahl_raten || 0) > 1;

  const personen: Teilnehmerangabe[] = [
    {
      firstName: String(mainContact.firstName),
      lastName: String(mainContact.lastName),
      email: String(mainContact.email).trim().toLowerCase(),
      phone: mainContact.phone ? String(mainContact.phone) : undefined,
      company: mainContact.company ? String(mainContact.company).trim() : undefined,
      roomOption: mainContact.roomOption,
    },
    ...((additionalParticipants || []) as any[]).map((p) => ({
      firstName: String(p.firstName || ""),
      lastName: String(p.lastName || ""),
      email: String(p.email || "").trim().toLowerCase(),
      roomOption: p.roomOption,
    })),
  ].filter((p) => p.firstName && p.lastName && p.email);

  if (!personen.length) {
    return withCors(NextResponse.json({ error: "no_participants" }, { status: 400 }));
  }

  // Organisation + Teilnehmer anlegen/wiedererkennen -- gemeinsame Logik mit
  // der Programm-Buchungsstrecke (lib/buchung-kontakte.ts)
  const kontakte = await ermittleKontakte(supabase, personen, rechnungsadresse, "onepage_buchungsformular");
  if (kontakte.fehler) {
    return withCors(NextResponse.json({ error: kontakte.fehler.code, detail: kontakte.fehler.detail }, { status: 500 }));
  }
  const organisationId = kontakte.organisationId;
  const teilnehmerIds = kontakte.teilnehmer;

  const hauptkontaktTeilnehmerId = teilnehmerIds[0].id;

  const { data: buchung, error: buchungError } = await supabase
    .from("buchungen")
    .insert({
      organisation_id: organisationId,
      rechnungsempfaenger_teilnehmer_id: hauptkontaktTeilnehmerId,
      status: "angefragt",
      notizen: comment ? String(comment) : null,
      metadata: {
        privacy_accepted: true,
        trust_guarantee_accepted: true,
        consent_erfasst_am: new Date().toISOString(),
      },
    })
    .select("id, buchungsnummer")
    .single();
  if (buchungError) {
    return withCors(NextResponse.json({ error: "buchung_fehler", detail: buchungError.message }, { status: 500 }));
  }

  const positionen: any[] = [];
  for (let i = 0; i < teilnehmerIds.length; i++) {
    const t = teilnehmerIds[i];
    const listenpreisTeilnehmer = preisFuerTeilnehmer(i, preisNetto, termin.zusatzteilnehmer_preis, termin.zusatzteilnehmer_rabatt_prozent);
    positionen.push({
      buchung_id: buchung.id,
      teilnehmer_id: t.id,
      seminartermin_id: seminarterminId,
      seminartermin_option_id: tierId,
      beschreibung: option.titel,
      listenpreis: listenpreisTeilnehmer,
      startdatum: termin.datum_start,
      enddatum: termin.datum_ende,
      // Reine Zahlungsvereinbarung (kein Zahlungsanbieter, keine automatische
      // Abbuchung) -- Zahlungseingaenge weiterhin manuell auf der Buchung
      // markieren. rate_betrag je Person aus deren eigenem (ggf. per
      // Zusatzteilnehmer-Rabatt reduzierten) Preis berechnet.
      metadata: ratenzahlungGewaehlt
        ? {
            zahlweise: "raten",
            anzahl_raten: option.ratenzahlung_anzahl_raten,
            rate_betrag: berechneRatenbetrag(listenpreisTeilnehmer, option.ratenzahlung_anzahl_raten),
          }
        : { zahlweise: "einmalig" },
    });
    if (t.roomOption === "komfort" && termin.zimmerupgrade_preis_pro_nacht_netto) {
      // Termin-Basisnaechte (bereits um eine Nacht reduziert, falls keine
      // Vorabendanreise inklusive ist) + ggf. Zusatzuebernachtung dieser
      // konkreten Option (z.B. Verlaengerungsoption) -- siehe
      // app/api/public/seminartermine/[id]/route.ts fuer dieselbe Logik in
      // der Vorschau-API.
      const zimmerupgradeNaechte =
        effektiveTerminNaechte(termin.datum_start, termin.datum_ende, termin.vorabendanreise_inklusive) +
        (option.zimmerupgrade_zusatznaechte || 0);
      positionen.push({
        buchung_id: buchung.id,
        teilnehmer_id: t.id,
        seminartermin_id: seminarterminId,
        seminartermin_option_id: null,
        beschreibung: termin.zimmerupgrade_beschreibung || "Zimmer-Upgrade",
        listenpreis: Number(termin.zimmerupgrade_preis_pro_nacht_netto) * zimmerupgradeNaechte,
        startdatum: termin.datum_start,
        enddatum: termin.datum_ende,
      });
    }
  }

  const { error: positionenError } = await supabase.from("buchungspositionen").insert(positionen);
  if (positionenError) {
    return withCors(NextResponse.json({ error: "positionen_fehler", detail: positionenError.message }, { status: 500 }));
  }

  await verknuepfeMitOrganisation(supabase, organisationId, teilnehmerIds);

  // Reservierungsbestaetigung sofort an alle Teilnehmer verschicken (transaktional,
  // nicht ueber den taeglichen Funnel-Cron, damit sie direkt beim Absenden ankommt).
  const seminartitel = termin.titel || (termin as any).seminartypen?.name || "das Seminar";
  const seminardatum = formatDatum(termin.datum_start);
  const funnelMail = await supabase.from("funnel_mails").select("betreff, inhalt, baustein_signatur, baustein_rechtliches").eq("id", RESERVIERUNG_FUNNEL_MAIL_ID).single();

  if (funnelMail.data) {
    // Transaktionale Mail: Signatur/Rechtliches wie im Funnel, aber nie ein Abmeldelink
    const bausteine = await ladeBausteine(supabase);
    for (const t of teilnehmerIds) {
      const werte = { vorname: t.vorname, seminartitel, seminardatum };
      const betreff = renderPlatzhalter(funnelMail.data.betreff, werte);
      const inhaltHtml = baueMailHtml(renderPlatzhalter(funnelMail.data.inhalt, werte), bausteine, { ...schalterAus(funnelMail.data), abmelden: false }, null);

      let status: "gesendet" | "fehler" = "gesendet";
      let fehlermeldung: string | null = null;
      let resendEmailId: string | null = null;
      try {
        const resend = getResend();
        const { data, error } = await resend.emails.send({ from: ABSENDER, to: [t.email], subject: betreff, html: inhaltHtml });
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
        funnel_mail_id: RESERVIERUNG_FUNNEL_MAIL_ID,
        bezug_typ: "buchung",
        bezug_id: buchung.id,
        empfaenger_email: t.email,
        status,
        fehlermeldung,
        resend_email_id: resendEmailId,
      });
    }
  }

  // Interne Benachrichtigung an Markus, dass eine neue Buchung eingegangen ist.
  // Bewusst in einem eigenen try/catch: ein Fehler hier darf die fueb den
  // Teilnehmer bereits erfolgreiche Buchung nicht mehr gefaehrden.
  try {
    const resend = getResend();
    const gesamtpreisNetto = positionen.reduce((summe, p) => summe + Number(p.listenpreis), 0);
    const teilnehmerZeilen = teilnehmerIds
      .map((t) => `<li>${t.vorname} (${t.email})${t.roomOption === "komfort" ? " – Komfortzimmer-Upgrade" : ""}</li>`)
      .join("");
    const adminLink = `https://agencyuplifted-backend.vercel.app/buchungen/${buchung.id}`;
    const internHtml = `
      <p style="font-size:1.1em;">🎉 Es ist eine neue Buchung eingegangen!</p>
      <p>
        <strong>Buchungsnummer:</strong> ${buchung.buchungsnummer}<br/>
        <strong>Seminar:</strong> ${seminartitel}<br/>
        <strong>Termin:</strong> ${seminardatum}<br/>
        <strong>Option:</strong> ${option.titel}<br/>
        <strong>Teilnehmer:innen:</strong> ${teilnehmerIds.length}<br/>
        <strong>Gesamtpreis (netto):</strong> ${gesamtpreisNetto.toLocaleString("de-DE")} €
      </p>
      <p><strong>Teilnehmer:innen:</strong></p>
      <ul>${teilnehmerZeilen}</ul>
      ${comment ? `<p><strong>Anmerkung:</strong> ${String(comment)}</p>` : ""}
      <p><a href="${adminLink}">Buchung in der Verwaltung ansehen</a></p>
    `;
    await resend.emails.send({
      from: ABSENDER,
      to: ["markus@agencyuplifted.de"],
      subject: `🎉 Neue Buchung eingegangen: ${buchung.buchungsnummer}`,
      html: internHtml,
    });
  } catch (e: any) {
    console.error("Interne Buchungs-Benachrichtigung fehlgeschlagen:", e?.message);
  }

  return withCors(NextResponse.json({ ok: true, buchungId: buchung.id, buchungsnummer: buchung.buchungsnummer }));
}
