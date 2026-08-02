"use server";

import { getSupabaseAdmin } from "./supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
    vorname: String(formData.get("vorname")),
    nachname: String(formData.get("nachname")),
    email: String(formData.get("email")),
    telefon: formData.get("telefon") || null,
    linkedin_url: formData.get("linkedin_url") || null,
    ernaehrung_sonderwuensche: formData.get("ernaehrung") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/teilnehmer");
  redirect("/teilnehmer");
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
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const preis = Number(formData.get("preis") || 0);
  if (preis > 0) {
    await supabase.from("preisstaffeln").insert({
      seminartermin_id: termin.id,
      name: "Normalpreis",
      stichtag_tage_vor_start: 0,
      preis,
    });
  }

  revalidatePath("/termine");
  redirect("/termine");
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
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/termine");
  revalidatePath(`/termine/${id}`);
  redirect(`/termine/${id}`);
}

export async function createBuchung(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const organisationId = formData.get("organisation_id") || null;
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const modus = String(formData.get("modus") || "seminar");

  const { data: buchung, error } = await supabase
    .from("buchungen")
    .insert({
      organisation_id: organisationId || null,
      rechnungsempfaenger_teilnehmer_id: organisationId ? null : teilnehmerId,
      status: "bestaetigt",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (modus === "individuell") {
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
    const listenpreis = Number(formData.get("listenpreis") || 0);
    const rabatt = Number(formData.get("rabatt_betrag") || 0);
    const { error: posError } = await supabase.from("buchungspositionen").insert({
      buchung_id: buchung.id,
      teilnehmer_id: teilnehmerId,
      seminartermin_id: seminarterminId,
      listenpreis,
      rabatt_betrag: rabatt,
    });
    if (posError) throw new Error(posError.message);
  }

  revalidatePath("/buchungen");
  redirect("/buchungen");
}

export async function stornoBuchung(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const buchungId = String(formData.get("buchung_id"));
  const grund = String(formData.get("grund") || "");

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
    bearbeiter: "Markus Hartmann",
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

  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "buchung",
    bezug_id: buchungId,
    ereignis: "umbuchung",
    beschreibung: `Von "${altBeschreibung}" auf "${neuBeschreibung}" umgebucht.`,
    bearbeiter: "Markus Hartmann",
  });

  revalidatePath("/buchungen");
  revalidatePath(`/buchungen/${buchungId}`);
  redirect(`/buchungen/${buchungId}`);
}

export async function createPreisstaffel(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("preisstaffeln").insert({
    seminartermin_id: seminarterminId,
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
