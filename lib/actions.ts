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

export async function createSeminartermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const { data: termin, error } = await supabase
    .from("seminartermine")
    .insert({
      seminartyp_id: String(formData.get("seminartyp_id")),
      datum_start: String(formData.get("datum_start")),
      dauer_tage: Number(formData.get("dauer_tage") || 1),
      format: String(formData.get("format") || "praesenz"),
      veranstaltungsort_id: formData.get("veranstaltungsort_id") || null,
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

export async function createBuchung(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const organisationId = formData.get("organisation_id") || null;
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const listenpreis = Number(formData.get("listenpreis") || 0);
  const rabatt = Number(formData.get("rabatt_betrag") || 0);

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

  const { error: posError } = await supabase.from("buchungspositionen").insert({
    buchung_id: buchung.id,
    teilnehmer_id: teilnehmerId,
    seminartermin_id: seminarterminId,
    listenpreis,
    rabatt_betrag: rabatt,
  });
  if (posError) throw new Error(posError.message);

  revalidatePath("/buchungen");
  redirect("/buchungen");
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
