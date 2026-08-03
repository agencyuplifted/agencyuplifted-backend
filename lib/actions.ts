"use server";

import { getSupabaseAdmin } from "./supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getResend, ABSENDER } from "./email";
import { signSession, SESSION_COOKIE_NAME, SESSION_TTL } from "./session";
import { hashePasswort, pruefePasswort } from "./passwort";
import { getAktuellerBenutzer } from "./auth";

export async function createOrganisation(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("organisationen").insert({
    name: String(formData.get("name")),
    rechnungsadresse_strasse: formData.get("strasse") || null,
    rechnungsadresse_plz: formData.get("plz") || null,
    rechnungsadresse_ort: formData.get("ort") || null,
    ust_id: formData.get("ust_id") || null,
    branche: formData.get("branche") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/organisationen");
  redirect("/organisationen");
}

export async function createTeilnehmer(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("teilnehmer").insert({
    anrede: formData.get("anrede") || "keine_angabe",
    vorname: String(formData.get("vorname")),
    nachname: String(formData.get("nachname")),
    email: String(formData.get("email")),
    email_zweite: formData.get("email_zweite") || null,
    telefon: formData.get("telefon") || null,
    mobiltelefon: formData.get("mobiltelefon") || null,
    linkedin_url: formData.get("linkedin_url") || null,
    geburtsdatum: formData.get("geburtsdatum") || null,
    position: formData.get("position") || null,
    firma_freitext: formData.get("firma_freitext") || null,
    ernaehrung_sonderwuensche: formData.get("ernaehrung") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/teilnehmer");
  redirect("/teilnehmer");
}

export async function updateTeilnehmerStammdaten(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("teilnehmer")
    .update({
      anrede: formData.get("anrede") || "keine_angabe",
      vorname: String(formData.get("vorname")),
      nachname: String(formData.get("nachname")),
      email: String(formData.get("email")),
      email_zweite: formData.get("email_zweite") || null,
      telefon: formData.get("telefon") || null,
      mobiltelefon: formData.get("mobiltelefon") || null,
      linkedin_url: formData.get("linkedin_url") || null,
      geburtsdatum: formData.get("geburtsdatum") || null,
      position: formData.get("position") || null,
      firma_freitext: formData.get("firma_freitext") || null,
      privatadresse_strasse: formData.get("privatadresse_strasse") || null,
      privatadresse_plz: formData.get("privatadresse_plz") || null,
      privatadresse_ort: formData.get("privatadresse_ort") || null,
      privatadresse_land: formData.get("privatadresse_land") || null,
      ernaehrung_sonderwuensche: formData.get("ernaehrung_sonderwuensche") || null,
      notizen: formData.get("notizen") || null,
      teilnehmerliste_opt_out: formData.get("teilnehmerliste_opt_out") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/teilnehmer/${id}`);
  redirect(`/teilnehmer/${id}`);
}

export async function setMarketingConsentStatus(formData: FormData) {
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const erlaubteStatus = ["abonniert", "keine_zustimmung", "abgemeldet", "unbekannt"];
  if (!erlaubteStatus.includes(status)) {
    throw new Error("Ungueltiger Consent-Status.");
  }

  const supabase = getSupabaseAdmin();
  const benutzer = await getAktuellerBenutzer();
  const { error } = await supabase
    .from("teilnehmer")
    .update({
      marketing_consent_status: status,
      marketing_consent_zeitpunkt: new Date().toISOString(),
      marketing_consent_quelle: `manuell (${benutzer?.name || "Admin-UI"})`,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/teilnehmer/${id}`);
  redirect(`/teilnehmer/${id}`);
}

export async function createTrainer(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("trainer").insert({
    name: String(formData.get("name")),
    email: formData.get("email") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/trainer");
  redirect("/trainer");
}

export async function createVeranstaltungsort(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("veranstaltungsorte").insert({
    name: String(formData.get("name")),
    adresse: formData.get("adresse") || null,
    ort: formData.get("ort") || null,
    nahe_grossstadt: formData.get("nahe_grossstadt") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/orte");
  redirect("/orte");
}

export async function createSeminartermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const datumStart = String(formData.get("datum_start"));
  const datumEnde = formData.get("datum_ende") || datumStart;
  const { data: termin, error } = await supabase
    .from("seminartermine")
    .insert({
      titel: formData.get("titel") || null,
      seminartyp_id: String(formData.get("seminartyp_id")),
      datum_start: datumStart,
      zeit_start: formData.get("zeit_start") || null,
      datum_ende: datumEnde,
      zeit_ende: formData.get("zeit_ende") || null,
      vorabend_anreise_datum: formData.get("vorabend_anreise_datum") || null,
      vorabend_anreise_uhrzeit: formData.get("vorabend_anreise_uhrzeit") || null,
      format: String(formData.get("format") || "praesenz"),
      veranstaltungsort_id: formData.get("veranstaltungsort_id") || null,
      trainer_id: formData.get("trainer_id") || null,
      kapazitaet: Number(formData.get("kapazitaet") || 12),
      mindestteilnehmerzahl: Number(formData.get("mindestteilnehmerzahl") || 5),
      ueberbuchungspuffer: Number(formData.get("ueberbuchungspuffer") || 3),
      angezeigte_restplaetze: formData.get("angezeigte_restplaetze")
        ? Number(formData.get("angezeigte_restplaetze"))
        : null,
      zusatzteilnehmer_preis: formData.get("zusatzteilnehmer_preis")
        ? Number(formData.get("zusatzteilnehmer_preis"))
        : null,
      zusatzteilnehmer_rabatt_prozent: formData.get("zusatzteilnehmer_rabatt_prozent")
        ? Number(formData.get("zusatzteilnehmer_rabatt_prozent"))
        : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/termine");
  redirect(`/termine/${termin.id}`);
}

export async function updateSeminartermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartermin_id"));
  const datumStart = String(formData.get("datum_start"));
  const datumEnde = formData.get("datum_ende") || datumStart;
  const { error } = await supabase
    .from("seminartermine")
    .update({
      titel: formData.get("titel") || null,
      datum_start: datumStart,
      zeit_start: formData.get("zeit_start") || null,
      datum_ende: datumEnde,
      zeit_ende: formData.get("zeit_ende") || null,
      vorabend_anreise_datum: formData.get("vorabend_anreise_datum") || null,
      vorabend_anreise_uhrzeit: formData.get("vorabend_anreise_uhrzeit") || null,
      format: String(formData.get("format") || "praesenz"),
      veranstaltungsort_id: formData.get("veranstaltungsort_id") || null,
      trainer_id: formData.get("trainer_id") || null,
      kapazitaet: Number(formData.get("kapazitaet") || 12),
      mindestteilnehmerzahl: Number(formData.get("mindestteilnehmerzahl") || 5),
      ueberbuchungspuffer: Number(formData.get("ueberbuchungspuffer") || 3),
      angezeigte_restplaetze: formData.get("angezeigte_restplaetze")
        ? Number(formData.get("angezeigte_restplaetze"))
        : null,
      zusatzteilnehmer_preis: formData.get("zusatzteilnehmer_preis")
        ? Number(formData.get("zusatzteilnehmer_preis"))
        : null,
      zusatzteilnehmer_rabatt_prozent: formData.get("zusatzteilnehmer_rabatt_prozent")
        ? Number(formData.get("zusatzteilnehmer_rabatt_prozent"))
        : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/termine");
  revalidatePath(`/termine/${id}`);
  redirect(`/termine/${id}`);
}

export async function duplicateSeminartermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const sourceId = String(formData.get("seminartermin_id"));

  const { data: quelle, error: qErr } = await supabase
    .from("seminartermine")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (qErr || !quelle) throw new Error(qErr?.message || "Termin nicht gefunden");

  const { id: _id, erstellt_am: _ea, aktualisiert_am: _aa, ...kopie } = quelle as any;

  const { data: neuerTermin, error: insErr } = await supabase
    .from("seminartermine")
    .insert({
      ...kopie,
      titel: kopie.titel ? `${kopie.titel} (Kopie)` : null,
      status: "geplant",
      deaktiviert_am: null,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  const { data: optionen } = await supabase
    .from("seminartermin_optionen")
    .select("*, seminartermin_options_features(*), preisstaffeln(*)")
    .eq("seminartermin_id", sourceId);

  for (const opt of (optionen as any[]) || []) {
    const { data: neueOption, error: optErr } = await supabase
      .from("seminartermin_optionen")
      .insert({
        seminartermin_id: neuerTermin.id,
        titel: opt.titel,
        beschreibung: opt.beschreibung,
        badge: opt.badge,
        sortierung: opt.sortierung,
      })
      .select()
      .single();
    if (optErr) throw new Error(optErr.message);

    if (opt.seminartermin_options_features?.length) {
      await supabase.from("seminartermin_options_features").insert(
        opt.seminartermin_options_features.map((f: any) => ({
          seminartermin_option_id: neueOption.id,
          text: f.text,
          sortierung: f.sortierung,
        }))
      );
    }
    if (opt.preisstaffeln?.length) {
      await supabase.from("preisstaffeln").insert(
        opt.preisstaffeln.map((p: any) => ({
          seminartermin_option_id: neueOption.id,
          name: p.name,
          stichtag_tage_vor_start: p.stichtag_tage_vor_start,
          preis: p.preis,
          waehrung: p.waehrung,
          sortierung: p.sortierung,
        }))
      );
    }
  }

  const { data: urgencyStufen } = await supabase
    .from("urgency_stufen")
    .select("*")
    .eq("seminartermin_id", sourceId);
  if (urgencyStufen?.length) {
    await supabase.from("urgency_stufen").insert(
      urgencyStufen.map((u) => ({
        seminartermin_id: neuerTermin.id,
        schwellenwert_prozent: u.schwellenwert_prozent,
        text_vorlage: u.text_vorlage,
        sortierung: u.sortierung,
      }))
    );
  }

  const { data: mitarbeiterZuordnungen } = await supabase
    .from("seminartermin_mitarbeiter")
    .select("*")
    .eq("seminartermin_id", sourceId);
  if (mitarbeiterZuordnungen?.length) {
    await supabase.from("seminartermin_mitarbeiter").insert(
      mitarbeiterZuordnungen.map((m) => ({
        seminartermin_id: neuerTermin.id,
        mitarbeiter_id: m.mitarbeiter_id,
        rolle: m.rolle,
      }))
    );
  }

  revalidatePath("/termine");
  redirect(`/termine/${neuerTermin.id}`);
}

export async function createSeminarOption(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("seminartermin_optionen").insert({
    seminartermin_id: seminarterminId,
    titel: String(formData.get("titel")),
    beschreibung: formData.get("beschreibung") || null,
    badge: formData.get("badge") || null,
    sortierung: Number(formData.get("sortierung") || 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function updateOptionBadge(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const badge = formData.get("badge") || null;
  const { error } = await supabase
    .from("seminartermin_optionen")
    .update({ badge })
    .eq("id", optionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function duplicateSeminarOption(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const sourceOptionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  const { data: quelle, error: qErr } = await supabase
    .from("seminartermin_optionen")
    .select("*, seminartermin_options_features(*), preisstaffeln(*)")
    .eq("id", sourceOptionId)
    .single();
  if (qErr || !quelle) throw new Error(qErr?.message || "Option nicht gefunden");

  const { data: neueOption, error: insErr } = await supabase
    .from("seminartermin_optionen")
    .insert({
      seminartermin_id: seminarterminId,
      titel: `${(quelle as any).titel} (Kopie)`,
      beschreibung: (quelle as any).beschreibung,
      badge: null,
      sortierung: ((quelle as any).sortierung ?? 0) + 1,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);

  const features = (quelle as any).seminartermin_options_features;
  if (features?.length) {
    await supabase.from("seminartermin_options_features").insert(
      features.map((f: any) => ({
        seminartermin_option_id: neueOption.id,
        text: f.text,
        sortierung: f.sortierung,
      }))
    );
  }
  const staffeln = (quelle as any).preisstaffeln;
  if (staffeln?.length) {
    await supabase.from("preisstaffeln").insert(
      staffeln.map((p: any) => ({
        seminartermin_option_id: neueOption.id,
        name: p.name,
        stichtag_tage_vor_start: p.stichtag_tage_vor_start,
        preis: p.preis,
        waehrung: p.waehrung,
        sortierung: p.sortierung,
      }))
    );
  }

  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function createOptionFeature(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("seminartermin_options_features").insert({
    seminartermin_option_id: optionId,
    text: String(formData.get("text")),
    sortierung: Number(formData.get("sortierung") || 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function createBuchung(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const organisationId = formData.get("organisation_id") || null;
  const modus = String(formData.get("modus") || "seminar");

  // Bei mehreren Teilnehmern (Gruppenbuchung) ist der erste Teilnehmer auch
  // Rechnungsempfänger, falls keine Organisation angegeben ist.
  const ersterTeilnehmerId = String(formData.get("teilnehmer_id_0") || formData.get("teilnehmer_id"));

  const { data: buchung, error } = await supabase
    .from("buchungen")
    .insert({
      organisation_id: organisationId || null,
      rechnungsempfaenger_teilnehmer_id: organisationId ? null : ersterTeilnehmerId,
      status: "bestaetigt",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (modus === "individuell") {
    const teilnehmerId = String(formData.get("teilnehmer_id"));
    const listenpreis = Number(formData.get("il_listenpreis") || 0);
    const rabatt = Number(formData.get("il_rabatt_betrag") || 0);
    const { error: posError } = await supabase.from("buchungspositionen").insert({
      buchung_id: buchung.id,
      teilnehmer_id: teilnehmerId,
      seminartermin_id: null,
      beschreibung: String(formData.get("il_beschreibung")),
      startdatum: formData.get("il_startdatum") || null,
      enddatum: formData.get("il_enddatum") || null,
      listenpreis,
      rabatt_betrag: rabatt,
    });
    if (posError) throw new Error(posError.message);
  } else {
    const seminarterminId = String(formData.get("seminartermin_id"));

    // Gesammelte Teilnehmerzeilen einlesen (teilnehmer_id_0, seminartermin_option_id_0, listenpreis_0, rabatt_betrag_0, ...)
    const zeilen: { teilnehmerId: string; optionId: string | null; listenpreis: number; rabatt: number }[] = [];
    let i = 0;
    while (formData.has(`teilnehmer_id_${i}`)) {
      const tId = String(formData.get(`teilnehmer_id_${i}`));
      const optionRaw = formData.get(`seminartermin_option_id_${i}`);
      const listenpreis = Number(formData.get(`listenpreis_${i}`) || 0);
      const rabatt = Number(formData.get(`rabatt_betrag_${i}`) || 0);
      zeilen.push({ teilnehmerId: tId, optionId: optionRaw ? String(optionRaw) : null, listenpreis, rabatt });
      i++;
    }
    if (zeilen.length === 0) {
      const optionRaw = formData.get("seminartermin_option_id");
      zeilen.push({
        teilnehmerId: String(formData.get("teilnehmer_id")),
        optionId: optionRaw ? String(optionRaw) : null,
        listenpreis: Number(formData.get("listenpreis") || 0),
        rabatt: Number(formData.get("rabatt_betrag") || 0),
      });
    }

    const { error: posError } = await supabase.from("buchungspositionen").insert(
      zeilen.map((z) => ({
        buchung_id: buchung.id,
        teilnehmer_id: z.teilnehmerId,
        seminartermin_id: seminarterminId,
        seminartermin_option_id: z.optionId,
        listenpreis: z.listenpreis,
        rabatt_betrag: z.rabatt,
      }))
    );
    if (posError) throw new Error(posError.message);
  }

  revalidatePath("/buchungen");
  redirect("/buchungen");
}

export async function stornoBuchung(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const buchungId = String(formData.get("buchung_id"));
  const grund = String(formData.get("grund") || "");
  const benutzer = await getAktuellerBenutzer();

  const { error } = await supabase
    .from("buchungen")
    .update({ status: "storniert" })
    .eq("id", buchungId);
  if (error) throw new Error(error.message);

  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "buchung",
    bezug_id: buchungId,
    ereignis: "storno",
    beschreibung: grund || "Storno ohne angegebenen Grund",
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath("/buchungen");
  revalidatePath(`/buchungen/${buchungId}`);
  redirect(`/buchungen/${buchungId}`);
}

export async function umbuchenBuchung(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const buchungId = String(formData.get("buchung_id"));
  const positionId = String(formData.get("position_id"));
  const neuerTerminId = String(formData.get("neuer_seminartermin_id"));

  const { data: altePosition } = await supabase
    .from("buchungspositionen")
    .select("*, seminartermine(datum_start, seminartypen(name))")
    .eq("id", positionId)
    .single();

  const { error } = await supabase
    .from("buchungspositionen")
    .update({ seminartermin_id: neuerTerminId })
    .eq("id", positionId);
  if (error) throw new Error(error.message);

  const { data: neuerTermin } = await supabase
    .from("seminartermine")
    .select("datum_start, seminartypen(name)")
    .eq("id", neuerTerminId)
    .single();

  const altBeschreibung = altePosition?.seminartermine
    ? `${(altePosition.seminartermine as any).seminartypen?.name} – ${altePosition.seminartermine.datum_start}`
    : "unbekannt";
  const neuBeschreibung = neuerTermin
    ? `${(neuerTermin.seminartypen as any)?.name} – ${neuerTermin.datum_start}`
    : "unbekannt";

  const benutzerUmbuchung = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "buchung",
    bezug_id: buchungId,
    ereignis: "umbuchung",
    beschreibung: `Von "${altBeschreibung}" auf "${neuBeschreibung}" umgebucht.`,
    bearbeiter: benutzerUmbuchung?.name || "Unbekannt",
  });

  revalidatePath("/buchungen");
  revalidatePath(`/buchungen/${buchungId}`);
  redirect(`/buchungen/${buchungId}`);
}

export async function createPreisstaffel(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("preisstaffeln").insert({
    seminartermin_option_id: optionId,
    name: String(formData.get("name")),
    stichtag_tage_vor_start: Number(formData.get("stichtag_tage_vor_start") || 0),
    preis: Number(formData.get("preis")),
    sortierung: Number(formData.get("stichtag_tage_vor_start") || 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function createUrgencyStufe(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const schwellenwert = Number(formData.get("schwellenwert_prozent"));
  const { error } = await supabase.from("urgency_stufen").insert({
    seminartermin_id: seminarterminId,
    schwellenwert_prozent: schwellenwert,
    text_vorlage: String(formData.get("text_vorlage")),
    sortierung: schwellenwert,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function createLead(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("leads").insert({
    name: String(formData.get("name")),
    firma: formData.get("firma") || null,
    email: formData.get("email") || null,
    telefon: formData.get("telefon") || null,
    interesse_seminartyp_id: formData.get("interesse_seminartyp_id") || null,
    quelle: formData.get("quelle") || null,
    grund: formData.get("grund") || null,
    notizen: formData.get("notizen") || null,
    wiedervorlage_am: formData.get("wiedervorlage_am") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function updateLeadStatus(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const leadId = String(formData.get("lead_id"));
  const status = String(formData.get("status"));
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function createWartelisteEintrag(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("warteliste").insert({
    seminartermin_id: seminarterminId,
    email: String(formData.get("email")),
    name: formData.get("name") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/warteliste");
  redirect("/warteliste");
}

export async function benachrichtigeWarteliste(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const eintragId = String(formData.get("eintrag_id"));
  const { error } = await supabase
    .from("warteliste")
    .update({ benachrichtigt_am: new Date().toISOString() })
    .eq("id", eintragId);
  if (error) throw new Error(error.message);
  revalidatePath("/warteliste");
  redirect("/warteliste");
}

export async function createCommunityGruppe(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("community_gruppen").insert({
    name: String(formData.get("name")),
    typ: String(formData.get("typ") || "stammtisch"),
    beschreibung: formData.get("beschreibung") || null,
    zugangsweg: formData.get("zugangsweg") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/community");
  redirect("/community");
}

export async function addTeilnehmerZuCommunity(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const gruppeId = String(formData.get("community_gruppe_id"));
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const { error } = await supabase.from("teilnehmer_community_status").insert({
    community_gruppe_id: gruppeId,
    teilnehmer_id: teilnehmerId,
    status: "eingeladen",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/community");
  redirect("/community");
}

export async function createMitarbeiter(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("mitarbeiter").insert({
    name: String(formData.get("name")),
    email: formData.get("email") || null,
    telefon: formData.get("telefon") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/mitarbeiter");
  redirect("/mitarbeiter");
}

export async function deaktiviereMitarbeiter(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const mitarbeiterId = String(formData.get("mitarbeiter_id"));
  const { error } = await supabase
    .from("mitarbeiter")
    .update({ aktiv: false })
    .eq("id", mitarbeiterId);
  if (error) throw new Error(error.message);
  revalidatePath("/mitarbeiter");
  redirect("/mitarbeiter");
}

export async function addMitarbeiterZuTermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const mitarbeiterId = String(formData.get("mitarbeiter_id"));
  const rolle = String(formData.get("rolle") || "Referent");
  const { error } = await supabase.from("seminartermin_mitarbeiter").insert({
    seminartermin_id: seminarterminId,
    mitarbeiter_id: mitarbeiterId,
    rolle,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function removeMitarbeiterVonTermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const zuordnungId = String(formData.get("zuordnung_id"));
  const { error } = await supabase
    .from("seminartermin_mitarbeiter")
    .delete()
    .eq("id", zuordnungId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function updateSeminarOption(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase
    .from("seminartermin_optionen")
    .update({
      titel: String(formData.get("titel")),
      beschreibung: formData.get("beschreibung") || null,
      sortierung: Number(formData.get("sortierung") || 0),
    })
    .eq("id", optionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function deleteSeminarOption(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("seminartermin_optionen").delete().eq("id", optionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function deleteOptionFeature(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const featureId = String(formData.get("feature_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("seminartermin_options_features").delete().eq("id", featureId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function deletePreisstaffel(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const preisstaffelId = String(formData.get("preisstaffel_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("preisstaffeln").delete().eq("id", preisstaffelId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  redirect(`/termine/${seminarterminId}`);
}

export async function sendeTestMail(formData: FormData) {
  const an = String(formData.get("an") || "");
  const betreff = String(formData.get("betreff") || "Test-Mail von AgencyUplifted");
  const nachricht = String(formData.get("nachricht") || "Das ist eine Testmail aus der Seminarverwaltung.");

  let fehlermeldung: string | null = null;
  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from: ABSENDER,
      to: [an],
      subject: betreff,
      html: `<p>${nachricht.replace(/\n/g, "<br/>")}</p>`,
    });
    if (error) fehlermeldung = error.message;
  } catch (e: any) {
    fehlermeldung = e?.message || "Unbekannter Fehler beim Versand.";
  }

  if (fehlermeldung) {
    redirect(`/email-test?fehler=${encodeURIComponent(fehlermeldung)}`);
  }
  redirect("/email-test?erfolg=1");
}

export async function createFunnelMail(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("funnel_mails").insert({
    name: String(formData.get("name")),
    trigger_typ: String(formData.get("trigger_typ")),
    versatz_tage: Number(formData.get("versatz_tage") || 0),
    betreff: String(formData.get("betreff")),
    inhalt: String(formData.get("inhalt")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect("/funnel");
}

export async function updateFunnelMail(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id"));
  const { error } = await supabase
    .from("funnel_mails")
    .update({
      name: String(formData.get("name")),
      trigger_typ: String(formData.get("trigger_typ")),
      versatz_tage: Number(formData.get("versatz_tage") || 0),
      betreff: String(formData.get("betreff")),
      inhalt: String(formData.get("inhalt")),
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect("/funnel");
}

export async function toggleFunnelMailAktiv(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id"));
  const aktivNeu = String(formData.get("aktiv_neu")) === "true";
  const { error } = await supabase.from("funnel_mails").update({ aktiv: aktivNeu }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect("/funnel");
}

export async function deleteFunnelMail(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("funnel_mails").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect("/funnel");
}

export async function funnelVersandJetzt() {
  const { pruefeUndSendeFaelligeFunnelMails } = await import("./funnel");
  const ergebnis = await pruefeUndSendeFaelligeFunnelMails();
  revalidatePath("/funnel");
  redirect(
    `/funnel?lauf=1&gesendet=${ergebnis.gesendet}&fehler=${ergebnis.fehler}&uebersprungen=${ergebnis.uebersprungen}&geprueft=${ergebnis.geprueft}`
  );
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const passwort = String(formData.get("passwort") || "");
  const weiter = String(formData.get("weiter") || "/");

  const supabase = getSupabaseAdmin();
  const { data: mitarbeiter } = await supabase
    .from("mitarbeiter")
    .select("id, name, passwort_hash, aktiv")
    .ilike("email", email)
    .maybeSingle();

  const gueltig =
    !!mitarbeiter?.aktiv &&
    !!mitarbeiter?.passwort_hash &&
    (await pruefePasswort(passwort, mitarbeiter.passwort_hash));

  if (!gueltig || !mitarbeiter) {
    redirect(`/login?fehler=1&weiter=${encodeURIComponent(weiter)}`);
  }

  const token = await signSession({
    mitarbeiterId: mitarbeiter.id,
    name: mitarbeiter.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });

  redirect(weiter || "/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export async function setMitarbeiterZugang(formData: FormData) {
  const id = String(formData.get("id"));
  const email = String(formData.get("email") || "").trim();
  const neuesPasswort = String(formData.get("neues_passwort") || "");

  const updates: Record<string, string> = {};
  if (email) updates.email = email;
  if (neuesPasswort) {
    if (neuesPasswort.length < 8) throw new Error("Passwort muss mindestens 8 Zeichen haben.");
    updates.passwort_hash = await hashePasswort(neuesPasswort);
  }

  if (Object.keys(updates).length) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("mitarbeiter").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/mitarbeiter");
  redirect("/mitarbeiter");
}
