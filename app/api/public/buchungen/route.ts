export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getResend, ABSENDER } from "@/lib/email";
import { formatDatum } from "@/lib/format";
import { renderPlatzhalter } from "@/lib/funnel";
import { verknuepfeTeilnehmerMitOrganisationAutomatisch } from "@/lib/organisationsverknuepfung";

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

function aktuellerPreisNetto(preisstaffeln: { stichtag_tage_vor_start: number; preis: number }[], datumStart: string): number {
  if (!preisstaffeln.length) return 0;
  const heute = new Date();
  const start = new Date(datumStart);
  const tageBisStart = Math.ceil((start.getTime() - heute.getTime()) / (1000 * 60 * 60 * 24));
  const sortiert = [...preisstaffeln].sort((a, b) => b.stichtag_tage_vor_start - a.stichtag_tage_vor_start);
  const aktiv = sortiert.find((p) => tageBisStart >= p.stichtag_tage_vor_start);
  const gewaehlt = aktiv || sortiert[sortiert.length - 1];
  return gewaehlt ? Number(gewaehlt.preis) : 0;
}

type Teilnehmerangabe = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  roomOption?: string;
};

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return withCors(NextResponse.json({ error: "invalid_json" }, { status: 400 }));
  }

  const { seminarterminId, tierId, mainContact, additionalParticipants, comment } = body || {};

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

  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("id, titel, datum_start, datum_ende, status, zimmerupgrade_beschreibung, zimmerupgrade_preis_netto, seminartypen(name)")
    .eq("id", seminarterminId)
    .single();

  if (!termin || termin.status === "abgesagt") {
    return withCors(NextResponse.json({ error: "termin_not_found" }, { status: 404 }));
  }

  const { data: option } = await supabase
    .from("seminartermin_optionen")
    .select("id, titel, preisstaffeln(stichtag_tage_vor_start, preis)")
    .eq("id", tierId)
    .single();

  if (!option) {
    return withCors(NextResponse.json({ error: "option_not_found" }, { status: 404 }));
  }

  const preisNetto = aktuellerPreisNetto(
    (option.preisstaffeln || []).map((p: any) => ({ stichtag_tage_vor_start: p.stichtag_tage_vor_start, preis: Number(p.preis) })),
    termin.datum_start
  );

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

  // Organisation anlegen/wiedererkennen (nur beim Hauptkontakt abgefragt).
  let organisationId: string | null = null;
  if (personen[0].company) {
    const { data: bestehendeOrga } = await supabase
      .from("organisationen")
      .select("id, rechnungsadresse_strasse, rechnungsadresse_plz, rechnungsadresse_ort")
      .ilike("name", personen[0].company)
      .maybeSingle();
    if (bestehendeOrga) {
      organisationId = bestehendeOrga.id;
      // Rechnungsadresse nur nachtragen, wenn noch keine hinterlegt ist -
      // eine bereits gepflegte Adresse wird durch eine neue Buchung nicht ueberschrieben.
      if (!bestehendeOrga.rechnungsadresse_strasse && !bestehendeOrga.rechnungsadresse_plz && !bestehendeOrga.rechnungsadresse_ort) {
        await supabase
          .from("organisationen")
          .update({
            rechnungsadresse_strasse: rechnungsadresse.strasse,
            rechnungsadresse_plz: rechnungsadresse.plz,
            rechnungsadresse_ort: rechnungsadresse.ort,
          })
          .eq("id", organisationId);
      }
    } else {
      const { data: neueOrga, error: orgaError } = await supabase
        .from("organisationen")
        .insert({
          name: personen[0].company,
          rechnungsadresse_strasse: rechnungsadresse.strasse,
          rechnungsadresse_plz: rechnungsadresse.plz,
          rechnungsadresse_ort: rechnungsadresse.ort,
        })
        .select("id")
        .single();
      if (orgaError) {
        return withCors(NextResponse.json({ error: "organisation_fehler", detail: orgaError.message }, { status: 500 }));
      }
      organisationId = neueOrga.id;
    }
  }

  // Teilnehmer je Person anlegen/wiedererkennen (Abgleich per E-Mail).
  const teilnehmerIds: { id: string; email: string; vorname: string; roomOption?: string }[] = [];
  for (let i = 0; i < personen.length; i++) {
    const person = personen[i];
    // Die Rechnungsadresse aus dem Formular gilt fuer die gesamte Buchung und
    // wird - falls keine Organisation/Firma angegeben ist - beim Hauptkontakt
    // (erste Person) als Privatadresse hinterlegt. Weitere Teilnehmer:innen
    // bekommen keine eigene Adresse (kein Feld im Formular).
    const istHauptkontaktOhneOrganisation = i === 0 && !organisationId;

    const { data: bestehenderTeilnehmer } = await supabase
      .from("teilnehmer")
      .select("id, privatadresse_strasse, privatadresse_plz, privatadresse_ort")
      .ilike("email", person.email)
      .maybeSingle();

    if (bestehenderTeilnehmer) {
      teilnehmerIds.push({ id: bestehenderTeilnehmer.id, email: person.email, vorname: person.firstName, roomOption: person.roomOption });
      if (
        istHauptkontaktOhneOrganisation &&
        !bestehenderTeilnehmer.privatadresse_strasse &&
        !bestehenderTeilnehmer.privatadresse_plz &&
        !bestehenderTeilnehmer.privatadresse_ort
      ) {
        await supabase
          .from("teilnehmer")
          .update({
            privatadresse_strasse: rechnungsadresse.strasse,
            privatadresse_plz: rechnungsadresse.plz,
            privatadresse_ort: rechnungsadresse.ort,
            privatadresse_land: "Deutschland",
          })
          .eq("id", bestehenderTeilnehmer.id);
      }
      continue;
    }

    const { data: neuerTeilnehmer, error: teilnehmerError } = await supabase
      .from("teilnehmer")
      .insert({
        vorname: person.firstName,
        nachname: person.lastName,
        email: person.email,
        telefon: person.phone || null,
        firma_freitext: person.company || null,
        marketing_consent_status: "unbekannt",
        marketing_consent_quelle: "onepage_buchungsformular",
        ...(istHauptkontaktOhneOrganisation
          ? {
              privatadresse_strasse: rechnungsadresse.strasse,
              privatadresse_plz: rechnungsadresse.plz,
              privatadresse_ort: rechnungsadresse.ort,
              privatadresse_land: "Deutschland",
            }
          : {}),
      })
      .select("id")
      .single();
    if (teilnehmerError) {
      return withCors(NextResponse.json({ error: "teilnehmer_fehler", detail: teilnehmerError.message }, { status: 500 }));
    }
    teilnehmerIds.push({ id: neuerTeilnehmer.id, email: person.email, vorname: person.firstName, roomOption: person.roomOption });
  }

  const hauptkontaktTeilnehmerId = teilnehmerIds[0].id;

  const { data: buchung, error: buchungError } = await supabase
    .from("buchungen")
    .insert({
      organisation_id: organisationId,
      rechnungsempfaenger_teilnehmer_id: hauptkontaktTeilnehmerId,
      status: "angefragt",
      notizen: comment ? String(comment) : null,
    })
    .select("id, buchungsnummer")
    .single();
  if (buchungError) {
    return withCors(NextResponse.json({ error: "buchung_fehler", detail: buchungError.message }, { status: 500 }));
  }

  const positionen: any[] = [];
  for (const t of teilnehmerIds) {
    positionen.push({
      buchung_id: buchung.id,
      teilnehmer_id: t.id,
      seminartermin_id: seminarterminId,
      seminartermin_option_id: tierId,
      beschreibung: option.titel,
      listenpreis: preisNetto,
      startdatum: termin.datum_start,
      enddatum: termin.datum_ende,
    });
    if (t.roomOption === "komfort" && termin.zimmerupgrade_preis_netto) {
      positionen.push({
        buchung_id: buchung.id,
        teilnehmer_id: t.id,
        seminartermin_id: seminarterminId,
        seminartermin_option_id: null,
        beschreibung: termin.zimmerupgrade_beschreibung || "Zimmer-Upgrade",
        listenpreis: Number(termin.zimmerupgrade_preis_netto),
        startdatum: termin.datum_start,
        enddatum: termin.datum_ende,
      });
    }
  }

  const { error: positionenError } = await supabase.from("buchungspositionen").insert(positionen);
  if (positionenError) {
    return withCors(NextResponse.json({ error: "positionen_fehler", detail: positionenError.message }, { status: 500 }));
  }

  // Bei Buchung ueber eine Organisation: alle beteiligten Teilnehmer
  // automatisch mit dieser Organisation verknuepfen (siehe
  // teilnehmer_organisationen), damit die Stammdaten nicht wieder veralten.
  if (organisationId) {
    for (const t of teilnehmerIds) {
      await verknuepfeTeilnehmerMitOrganisationAutomatisch(supabase, t.id, organisationId);
    }
  }

  // Reservierungsbestaetigung sofort an alle Teilnehmer verschicken (transaktional,
  // nicht ueber den taeglichen Funnel-Cron, damit sie direkt beim Absenden ankommt).
  const seminartitel = termin.titel || (termin as any).seminartypen?.name || "das Seminar";
  const seminardatum = formatDatum(termin.datum_start);
  const funnelMail = await supabase.from("funnel_mails").select("betreff, inhalt").eq("id", RESERVIERUNG_FUNNEL_MAIL_ID).single();

  if (funnelMail.data) {
    for (const t of teilnehmerIds) {
      const werte = { vorname: t.vorname, seminartitel, seminardatum };
      const betreff = renderPlatzhalter(funnelMail.data.betreff, werte);
      const inhaltHtml = renderPlatzhalter(funnelMail.data.inhalt, werte).replace(/\n/g, "<br/>");

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
  // Bewusst in einem eigenen try/catch: ein Fehler hier darf die fuer den
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
