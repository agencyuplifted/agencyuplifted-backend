"use server";

import { ladeBausteine, schalterAus, baueMailHtml } from "@/lib/mail-bausteine";
import { getSupabaseAdmin } from "./supabase";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getResend, ABSENDER } from "./email";
import { signSession, SESSION_COOKIE_NAME, SESSION_TTL } from "./session";
import { hashePasswort, pruefePasswort } from "./passwort";
import { getAktuellerBenutzer } from "./auth";
import { TERMIN_FELD_LABELS, formatDatum } from "./format";
import { renderPlatzhalter } from "./funnel";
import { INBOX_TEXT_MAX, INBOX_TYPEN, INBOX_STATUS, INBOX_BEREICHE, INBOX_FORMATE, nurErlaubte } from "./inbox";
import { TEILNAHME, TURNUS, EVENT_ROLLEN, KONTAKT_STATUS, nurErlaubterWert, berlinHeute, tagPlus } from "./events";
import { FREQUENZEN, sendeErinnerung, type Erinnerung } from "./erinnerungen";
import { randomBytes } from "crypto";
import { getNetzwerkGruppen, sendeNetzwerkLink, getNetzwerkAuthKonfig } from "./netzwerk";
import { verknuepfeTeilnehmerMitOrganisationAutomatisch } from "./organisationsverknuepfung";
import { schaetzeAnredeAusVorname } from "./geschlecht";
import { randomUUID } from "crypto";
import { erzeugeSlug, eindeutigerSlug, erzeugeTagSlug } from "./insights";
import { holeAutocompleteVorschlaege } from "./themen-radar";
import {
  stichtagsDatumEndeDesTages,
  berechneMonatlicheStichtageRueckwaerts,
  normalisiereVorlageStufen,
  normalisiereStichtagRegel,
  berechneVorlagenStichtage,
  stufenMitFestemDatum,
  type PreisstaffelVorlage,
  type PreisstaffelVorlageStufe,
  type StichtagRegel,
} from "./preisstaffeln";
import { fetchFastbillInvoices, findePreisMatch } from "./fastbill";

// Backstage-Login in JEDER exportierten Action (ausser loginAction) selbst
// pruefen: Server Actions sind per Action-ID von jeder Route aus aufrufbar
// (POST mit Next-Action-Header), auch von /login, /wissen, /netzwerk oder
// /api/public, die die Middleware bewusst ohne Session durchlaesst -- und die
// IDs stehen in den oeffentlichen JS-Chunks unter /_next/static. Der
// Middleware-Schutz der Backstage-Seiten allein reicht deshalb nicht.
// Zwei Varianten passend zu den zwei Rueckgabe-Mustern dieser Datei:

// Fuer Actions mit redirect()/throw: ohne Session auf /login umleiten.
// redirect() wirft intern, der Rest der Action laeuft also nie.
async function requireBackstageLogin(): Promise<void> {
  const benutzer = await getAktuellerBenutzer();
  if (!benutzer) redirect("/login");
}

// Fuer Actions, die { fehler } zurueckgeben (AktionsFormular): der Hinweis
// erscheint direkt am Formular statt einer Umleitung mitten in der Eingabe.
async function pruefeBackstageLogin(): Promise<string | null> {
  const benutzer = await getAktuellerBenutzer();
  return benutzer ? null : "Nicht angemeldet.";
}

// Ermittelt Anrede + Quelle fuer ein Formularfeld: explizite Angabe (Herr/Frau/
// Divers) gilt als 'manuell' und wird nie durch die Namens-Heuristik ersetzt.
// Ist nichts angegeben, wird per Vornamen geschaetzt ('automatisch'); schlaegt
// auch das fehl, bleibt es bei keine_angabe/ohne Quelle.
function ermittleAnredeUndQuelle(
  formAnrede: FormDataEntryValue | null,
  vorname: string
): { anrede: string; anrede_quelle: string | null } {
  const wert = String(formAnrede || "").trim();
  if (wert && wert !== "keine_angabe") {
    return { anrede: wert, anrede_quelle: "manuell" };
  }
  const geschaetzt = schaetzeAnredeAusVorname(vorname);
  if (geschaetzt) {
    return { anrede: geschaetzt, anrede_quelle: "automatisch" };
  }
  return { anrede: "keine_angabe", anrede_quelle: null };
}

export async function createOrganisation(formData: FormData) {
  await requireBackstageLogin();
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
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const vorname = String(formData.get("vorname"));
  const { anrede, anrede_quelle } = ermittleAnredeUndQuelle(formData.get("anrede"), vorname);
  const { error } = await supabase.from("teilnehmer").insert({
    anrede,
    anrede_quelle,
    unternehmer_status: formData.get("unternehmer_status") || "unbekannt",
    vorname,
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

export async function updateSeminartypFarbe(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartyp_id"));
  const farbe = String(formData.get("farbe") || "#102A4C");
  const { error } = await supabase.from("seminartypen").update({ farbe }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/seminartypen");
  revalidatePath("/termine");
  redirect("/seminartypen");
}

export async function createSeminartyp(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("seminartypen").insert({
    name: String(formData.get("name")),
    kurzbeschreibung: formData.get("kurzbeschreibung") || null,
    farbe: String(formData.get("farbe") || "#102A4C"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/seminartypen");
  redirect("/seminartypen");
}

export async function updateSeminartyp(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartyp_id"));
  const { error } = await supabase
    .from("seminartypen")
    .update({
      name: String(formData.get("name")),
      kurzbeschreibung: formData.get("kurzbeschreibung") || null,
      farbe: String(formData.get("farbe") || "#102A4C"),
      aktiv: formData.get("aktiv") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/seminartypen");
  revalidatePath("/termine");
  redirect("/seminartypen");
}

export async function updateTeilnehmerStammdaten(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("teilnehmer")
    .update({
      ...ermittleAnredeUndQuelle(formData.get("anrede"), String(formData.get("vorname"))),
      rolle: formData.get("rolle") || "teilnehmer",
      unternehmer_status: formData.get("unternehmer_status") || "unbekannt",
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
      teilnehmerliste_freigabe: formData.get("teilnehmerliste_freigabe") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/teilnehmer/${id}`);
  redirect(`/teilnehmer/${id}`);
}

// Verknuepft einen Teilnehmer mit einer Organisation (M:N, siehe
// teilnehmer_organisationen). Ein Teilnehmer kann mehrere Organisationen
// haben (z.B. bei mehreren moeglichen Rechnungsempfaengern) - eine davon ist
// als "Hauptorganisation" markiert. Ist es die erste Verknuepfung, wird sie
// automatisch zur Hauptorganisation.
export async function verknuepfeTeilnehmerOrganisation(formData: FormData) {
  await requireBackstageLogin();
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const organisationId = String(formData.get("organisation_id"));
  if (!organisationId) throw new Error("Bitte eine Organisation auswaehlen.");

  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("teilnehmer_organisationen")
    .select("id", { count: "exact", head: true })
    .eq("teilnehmer_id", teilnehmerId);

  const { error } = await supabase.from("teilnehmer_organisationen").insert({
    teilnehmer_id: teilnehmerId,
    organisation_id: organisationId,
    ist_hauptorganisation: (count || 0) === 0,
    quelle: "manuell",
  });
  if (error) {
    if (error.code === "23505") throw new Error("Diese Organisation ist bereits verknuepft.");
    throw new Error(error.message);
  }

  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  redirect(`/teilnehmer/${teilnehmerId}`);
}

export async function entferneTeilnehmerOrganisation(formData: FormData) {
  await requireBackstageLogin();
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const organisationId = String(formData.get("organisation_id"));

  const supabase = getSupabaseAdmin();
  const { data: verknuepfung } = await supabase
    .from("teilnehmer_organisationen")
    .select("ist_hauptorganisation")
    .eq("teilnehmer_id", teilnehmerId)
    .eq("organisation_id", organisationId)
    .single();

  const { error } = await supabase
    .from("teilnehmer_organisationen")
    .delete()
    .eq("teilnehmer_id", teilnehmerId)
    .eq("organisation_id", organisationId);
  if (error) throw new Error(error.message);

  // War es die Hauptorganisation, automatisch eine verbleibende zur neuen
  // Hauptorganisation machen (falls noch welche uebrig sind).
  if (verknuepfung?.ist_hauptorganisation) {
    const { data: verbleibende } = await supabase
      .from("teilnehmer_organisationen")
      .select("id")
      .eq("teilnehmer_id", teilnehmerId)
      .order("erstellt_am", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (verbleibende) {
      await supabase.from("teilnehmer_organisationen").update({ ist_hauptorganisation: true }).eq("id", verbleibende.id);
    }
  }

  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  redirect(`/teilnehmer/${teilnehmerId}`);
}

export async function setzeHauptorganisation(formData: FormData) {
  await requireBackstageLogin();
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const organisationId = String(formData.get("organisation_id"));

  const supabase = getSupabaseAdmin();
  // Erst alle Verknuepfungen dieses Teilnehmers auf false setzen, dann die
  // gewaehlte auf true - vermeidet einen Konflikt mit dem Unique-Index
  // (genau eine Hauptorganisation pro Teilnehmer).
  const { error: resetError } = await supabase
    .from("teilnehmer_organisationen")
    .update({ ist_hauptorganisation: false })
    .eq("teilnehmer_id", teilnehmerId);
  if (resetError) throw new Error(resetError.message);

  const { error } = await supabase
    .from("teilnehmer_organisationen")
    .update({ ist_hauptorganisation: true })
    .eq("teilnehmer_id", teilnehmerId)
    .eq("organisation_id", organisationId);
  if (error) throw new Error(error.message);

  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  redirect(`/teilnehmer/${teilnehmerId}`);
}

export async function setMarketingConsentStatus(formData: FormData) {
  await requireBackstageLogin();
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

const REFERENZEN_BUCKET = "referenzen";

async function ladeReferenzBildHoch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  teilnehmerId: string,
  datei: File | null
): Promise<string | null> {
  if (!datei || datei.size === 0) return null;
  const endungRoh = datei.name.includes(".") ? datei.name.split(".").pop() : null;
  const endung = endungRoh && endungRoh.length <= 5 ? endungRoh : "png";
  const pfad = `${teilnehmerId}/${randomUUID()}.${endung}`;
  const { error } = await supabase.storage.from(REFERENZEN_BUCKET).upload(pfad, datei, {
    contentType: datei.type || "image/png",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return pfad;
}

// Referenzen/Testimonials pro Teilnehmer (Phase 1 - reines Sammeln in der
// Verwaltung; Ausspielen auf der Website via Onepage ist bewusst noch nicht
// gebaut, siehe Backlog). Bilder landen im oeffentlichen Storage-Bucket
// "referenzen" (Pfad statt fertiger URL gespeichert, damit sich eine
// Public-URL jederzeit frisch ableiten laesst und Loeschen sauber funktioniert).
export async function createTeilnehmerReferenz(formData: FormData) {
  await requireBackstageLogin();
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const redirectTo = String(formData.get("redirect_to") || `/teilnehmer/${teilnehmerId}`);
  const supabase = getSupabaseAdmin();

  const profilfoto = formData.get("profilfoto") as File | null;
  const agenturLogo = formData.get("agentur_logo") as File | null;

  const profilfotoPfad = await ladeReferenzBildHoch(supabase, teilnehmerId, profilfoto);
  const agenturLogoPfad = await ladeReferenzBildHoch(supabase, teilnehmerId, agenturLogo);
  const text = formData.get("text");

  const { error } = await supabase.from("teilnehmer_referenzen").insert({
    teilnehmer_id: teilnehmerId,
    profilfoto_pfad: profilfotoPfad,
    agentur_logo_pfad: agenturLogoPfad,
    text: text ? String(text) : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  revalidatePath("/referenzen");
  redirect(redirectTo);
}

export async function deleteTeilnehmerReferenz(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const redirectTo = String(formData.get("redirect_to") || `/teilnehmer/${teilnehmerId}`);
  const supabase = getSupabaseAdmin();

  const { data: referenz } = await supabase
    .from("teilnehmer_referenzen")
    .select("profilfoto_pfad, agentur_logo_pfad")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("teilnehmer_referenzen").delete().eq("id", id);
  if (error) throw new Error(error.message);

  const zuLoeschendePfade = [referenz?.profilfoto_pfad, referenz?.agentur_logo_pfad].filter(Boolean) as string[];
  if (zuLoeschendePfade.length) {
    await supabase.storage.from(REFERENZEN_BUCKET).remove(zuLoeschendePfade);
  }

  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  revalidatePath("/referenzen");
  redirect(redirectTo);
}

export async function toggleReferenzFreigabe(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const neuerWert = formData.get("neuer_wert") === "true";
  const redirectTo = String(formData.get("redirect_to") || `/teilnehmer/${teilnehmerId}`);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("teilnehmer_referenzen")
    .update({ freigegeben_fuer_onepage: neuerWert, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  revalidatePath("/referenzen");
  redirect(redirectTo);
}

export async function createTrainer(formData: FormData) {
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const datumStart = String(formData.get("datum_start"));
  const datumEnde = formData.get("datum_ende") || datumStart;
  const { data: termin, error } = await supabase
    .from("seminartermine")
    .insert({
      titel: formData.get("titel") || null,
      kennung: formData.get("kennung") || null,
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
      verfuegbarkeit_anzeige_modus: String(formData.get("verfuegbarkeit_anzeige_modus") || "zahlen"),
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

// Schreibt die eingereichten Formulardaten nicht in die DB, sondern leitet zur
// Vorschau-/Bestätigungsseite weiter (doppelte Freigabe für Termin-Änderungen).
export async function previewSeminarterminUpdate(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("seminartermin_id"));
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params.set(key, value);
  }
  redirect(`/termine/${id}/bestaetigen?${params.toString()}`);
}

export async function updateSeminartermin(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartermin_id"));
  const datumStart = String(formData.get("datum_start"));
  const datumEnde = formData.get("datum_ende") || datumStart;

  const { data: alterTermin } = await supabase
    .from("seminartermine")
    .select("*, seminartypen(name), veranstaltungsorte(name), trainer(name)")
    .eq("id", id)
    .single();

  const neuerOrtId = formData.get("veranstaltungsort_id");
  const neuerTrainerId = formData.get("trainer_id");
  const neuerSeminartypId = formData.get("seminartyp_id");
  const neuerOrt = neuerOrtId
    ? (await supabase.from("veranstaltungsorte").select("name").eq("id", String(neuerOrtId)).single()).data?.name
    : null;
  const neuerTrainer = neuerTrainerId
    ? (await supabase.from("trainer").select("name").eq("id", String(neuerTrainerId)).single()).data?.name
    : null;
  const neuerSeminartyp = neuerSeminartypId
    ? (await supabase.from("seminartypen").select("name").eq("id", String(neuerSeminartypId)).single()).data?.name
    : null;

  const update = {
    seminartyp_id: formData.get("seminartyp_id") || null,
    titel: formData.get("titel") || null,
    kennung: formData.get("kennung") || null,
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
    vorabendanreise_inklusive: formData.get("vorabendanreise_inklusive") === "on",
    zusatzteilnehmer_preis: formData.get("zusatzteilnehmer_preis")
      ? Number(formData.get("zusatzteilnehmer_preis"))
      : null,
    zusatzteilnehmer_rabatt_prozent: formData.get("zusatzteilnehmer_rabatt_prozent")
      ? Number(formData.get("zusatzteilnehmer_rabatt_prozent"))
      : null,
    untertitel: formData.get("untertitel") || null,
    eyebrow_text: formData.get("eyebrow_text") || null,
    onepage_slug: formData.get("onepage_slug") || null,
    zimmerupgrade_beschreibung: formData.get("zimmerupgrade_beschreibung") || null,
    zimmerupgrade_preis_pro_nacht_netto: formData.get("zimmerupgrade_preis_pro_nacht_netto")
      ? Number(formData.get("zimmerupgrade_preis_pro_nacht_netto"))
      : null,
    selbstauskunft_label: formData.get("selbstauskunft_label") || null,
    selbstauskunft_aktiv: formData.get("selbstauskunft_aktiv") === "on",
    // Die Anzeige-Einstellungen der Website liegen jetzt in einer eigenen
    // Karte mit eigenem Formular (updateVerfuegbarkeitsAnzeige). Kommen sie
    // hier ausnahmsweise doch mit (z. B. ueber einen alten Link auf die
    // Bestaetigungsseite), werden sie uebernommen -- fehlen sie, bleiben sie
    // unveraendert, statt auf null zurueckzufallen.
    ...(formData.has("verfuegbarkeit_anzeige_modus")
      ? { verfuegbarkeit_anzeige_modus: String(formData.get("verfuegbarkeit_anzeige_modus") || "zahlen") }
      : {}),
    ...(formData.has("angezeigte_restplaetze")
      ? { angezeigte_restplaetze: formData.get("angezeigte_restplaetze") ? Number(formData.get("angezeigte_restplaetze")) : null }
      : {}),
    ...(formData.has("urgency_label_template")
      ? { urgency_label_template: formData.get("urgency_label_template") || null }
      : {}),
  };

  const { error } = await supabase.from("seminartermine").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  if (alterTermin) {
    const neuAnzeige = (feld: string): string => {
      if (feld === "veranstaltungsort_id") return neuerOrt || "—";
      if (feld === "trainer_id") return neuerTrainer || "—";
      if (feld === "seminartyp_id") return neuerSeminartyp || "—";
      const wert = (update as any)[feld];
      return wert === null || wert === undefined || wert === "" ? "—" : String(wert);
    };
    const altAnzeige = (feld: string): string => {
      if (feld === "veranstaltungsort_id") return (alterTermin as any).veranstaltungsorte?.name || "—";
      if (feld === "trainer_id") return (alterTermin as any).trainer?.name || "—";
      if (feld === "seminartyp_id") return (alterTermin as any).seminartypen?.name || "—";
      const wert = (alterTermin as any)[feld];
      return wert === null || wert === undefined || wert === "" ? "—" : String(wert);
    };

    const ZEIT_FELDER = new Set(["zeit_start", "zeit_ende", "vorabend_anreise_uhrzeit"]);
    const normalisiert = (feld: string, wert: any): string => {
      if (wert === null || wert === undefined || wert === "") return "";
      if (ZEIT_FELDER.has(feld) && typeof wert === "string") return wert.slice(0, 5);
      return String(wert);
    };
    const geaenderteFelder = Object.keys(update).filter((feld) => {
      const alt = (alterTermin as any)[feld] ?? null;
      const neu = (update as any)[feld] ?? null;
      return normalisiert(feld, alt) !== normalisiert(feld, neu);
    });

    if (geaenderteFelder.length > 0) {
      const beschreibung = geaenderteFelder
        .map((feld) => `${TERMIN_FELD_LABELS[feld] || feld}: "${altAnzeige(feld)}" → "${neuAnzeige(feld)}"`)
        .join("; ");

      const benutzer = await getAktuellerBenutzer();
      await supabase.from("aenderungsprotokoll").insert({
        bezug_typ: "seminartermin",
        bezug_id: id,
        ereignis: "aktualisierung",
        beschreibung,
        bearbeiter: benutzer?.name || "Unbekannt",
      });
    }
  }

  revalidatePath("/termine");
  revalidatePath(`/termine/${id}`);
  redirect(`/termine/${id}`);
}

export async function duplicateSeminartermin(formData: FormData) {
  await requireBackstageLogin();
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
      kennung: null,
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
        vorspann_text: opt.vorspann_text,
        vorspann_anzeigen: opt.vorspann_anzeigen || false,
      })
      .select()
      .single();
    if (optErr) throw new Error(optErr.message);

    if (opt.seminartermin_options_features?.length) {
      await supabase.from("seminartermin_options_features").insert(
        opt.seminartermin_options_features.map((f: any) => ({
          seminartermin_option_id: neueOption.id,
          text: f.text,
          label: f.label,
          hervorgehoben: f.hervorgehoben || false,
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
          stichtag_datum: p.stichtag_datum,
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
        schwellenwert_typ: u.schwellenwert_typ,
        schwellenwert_prozent: u.schwellenwert_prozent,
        schwellenwert_anzahl: u.schwellenwert_anzahl,
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

// "Schnelleinfuegen" (siehe NeueOptionSchnelleinfuegen.tsx/
// OptionSchnelleinfuegen.tsx) fuellt das versteckte Feld "features_text" mit
// den geparsten Feature-Zeilen als JSON-Array ({label?, detail,
// isHighlighted}[]) statt reinem Zeilentext, da eine Feature-Zeile jetzt aus
// mehr als nur einem String besteht -- FormData kann keine Objekte tragen,
// daher JSON-kodiert. Normalerweise leer (kein Schnelleinfuegen benutzt).
function leseGeparsteFeatures(formData: FormData): { label: string | null; text: string; hervorgehoben: boolean }[] {
  const roh = String(formData.get("features_text") || "").trim();
  if (!roh) return [];
  let geparst: any[];
  try {
    geparst = JSON.parse(roh);
  } catch {
    return [];
  }
  if (!Array.isArray(geparst)) return [];
  return geparst
    .map((f) => ({
      label: typeof f?.label === "string" && f.label.trim() ? f.label.trim() : null,
      text: typeof f?.detail === "string" ? f.detail.trim() : "",
      hervorgehoben: !!f?.isHighlighted,
    }))
    .filter((f) => f.text);
}

export async function createSeminarOption(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { data: neueOption, error } = await supabase
    .from("seminartermin_optionen")
    .insert({
      seminartermin_id: seminarterminId,
      titel: String(formData.get("titel")),
      beschreibung: formData.get("beschreibung") || null,
      badge: formData.get("badge") || null,
      sortierung: Number(formData.get("sortierung") || 0),
      vorspann_text: formData.get("vorspann_text") || null,
      vorspann_anzeigen: formData.get("vorspann_anzeigen") === "on",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const features = leseGeparsteFeatures(formData);
  if (features.length) {
    const { error: featuresError } = await supabase.from("seminartermin_options_features").insert(
      features.map((f, i) => ({ seminartermin_option_id: neueOption.id, text: f.text, label: f.label, hervorgehoben: f.hervorgehoben, sortierung: i }))
    );
    if (featuresError) throw new Error(featuresError.message);
  }

  revalidatePath(`/termine/${seminarterminId}`);
}

// "Schnelleinfuegen" fuer eine BESTEHENDE Option (siehe OptionSchnelleinfuegen.tsx
// + lib/schnelleinfuegen.ts): ersetzt Titel, Beschreibung und ALLE Features
// dieser Option atomar in einem Schritt -- kein Zusammenfuehren/Anhaengen,
// damit erneutes Uebernehmen keine Dubletten anhaeuft. Andere Felder (Badge,
// Sortierung, Zimmerupgrade, Ratenzahlung) bleiben unberuehrt, dafuer bleibt
// das normale "Option bearbeiten"-Formular (updateSeminarOption). Wird direkt
// (nicht per <form>) aus dem Client aufgerufen, damit nach dem Uebernehmen
// per revalidatePath sofort Titel-Feld, Beschreibungsfeld und Features-Liste
// mit dem neuen Inhalt nachladen -- ohne das noch offene Formular zu verlassen.
export async function uebernehmeOptionSchnelleinfuegen(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const titel = String(formData.get("titel") || "").trim();
  const beschreibung = String(formData.get("beschreibung") || "").trim();
  const features = leseGeparsteFeatures(formData);
  // Vorspann-Zeile ist optional im Paste-Text -- fehlt sie, bleibt ein
  // bereits hinterlegter Vorspann-Text/Schalter unangetastet (kein
  // ungewolltes Loeschen nur weil der naechste Paste keine Vorspann-Zeile
  // enthielt). Nur wenn eine "Vorspann:"-Zeile erkannt wurde, wird sie
  // uebernommen und automatisch eingeschaltet.
  const introLabelRoh = formData.get("intro_label");
  const introLabel = typeof introLabelRoh === "string" && introLabelRoh.trim() ? introLabelRoh.trim() : null;

  const { error } = await supabase
    .from("seminartermin_optionen")
    .update({
      titel,
      beschreibung: beschreibung || null,
      ...(introLabel ? { vorspann_text: introLabel, vorspann_anzeigen: true } : {}),
    })
    .eq("id", optionId);
  if (error) throw new Error(error.message);

  const { error: delError } = await supabase
    .from("seminartermin_options_features")
    .delete()
    .eq("seminartermin_option_id", optionId);
  if (delError) throw new Error(delError.message);

  if (features.length) {
    const { error: insError } = await supabase.from("seminartermin_options_features").insert(
      features.map((f, i) => ({ seminartermin_option_id: optionId, text: f.text, label: f.label, hervorgehoben: f.hervorgehoben, sortierung: i }))
    );
    if (insError) throw new Error(insError.message);
  }

  revalidatePath(`/termine/${seminarterminId}`);
}

export async function updateOptionBadge(formData: FormData) {
  await requireBackstageLogin();
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
}

export async function duplicateSeminarOption(formData: FormData) {
  await requireBackstageLogin();
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
      vorspann_text: (quelle as any).vorspann_text,
      vorspann_anzeigen: (quelle as any).vorspann_anzeigen || false,
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
        label: f.label,
        hervorgehoben: f.hervorgehoben || false,
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
        stichtag_datum: p.stichtag_datum,
        preis: p.preis,
        waehrung: p.waehrung,
        sortierung: p.sortierung,
      }))
    );
  }

  revalidatePath(`/termine/${seminarterminId}`);
}

export async function importSeminarOptions(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const optionIds = formData.getAll("option_ids").map(String).filter(Boolean);

  if (!optionIds.length) {
    return;
  }

  const { data: quellOptionen, error: qErr } = await supabase
    .from("seminartermin_optionen")
    .select("*, seminartermin_options_features(*), preisstaffeln(*)")
    .in("id", optionIds);
  if (qErr) throw new Error(qErr.message);

  const { data: bestehende } = await supabase
    .from("seminartermin_optionen")
    .select("sortierung")
    .eq("seminartermin_id", seminarterminId)
    .order("sortierung", { ascending: false })
    .limit(1);
  let naechsteSortierung = (bestehende?.[0]?.sortierung ?? -1) + 1;

  // Reihenfolge der Quell-Optionen beibehalten (nicht die DB-Rueckgabereihenfolge),
  // damit z.B. Option A vor Option B importiert wird, wenn beide ausgewaehlt sind.
  const sortiert = optionIds
    .map((optId) => (quellOptionen as any[])?.find((o) => o.id === optId))
    .filter(Boolean);

  for (const quelle of sortiert) {
    const { data: neueOption, error: insErr } = await supabase
      .from("seminartermin_optionen")
      .insert({
        seminartermin_id: seminarterminId,
        titel: quelle.titel,
        beschreibung: quelle.beschreibung,
        badge: null,
        sortierung: naechsteSortierung,
        zusatz_teilnehmer_hinweis: quelle.zusatz_teilnehmer_hinweis,
        vorspann_text: quelle.vorspann_text,
        vorspann_anzeigen: quelle.vorspann_anzeigen || false,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    naechsteSortierung += 1;

    const features = quelle.seminartermin_options_features;
    if (features?.length) {
      await supabase.from("seminartermin_options_features").insert(
        features.map((f: any) => ({
          seminartermin_option_id: neueOption.id,
          text: f.text,
          label: f.label,
          hervorgehoben: f.hervorgehoben || false,
          sortierung: f.sortierung,
        }))
      );
    }
    const staffeln = quelle.preisstaffeln;
    if (staffeln?.length) {
      await supabase.from("preisstaffeln").insert(
        staffeln.map((p: any) => ({
          seminartermin_option_id: neueOption.id,
          name: p.name,
          stichtag_tage_vor_start: p.stichtag_tage_vor_start,
          stichtag_datum: p.stichtag_datum,
          preis: p.preis,
          waehrung: p.waehrung,
          sortierung: p.sortierung,
        }))
      );
    }
  }

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: seminarterminId,
    ereignis: "optionen_import",
    beschreibung: `${sortiert.length} Option(en) importiert: ${sortiert.map((o: any) => o.titel).join(", ")}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath(`/termine/${seminarterminId}`);
}

export async function createOptionFeature(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  // Neues Feature ans Ende der Liste anhaengen (nicht sortierung: 0 fuer
  // alle -- sonst laesst sich die Reihenfolge per Auf/Ab-Pfeil nicht mehr
  // sinnvoll unterscheiden).
  const { data: bestehende } = await supabase
    .from("seminartermin_options_features")
    .select("sortierung")
    .eq("seminartermin_option_id", optionId)
    .order("sortierung", { ascending: false })
    .limit(1);
  const naechsteSortierung = (bestehende?.[0]?.sortierung ?? -1) + 1;

  const label = String(formData.get("label") || "").trim();
  const { error } = await supabase.from("seminartermin_options_features").insert({
    seminartermin_option_id: optionId,
    text: String(formData.get("text")),
    label: label || null,
    hervorgehoben: formData.get("hervorgehoben") === "on",
    sortierung: naechsteSortierung,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function updateOptionFeature(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const featureId = String(formData.get("feature_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const label = String(formData.get("label") || "").trim();
  const { error } = await supabase
    .from("seminartermin_options_features")
    .update({
      text: String(formData.get("text")),
      label: label || null,
      hervorgehoben: formData.get("hervorgehoben") === "on",
    })
    .eq("id", featureId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

// Gleiches Prinzip wie moveOptionFeature, nur fuer ganze Optionen eines
// Termins: komplette Liste neu durchnummerieren statt zwei Werte zu tauschen,
// weil duplicateSeminarOption (quelle.sortierung + 1) und neu angelegte
// Optionen doppelte bzw. lueckenhafte Werte hinterlassen koennen. Die
// Reihenfolge gilt auch fuer die oeffentliche API (sortiert nach sortierung).
// Deaktivierte Optionen zaehlen mit, damit sie nach dem Reaktivieren wieder
// an ihrem Platz stehen.
export async function moveSeminarOption(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const richtung = String(formData.get("richtung"));

  const { data: optionen, error: ladeFehler } = await supabase
    .from("seminartermin_optionen")
    .select("id, sortierung, erstellt_am")
    .eq("seminartermin_id", seminarterminId)
    .order("sortierung", { ascending: true })
    .order("erstellt_am", { ascending: true });
  if (ladeFehler) throw new Error(ladeFehler.message);

  const liste = optionen || [];
  const index = liste.findIndex((o) => o.id === optionId);
  const zielIndex = richtung === "hoch" ? index - 1 : index + 1;
  if (index === -1 || zielIndex < 0 || zielIndex >= liste.length) return;

  const neueReihenfolge = [...liste];
  [neueReihenfolge[index], neueReihenfolge[zielIndex]] = [neueReihenfolge[zielIndex], neueReihenfolge[index]];

  for (let i = 0; i < neueReihenfolge.length; i++) {
    if (neueReihenfolge[i].sortierung !== i) {
      const { error } = await supabase.from("seminartermin_optionen").update({ sortierung: i }).eq("id", neueReihenfolge[i].id);
      if (error) throw new Error(error.message);
    }
  }

  revalidatePath(`/termine/${seminarterminId}`);
}

// Vertauscht per Auf/Ab-Pfeil die Reihenfolge eines Features mit seinem
// Nachbarn. Bestehende Datensaetze haben durchgehend sortierung=0
// (createOptionFeature hat das Feld vorher nie sinnvoll befuellt) -- deshalb
// wird bei jeder Verschiebung die komplette Liste dieser Option anhand der
// aktuell angezeigten Reihenfolge (sortierung, bei Gleichstand erstellt_am)
// neu und luecken-/duplikatfrei durchnummeriert, statt nur zwei Werte zu
// vertauschen. Das repariert bestehende Daten beim ersten Verschieben
// automatisch mit.
export async function moveOptionFeature(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const featureId = String(formData.get("feature_id"));
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const richtung = String(formData.get("richtung"));

  const { data: features, error: ladeFehler } = await supabase
    .from("seminartermin_options_features")
    .select("id, sortierung, erstellt_am")
    .eq("seminartermin_option_id", optionId)
    .order("sortierung", { ascending: true })
    .order("erstellt_am", { ascending: true });
  if (ladeFehler) throw new Error(ladeFehler.message);

  const liste = features || [];
  const index = liste.findIndex((f) => f.id === featureId);
  const zielIndex = richtung === "hoch" ? index - 1 : index + 1;

  if (index === -1 || zielIndex < 0 || zielIndex >= liste.length) {
    return;
  }

  const neueReihenfolge = [...liste];
  [neueReihenfolge[index], neueReihenfolge[zielIndex]] = [neueReihenfolge[zielIndex], neueReihenfolge[index]];

  for (let i = 0; i < neueReihenfolge.length; i++) {
    if (neueReihenfolge[i].sortierung !== i) {
      await supabase.from("seminartermin_options_features").update({ sortierung: i }).eq("id", neueReihenfolge[i].id);
    }
  }

  revalidatePath(`/termine/${seminarterminId}`);
}

export async function createBuchung(formData: FormData) {
  await requireBackstageLogin();
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

  // Bei Buchung ueber eine Organisation: alle beteiligten Teilnehmer
  // automatisch mit dieser Organisation verknuepfen (siehe
  // teilnehmer_organisationen), damit die Stammdaten nicht wieder veralten.
  if (organisationId) {
    const teilnehmerIds = new Set<string>();
    let i = 0;
    while (formData.has(`teilnehmer_id_${i}`)) {
      teilnehmerIds.add(String(formData.get(`teilnehmer_id_${i}`)));
      i++;
    }
    if (teilnehmerIds.size === 0) teilnehmerIds.add(ersterTeilnehmerId);
    for (const tId of teilnehmerIds) {
      await verknuepfeTeilnehmerMitOrganisationAutomatisch(supabase, tId, String(organisationId));
    }
  }

  revalidatePath("/buchungen");
  redirect("/buchungen");
}

export async function stornoBuchung(formData: FormData) {
  await requireBackstageLogin();
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

const ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID = "b8c1927c-c660-454c-bb02-e6db2d93e8c0";

export async function bestaetigeBuchung(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const buchungId = String(formData.get("buchung_id"));
  const benutzer = await getAktuellerBenutzer();

  const { error } = await supabase.from("buchungen").update({ status: "bestaetigt" }).eq("id", buchungId);
  if (error) throw new Error(error.message);

  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "buchung",
    bezug_id: buchungId,
    ereignis: "bestaetigung",
    beschreibung: "Zahlung erhalten, Buchung endgültig bestätigt.",
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  // Zahlungsbestaetigungs-Mail sofort an alle Teilnehmer dieser Buchung verschicken.
  const { data: positionen } = await supabase
    .from("buchungspositionen")
    .select("teilnehmer(vorname, email), seminartermine(titel, datum_start, seminartypen(name))")
    .eq("buchung_id", buchungId);

  const ersteSeminarPosition = (positionen || []).find((p: any) => p.seminartermine);
  const seminartitel =
    (ersteSeminarPosition as any)?.seminartermine?.titel ||
    (ersteSeminarPosition as any)?.seminartermine?.seminartypen?.name ||
    "das Seminar";
  const seminardatum = (ersteSeminarPosition as any)?.seminartermine?.datum_start
    ? formatDatum((ersteSeminarPosition as any).seminartermine.datum_start)
    : "";

  const empfaengerMap = new Map<string, string>();
  (positionen || []).forEach((p: any) => {
    if (p.teilnehmer?.email) empfaengerMap.set(p.teilnehmer.email, p.teilnehmer.vorname || "");
  });

  const { data: funnelMail } = await supabase
    .from("funnel_mails")
    .select("betreff, inhalt, baustein_signatur, baustein_rechtliches")
    .eq("id", ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID)
    .single();

  if (funnelMail) {
    // Transaktionale Mail: Signatur/Rechtliches wie im Funnel, aber nie ein Abmeldelink
    const bausteine = await ladeBausteine(supabase);
    for (const [email, vorname] of empfaengerMap) {
      const werte = { vorname, seminartitel, seminardatum };
      const betreff = renderPlatzhalter(funnelMail.betreff, werte);
      const inhaltHtml = baueMailHtml(renderPlatzhalter(funnelMail.inhalt, werte), bausteine, { ...schalterAus(funnelMail), abmelden: false }, null);

      let status: "gesendet" | "fehler" = "gesendet";
      let fehlermeldung: string | null = null;
      let resendEmailId: string | null = null;
      try {
        const resend = getResend();
        const { data, error: sendError } = await resend.emails.send({ from: ABSENDER, to: [email], subject: betreff, html: inhaltHtml });
        if (sendError) {
          status = "fehler";
          fehlermeldung = sendError.message;
        } else {
          resendEmailId = data?.id || null;
        }
      } catch (e: any) {
        status = "fehler";
        fehlermeldung = e?.message || "Unbekannter Fehler beim Versand.";
      }

      await supabase.from("funnel_versand_log").insert({
        funnel_mail_id: ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID,
        bezug_typ: "buchung",
        bezug_id: buchungId,
        empfaenger_email: email,
        status,
        fehlermeldung,
        resend_email_id: resendEmailId,
      });
    }
  }

  revalidatePath("/buchungen");
  revalidatePath(`/buchungen/${buchungId}`);
  redirect(`/buchungen/${buchungId}`);
}

export async function umbuchenBuchung(formData: FormData) {
  await requireBackstageLogin();
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
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  // Umschalter "Tage vor Start" / "Festes Datum" im Formular -- pro
  // Preisstufe wird genau eines der beiden Stichtag-Felder gesetzt, das
  // jeweils andere bleibt null (siehe lib/preisstaffeln.ts).
  const stichtagModus = String(formData.get("stichtag_modus") || "tage");
  const istFestesDatum = stichtagModus === "datum";
  const stichtagTageVorStart = istFestesDatum ? null : Number(formData.get("stichtag_tage_vor_start") || 0);
  const stichtagDatumRoh = String(formData.get("stichtag_datum") || "");
  const stichtagDatum = istFestesDatum && stichtagDatumRoh ? stichtagsDatumEndeDesTages(stichtagDatumRoh) : null;

  const { error } = await supabase.from("preisstaffeln").insert({
    seminartermin_option_id: optionId,
    name: String(formData.get("name")),
    stichtag_tage_vor_start: stichtagTageVorStart,
    stichtag_datum: stichtagDatum,
    preis: Number(formData.get("preis")),
    sortierung: stichtagTageVorStart ?? 0,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function updatePreisstaffel(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const preisstaffelId = String(formData.get("preisstaffel_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  const stichtagModus = String(formData.get("stichtag_modus") || "tage");
  const istFestesDatum = stichtagModus === "datum";
  const stichtagTageVorStart = istFestesDatum ? null : Number(formData.get("stichtag_tage_vor_start") || 0);
  const stichtagDatumRoh = String(formData.get("stichtag_datum") || "");
  const stichtagDatum = istFestesDatum && stichtagDatumRoh ? stichtagsDatumEndeDesTages(stichtagDatumRoh) : null;

  const { error } = await supabase
    .from("preisstaffeln")
    .update({
      name: String(formData.get("name")),
      stichtag_tage_vor_start: stichtagTageVorStart,
      stichtag_datum: stichtagDatum,
      preis: Number(formData.get("preis")),
      waehrung: String(formData.get("waehrung") || "EUR"),
      sortierung: Number(formData.get("sortierung") ?? stichtagTageVorStart ?? 0),
    })
    .eq("id", preisstaffelId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

// Uebernimmt die komplette Preisstaffel-Konfiguration einer beliebigen
// anderen Option (ueber alle Termine hinweg) in die Zieloption. Loeschen der
// bisherigen Staffeln der Zieloption + Einfuegen der kopierten Staffeln in
// einem Aufwasch deckt beide Faelle ab: hat die Zieloption noch keine
// Preisstaffeln, ist das Loeschen ein No-Op und es ist reine Ergaenzung; hat
// sie bereits welche, werden sie ersetzt (dafuer fragt das Frontend vorher
// per window.confirm nach, siehe KopierePreisstaffelnButton.tsx).
// stichtag_tage_vor_start wird 1:1 uebernommen (relativ zum jeweiligen
// Terminstart weiterhin sinnvoll). stichtag_datum wird unveraendert
// mitkopiert, aber im Namen markiert -- ein fester Kalendertag der
// Quelloption passt nicht automatisch zum Starttermin der Zieloption und
// muss von Hand geprueft/angepasst werden.
export async function copyPreisstaffelnFromOption(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const zielOptionId = String(formData.get("ziel_option_id"));
  const quellOptionId = String(formData.get("quell_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  const { data: quellStaffeln, error: qErr } = await supabase
    .from("preisstaffeln")
    .select("name, stichtag_tage_vor_start, stichtag_datum, preis, waehrung")
    .eq("seminartermin_option_id", quellOptionId);
  if (qErr) throw new Error(qErr.message);
  if (!quellStaffeln?.length) {
    revalidatePath(`/termine/${seminarterminId}`);
    return;
  }

  const { error: delError } = await supabase
    .from("preisstaffeln")
    .delete()
    .eq("seminartermin_option_id", zielOptionId);
  if (delError) throw new Error(delError.message);

  const { error: insError } = await supabase.from("preisstaffeln").insert(
    quellStaffeln.map((p) => ({
      seminartermin_option_id: zielOptionId,
      name: p.stichtag_datum ? `${p.name} (Datum ggf. anpassen)` : p.name,
      stichtag_tage_vor_start: p.stichtag_tage_vor_start,
      stichtag_datum: p.stichtag_datum,
      preis: p.preis,
      waehrung: p.waehrung,
      sortierung: p.stichtag_tage_vor_start ?? 0,
    }))
  );
  if (insError) throw new Error(insError.message);

  revalidatePath(`/termine/${seminarterminId}`);
}

// Preisstaffel-Vorlage "Monatlicher Stichtag rueckwaerts": erzeugt 5
// Preisstufen mit 4 Stichtagen (siehe berechneMonatlicheStichtageRueckwaerts
// in lib/preisstaffeln.ts) -- rein additiv, ersetzt keine bestehenden
// Preisstaffeln dieser Option. Preise kaskadieren vom eingegebenen
// Basispreis (Stufe 1) ueber 4 unabhaengig waehlbare Uebergaenge (Betrag/
// Prozent/manuell) -- kein einheitlicher globaler Aufschlag. Liegt der
// Anwendungszeitpunkt naeher am Termin als die volle ~5-Monats-Spanne,
// werden dadurch bereits verstrichene fruehe Stichtage einfach nicht
// angelegt (keine nachtraeglich guenstigeren Stufen) -- die Stufe 5
// (Normalpreis, kein eigener Stichtag noetig) wird immer angelegt. Danach
// sind es normale Preisstaffeln, genau wie manuell angelegte.
export async function wendePreisstaffelVorlageAn(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  const { data: termin, error: terminError } = await supabase
    .from("seminartermine")
    .select("datum_start")
    .eq("id", seminarterminId)
    .single();
  if (terminError || !termin) throw new Error(terminError?.message || "Termin nicht gefunden.");

  const basispreis = Number(formData.get("basispreis") || 0);
  const uebergaenge = [1, 2, 3, 4].map((i) => ({
    modus: String(formData.get(`uebergang_${i}_modus`) || "betrag"),
    wert: Number(formData.get(`uebergang_${i}_wert`) || 0),
  }));

  const preise: number[] = [Math.round(basispreis * 100) / 100];
  for (const uebergang of uebergaenge) {
    const vorheriger = preise[preise.length - 1];
    let neu: number;
    if (uebergang.modus === "prozent") neu = vorheriger * (1 + uebergang.wert / 100);
    else if (uebergang.modus === "manuell") neu = uebergang.wert;
    else neu = vorheriger + uebergang.wert;
    preise.push(Math.round(neu * 100) / 100);
  }

  const stichtage = berechneMonatlicheStichtageRueckwaerts(termin.datum_start);
  const jetzt = Date.now();
  const namen = ["Frühbucher Stufe 1", "Frühbucher Stufe 2", "Frühbucher Stufe 3", "Frühbucher Stufe 4"];
  const neueStaffeln: any[] = [];

  for (let i = 0; i < 4; i++) {
    const stichtagDatum = stichtagsDatumEndeDesTages(stichtage[i]);
    if (new Date(stichtagDatum).getTime() <= jetzt) continue; // bereits verstrichen -- nicht anlegen
    neueStaffeln.push({
      seminartermin_option_id: optionId,
      name: namen[i],
      stichtag_tage_vor_start: null,
      stichtag_datum: stichtagDatum,
      preis: preise[i],
      sortierung: 0,
    });
  }

  // Stufe 5 (Normalpreis) -- immer anlegen, gilt bis zum Termin selbst
  // (stichtag_tage_vor_start: 0, wie eine manuell angelegte Normalpreis-Stufe).
  neueStaffeln.push({
    seminartermin_option_id: optionId,
    name: "Normalpreis",
    stichtag_tage_vor_start: 0,
    stichtag_datum: null,
    preis: preise[4],
    sortierung: 0,
  });

  const { error } = await supabase.from("preisstaffeln").insert(neueStaffeln);
  if (error) throw new Error(error.message);

  revalidatePath(`/termine/${seminarterminId}`);
}

// ---------------------------------------------------------------------------
// Gespeicherte Preisstaffel-Vorlagen (Tabelle preisstaffel_vorlagen, siehe
// normalisiereVorlageStufen in lib/preisstaffeln.ts). Diese Actions werden
// direkt aus Client-Komponenten aufgerufen und geben Fehler als
// { fehler } zurueck statt zu werfen: in Production-Builds ersetzt Next.js
// die Message geworfener Server-Action-Fehler durch einen generischen Text --
// "Name schon vergeben" oder "Stufe 3: Preis fehlt" kaeme sonst nie beim
// Nutzer an.

export type VorlagenAktionsErgebnis = { fehler: string | null };

function leseVorlageStufenAusFormData(formData: FormData): PreisstaffelVorlageStufe[] {
  let roh: unknown;
  try {
    roh = JSON.parse(String(formData.get("stufen_json") || "[]"));
  } catch {
    throw new Error("Die Preisstufen konnten nicht gelesen werden.");
  }
  return normalisiereVorlageStufen(roh);
}

function leseStichtagRegelAusFormData(formData: FormData): StichtagRegel | null {
  const roh = String(formData.get("stichtag_regel_json") || "").trim();
  if (!roh || roh === "null") return null;
  try {
    return normalisiereStichtagRegel(JSON.parse(roh));
  } catch (e: any) {
    throw new Error(e instanceof SyntaxError ? "Die Stichtag-Regel konnte nicht gelesen werden." : e.message);
  }
}

function vorlagenDbFehler(error: { code?: string; message: string }, name: string): string {
  // 23505 = unique_violation auf preisstaffel_vorlagen_name_unique
  // (case-insensitiv, siehe Migration) -- beim spaeteren Laden waeren zwei
  // gleichnamige Vorlagen in der Auswahl nicht unterscheidbar.
  if (error.code === "23505") return `Es gibt bereits eine Vorlage mit dem Namen „${name}“.`;
  return error.message;
}

export async function listePreisstaffelVorlagen(): Promise<PreisstaffelVorlage[]> {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("preisstaffel_vorlagen").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data || []) as PreisstaffelVorlage[];
}

export async function createPreisstaffelVorlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const name = String(formData.get("name") || "").trim();
  const beschreibung = String(formData.get("beschreibung") || "").trim();
  if (!name) return { fehler: "Bitte einen Namen für die Vorlage angeben." };

  let stufen: PreisstaffelVorlageStufe[];
  let stichtagRegel: StichtagRegel | null;
  try {
    stufen = leseVorlageStufenAusFormData(formData);
    stichtagRegel = leseStichtagRegelAusFormData(formData);
  } catch (e: any) {
    return { fehler: e.message };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("preisstaffel_vorlagen")
    .insert({ name, beschreibung: beschreibung || null, stufen, stichtag_regel: stichtagRegel });
  if (error) return { fehler: vorlagenDbFehler(error, name) };

  revalidatePath("/preisstaffel-vorlagen");
  return { fehler: null };
}

export async function updatePreisstaffelVorlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("vorlage_id") || "");
  const name = String(formData.get("name") || "").trim();
  const beschreibung = String(formData.get("beschreibung") || "").trim();
  if (!id) return { fehler: "Vorlage nicht gefunden." };
  if (!name) return { fehler: "Bitte einen Namen für die Vorlage angeben." };

  let stufen: PreisstaffelVorlageStufe[];
  let stichtagRegel: StichtagRegel | null;
  try {
    stufen = leseVorlageStufenAusFormData(formData);
    stichtagRegel = leseStichtagRegelAusFormData(formData);
  } catch (e: any) {
    return { fehler: e.message };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("preisstaffel_vorlagen")
    .update({
      name,
      beschreibung: beschreibung || null,
      stufen,
      stichtag_regel: stichtagRegel,
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { fehler: vorlagenDbFehler(error, name) };

  revalidatePath("/preisstaffel-vorlagen");
  return { fehler: null };
}

// Duplizieren legt eine 1:1-Kopie unter "<Name> (Kopie)" an. Der Name muss
// wegen preisstaffel_vorlagen_name_unique frei sein, daher bei Kollision
// "(Kopie 2)", "(Kopie 3)" usw. -- per Insert-Versuch statt Vorab-Abfrage,
// weil der Unique-Index case-insensitiv ist und sich ein ilike-Vergleich an
// Sonderzeichen wie "%"/"_" im Namen verschlucken wuerde.
export async function duplizierePreisstaffelVorlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("vorlage_id") || "");
  if (!id) return { fehler: "Vorlage nicht gefunden." };
  const supabase = getSupabaseAdmin();
  const { data: original, error: ladeFehler } = await supabase
    .from("preisstaffel_vorlagen")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (ladeFehler) return { fehler: ladeFehler.message };
  if (!original) return { fehler: "Vorlage nicht gefunden." };

  const vorlage = original as PreisstaffelVorlage;
  for (let nr = 1; nr <= 50; nr++) {
    const name = `${vorlage.name} (Kopie${nr === 1 ? "" : ` ${nr}`})`;
    const { error } = await supabase.from("preisstaffel_vorlagen").insert({
      name,
      beschreibung: vorlage.beschreibung,
      stufen: vorlage.stufen,
      stichtag_regel: vorlage.stichtag_regel,
    });
    if (!error) {
      revalidatePath("/preisstaffel-vorlagen");
      return { fehler: null };
    }
    if (error.code !== "23505") return { fehler: error.message };
  }
  return { fehler: "Kein freier Name für die Kopie gefunden – bitte vorhandene Kopien umbenennen." };
}

// Loeschen betrifft nur die Vorlage selbst -- bereits in Optionen geladene
// Stufen sind eigenstaendige Kopien in preisstaffeln und bleiben erhalten.
export async function deletePreisstaffelVorlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("vorlage_id") || "");
  if (!id) return { fehler: "Vorlage nicht gefunden." };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("preisstaffel_vorlagen").delete().eq("id", id);
  if (error) return { fehler: error.message };
  revalidatePath("/preisstaffel-vorlagen");
  return { fehler: null };
}

// "Aus Vorlage laden" im Preisstaffel-Editor einer Option: die Stufen kommen
// NICHT direkt aus der Vorlage, sondern aus der (ggf. im Editor angepassten)
// Vorschau -- Anpassungen gelten nur fuer diese Option, die Vorlage bleibt
// unveraendert. Ersetzt wie copyPreisstaffelnFromOption alle bestehenden
// Staffeln der Option (Rueckfrage dafuer im Frontend). Validierung laeuft vor
// dem Loeschen, damit ungueltige Eingaben nie eine leere Option hinterlassen.
// Mit Stichtag-Regel werden die Stichtage hier -- serverseitig, gegen das
// echte datum_start des Termins -- auf passende Tage verschoben und als
// festes stichtag_datum gespeichert (siehe berechneStichtagMitRegel); die
// Stufe "0 Tage" (Normalpreis) bleibt relativ.
export async function ersetzePreisstaffelnDurchVorlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const optionId = String(formData.get("seminartermin_option_id") || "");
  const seminarterminId = String(formData.get("seminartermin_id") || "");
  if (!optionId) return { fehler: "Option nicht gefunden." };

  let stufen: PreisstaffelVorlageStufe[];
  let stichtagRegel: StichtagRegel | null;
  try {
    stufen = leseVorlageStufenAusFormData(formData);
    stichtagRegel = leseStichtagRegelAusFormData(formData);
  } catch (e: any) {
    return { fehler: e.message };
  }

  const supabase = getSupabaseAdmin();

  let stichtage: ({ stichtag: string } | null)[] = stufen.map(() => null);
  if (stichtagRegel) {
    const { data: termin, error: terminError } = await supabase
      .from("seminartermine")
      .select("datum_start")
      .eq("id", seminarterminId)
      .single();
    if (terminError || !termin) return { fehler: terminError?.message || "Termin nicht gefunden." };
    const berechnet = berechneVorlagenStichtage(stufen, termin.datum_start, stichtagRegel);
    if (berechnet.kollision) return { fehler: berechnet.kollision };
    stichtage = berechnet.stichtage;
  }

  const { error: delError } = await supabase
    .from("preisstaffeln")
    .delete()
    .eq("seminartermin_option_id", optionId);
  if (delError) return { fehler: delError.message };

  const { error: insError } = await supabase.from("preisstaffeln").insert(
    stufen.map((s, i) => {
      const verschoben = stichtage[i];
      return {
        seminartermin_option_id: optionId,
        name: s.name,
        stichtag_tage_vor_start: verschoben ? null : s.stichtag_tage_vor_start,
        stichtag_datum: verschoben ? stichtagsDatumEndeDesTages(verschoben.stichtag) : null,
        preis: s.preis,
        sortierung: s.stichtag_tage_vor_start,
      };
    })
  );
  if (insError) return { fehler: insError.message };

  revalidatePath(`/termine/${seminarterminId}`);
  return { fehler: null };
}

// "Aktuelle Staffel als Vorlage speichern": liest die Stufen serverseitig aus
// der DB statt sie vom Client zu uebernehmen -- so landet garantiert der
// gespeicherte Stand in der Vorlage, und die Nur-relativ-Regel wird auch dann
// durchgesetzt, wenn das Frontend (ausgeblendeter Button) umgangen wird.
export async function speicherePreisstaffelnAlsVorlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const optionId = String(formData.get("seminartermin_option_id") || "");
  const seminarterminId = String(formData.get("seminartermin_id") || "");
  const name = String(formData.get("name") || "").trim();
  const beschreibung = String(formData.get("beschreibung") || "").trim();
  if (!optionId) return { fehler: "Option nicht gefunden." };
  if (!name) return { fehler: "Bitte einen Namen für die Vorlage angeben." };

  const supabase = getSupabaseAdmin();
  const { data: staffeln, error: ladeError } = await supabase
    .from("preisstaffeln")
    .select("name, stichtag_tage_vor_start, stichtag_datum, preis")
    .eq("seminartermin_option_id", optionId);
  if (ladeError) return { fehler: ladeError.message };
  if (!staffeln?.length) return { fehler: "Diese Option hat noch keine Preisstaffeln." };

  const mitDatum = stufenMitFestemDatum(staffeln);
  if (mitDatum.length) {
    return {
      fehler: `Nicht möglich: ${mitDatum.map((s) => `„${s.name}“`).join(", ")} ${mitDatum.length === 1 ? "nutzt" : "nutzen"} ein festes Datum. Vorlagen funktionieren nur mit „Tage vor Start“.`,
    };
  }

  let stufen: PreisstaffelVorlageStufe[];
  try {
    stufen = normalisiereVorlageStufen(staffeln);
  } catch (e: any) {
    return { fehler: e.message };
  }

  const { error } = await supabase
    .from("preisstaffel_vorlagen")
    .insert({ name, beschreibung: beschreibung || null, stufen });
  if (error) return { fehler: vorlagenDbFehler(error, name) };

  revalidatePath("/preisstaffel-vorlagen");
  revalidatePath(`/termine/${seminarterminId}`);
  return { fehler: null };
}

// Die Anzeige-Einstellungen der Website (Anzeige-Modus, manuelle Restplaetze,
// Standard-Urgency-Text) liegen in einer eigenen Karte "Anzeige auf der
// Website" statt verstreut im grossen Termin-Formular -- sie werden oft und
// schnell nachjustiert und brauchen deshalb keinen Bestaetigungs-Zwischenschritt
// wie Datum/Ort/Kapazitaet. Ins Aenderungsprotokoll wandern sie trotzdem.
export async function updateVerfuegbarkeitsAnzeige(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartermin_id"));

  const update = {
    verfuegbarkeit_anzeige_modus: String(formData.get("verfuegbarkeit_anzeige_modus") || "zahlen"),
    angezeigte_restplaetze: formData.get("angezeigte_restplaetze")
      ? Number(formData.get("angezeigte_restplaetze"))
      : null,
    urgency_label_template: formData.get("urgency_label_template") || null,
  };

  const { data: alterTermin } = await supabase
    .from("seminartermine")
    .select("verfuegbarkeit_anzeige_modus, angezeigte_restplaetze, urgency_label_template")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("seminartermine").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  const geaenderteFelder = Object.keys(update).filter(
    (feld) => String((alterTermin as any)?.[feld] ?? "") !== String((update as any)[feld] ?? "")
  );
  if (alterTermin && geaenderteFelder.length > 0) {
    const anzeige = (wert: any) => (wert === null || wert === undefined || wert === "" ? "—" : String(wert));
    const benutzer = await getAktuellerBenutzer();
    await supabase.from("aenderungsprotokoll").insert({
      bezug_typ: "seminartermin",
      bezug_id: id,
      ereignis: "aktualisierung",
      beschreibung: geaenderteFelder
        .map((feld) => `${TERMIN_FELD_LABELS[feld] || feld}: "${anzeige((alterTermin as any)[feld])}" → "${anzeige((update as any)[feld])}"`)
        .join("; "),
      bearbeiter: benutzer?.name || "Unbekannt",
    });
  }

  revalidatePath("/termine");
  revalidatePath(`/termine/${id}`);
}

// Urgency-Stufen koennen prozentual ("ab 60 % belegt") oder absolut ("ab 6
// belegten Plaetzen" / "bei hoechstens 4 freien Plaetzen") definiert werden --
// bei kleinen Gruppen (8-12 Plaetze) ist eine Prozentzahl schwer in "noch vier
// Plaetze" zu uebersetzen. Ausgewertet wird in lib/verfuegbarkeit.ts.
function leseUrgencyStufeAusFormData(formData: FormData) {
  const typRoh = String(formData.get("schwellenwert_typ") || "prozent");
  const typ = typRoh === "belegt" || typRoh === "frei" ? typRoh : "prozent";
  const wertRoh = String(formData.get("schwellenwert") ?? "").trim();
  const wert = Number(wertRoh);
  if (wertRoh === "" || !Number.isFinite(wert) || wert < 0) {
    throw new Error("Bitte einen gültigen Schwellenwert (0 oder größer) angeben.");
  }
  if (typ === "prozent" && wert > 100) throw new Error("Prozentwerte dürfen höchstens 100 sein.");
  if (typ !== "prozent" && !Number.isInteger(wert)) throw new Error("Platzanzahlen müssen ganze Zahlen sein.");
  const textVorlage = String(formData.get("text_vorlage") || "").trim();
  if (!textVorlage) throw new Error("Bitte einen Text für die Urgency-Stufe angeben.");
  return {
    schwellenwert_typ: typ,
    schwellenwert_prozent: typ === "prozent" ? wert : null,
    schwellenwert_anzahl: typ === "prozent" ? null : wert,
    text_vorlage: textVorlage,
    sortierung: Math.round(wert),
  };
}

export async function createUrgencyStufe(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("urgency_stufen").insert({
    seminartermin_id: seminarterminId,
    ...leseUrgencyStufeAusFormData(formData),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  revalidatePath("/termine");
}

export async function updateUrgencyStufe(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const stufeId = String(formData.get("urgency_stufe_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase
    .from("urgency_stufen")
    .update(leseUrgencyStufeAusFormData(formData))
    .eq("id", stufeId)
    .eq("seminartermin_id", seminarterminId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  revalidatePath("/termine");
}

export async function deleteUrgencyStufe(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const stufeId = String(formData.get("urgency_stufe_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase
    .from("urgency_stufen")
    .delete()
    .eq("id", stufeId)
    .eq("seminartermin_id", seminarterminId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
  revalidatePath("/termine");
}

export async function createLead(formData: FormData) {
  await requireBackstageLogin();
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
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const leadId = String(formData.get("lead_id"));
  const status = String(formData.get("status"));
  const { error } = await supabase.from("leads").update({ status }).eq("id", leadId);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function createWartelisteEintrag(formData: FormData) {
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
  await requireBackstageLogin();
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
}

export async function removeMitarbeiterVonTermin(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const zuordnungId = String(formData.get("zuordnung_id"));
  const { error } = await supabase
    .from("seminartermin_mitarbeiter")
    .delete()
    .eq("id", zuordnungId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function setzeZimmerpartner(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const teilnehmerA = String(formData.get("teilnehmer_id_a"));
  const teilnehmerB = String(formData.get("teilnehmer_id_b"));
  if (!teilnehmerA || !teilnehmerB || teilnehmerA === teilnehmerB) {
    throw new Error("Bitte zwei unterschiedliche Personen auswählen.");
  }
  const [a, b] = [teilnehmerA, teilnehmerB].sort();
  const { error } = await supabase.from("seminartermin_zimmerpartner").upsert(
    {
      seminartermin_id: seminarterminId,
      teilnehmer_id_a: a,
      teilnehmer_id_b: b,
    },
    { onConflict: "seminartermin_id,teilnehmer_id_a,teilnehmer_id_b" }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function entferneZimmerpartner(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const zuordnungId = String(formData.get("zuordnung_id"));
  const { error } = await supabase
    .from("seminartermin_zimmerpartner")
    .delete()
    .eq("id", zuordnungId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function updateSeminarOption(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase
    .from("seminartermin_optionen")
    .update({
      titel: String(formData.get("titel")),
      beschreibung: formData.get("beschreibung") || null,
      sortierung: Number(formData.get("sortierung") || 0),
      zusatz_teilnehmer_hinweis: formData.get("zusatz_teilnehmer_hinweis") || null,
      zimmerupgrade_zusatznaechte: formData.get("zimmerupgrade_zusatznaechte")
        ? Number(formData.get("zimmerupgrade_zusatznaechte"))
        : null,
      ratenzahlung_aktiv: formData.get("ratenzahlung_aktiv") === "on",
      ratenzahlung_anzahl_raten: formData.get("ratenzahlung_anzahl_raten")
        ? Number(formData.get("ratenzahlung_anzahl_raten"))
        : null,
      vorspann_text: formData.get("vorspann_text") || null,
      vorspann_anzeigen: formData.get("vorspann_anzeigen") === "on",
    })
    .eq("id", optionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

// Optionen werden nicht hart geloescht (FKs von preisstaffeln/
// seminartermin_options_features sind CASCADE -- ein Hard-Delete wuerde
// Preise/Features stillschweigend mitloeschen; buchungspositionen ist NO
// ACTION, d.h. eine Option mit echten Buchungen liesse sich ohnehin nicht
// loeschen, sondern nur mit einem kryptischen DB-Fehler abbrechen).
// Stattdessen wie beim Termin-Storno (stornierSeminartermin) ein weiches
// "deaktiviert_am"-Flag -- die Option bleibt inkl. Historie erhalten, wird
// aber aus der oeffentlichen Auslieferung gefiltert (siehe
// app/api/public/seminartermine/*) und in der Backstage-Liste ausgegraut.
export async function deaktivierenSeminarOption(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  const { data: option } = await supabase
    .from("seminartermin_optionen")
    .select("titel")
    .eq("id", optionId)
    .single();

  const { error } = await supabase
    .from("seminartermin_optionen")
    .update({ deaktiviert_am: new Date().toISOString() })
    .eq("id", optionId);
  if (error) throw new Error(error.message);

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: seminarterminId,
    ereignis: "option_deaktiviert",
    beschreibung: `Option deaktiviert: ${option?.titel || "(ohne Titel)"}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath(`/termine/${seminarterminId}`);
}

// Endgueltiges Loeschen fuer Optionen, die nie verwendet wurden (z. B. beim
// Aufsetzen eines Termins zu viel angelegt) -- Deaktivieren liesse dort nur
// Datenmuell zurueck. Vorab-Pruefung auf buchungspositionen/fastbill_rechnungen
// (beide NO ACTION), damit statt eines kryptischen FK-Fehlers ein
// verstaendlicher Hinweis auf "Deaktivieren" kommt. Preisstaffeln und
// Features gehen per CASCADE mit, das sagt die Bestaetigung im UI explizit.
// Gibt { fehler } zurueck statt zu werfen (siehe VorlagenAktionsErgebnis).
export async function loescheSeminarOption(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id") || "");
  const seminarterminId = String(formData.get("seminartermin_id") || "");
  if (!optionId) return { fehler: "Option nicht gefunden." };

  const { data: option } = await supabase
    .from("seminartermin_optionen")
    .select("titel")
    .eq("id", optionId)
    .maybeSingle();
  if (!option) return { fehler: "Option nicht gefunden." };

  const [{ count: positionen, error: posFehler }, { count: rechnungen, error: rechFehler }] = await Promise.all([
    supabase.from("buchungspositionen").select("id", { count: "exact", head: true }).eq("seminartermin_option_id", optionId),
    supabase
      .from("fastbill_rechnungen")
      .select("id", { count: "exact", head: true })
      .or(`seminartermin_option_id.eq.${optionId},vorgeschlagene_option_id.eq.${optionId}`),
  ]);
  if (posFehler || rechFehler) return { fehler: (posFehler || rechFehler)!.message };
  if ((positionen || 0) > 0 || (rechnungen || 0) > 0) {
    return {
      fehler: `„${option.titel}“ kann nicht gelöscht werden, weil sie bereits in ${
        (positionen || 0) > 0 ? "Buchungen" : "Fastbill-Rechnungen"
      } verwendet wird. Bitte stattdessen deaktivieren.`,
    };
  }

  const { error } = await supabase.from("seminartermin_optionen").delete().eq("id", optionId);
  if (error) return { fehler: error.message };

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: seminarterminId,
    ereignis: "option_geloescht",
    beschreibung: `Option gelöscht: ${option.titel || "(ohne Titel)"}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath(`/termine/${seminarterminId}`);
  return { fehler: null };
}

export async function reaktiviereSeminarOption(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const optionId = String(formData.get("seminartermin_option_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));

  const { data: option } = await supabase
    .from("seminartermin_optionen")
    .select("titel")
    .eq("id", optionId)
    .single();

  const { error } = await supabase
    .from("seminartermin_optionen")
    .update({ deaktiviert_am: null })
    .eq("id", optionId);
  if (error) throw new Error(error.message);

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: seminarterminId,
    ereignis: "option_reaktiviert",
    beschreibung: `Option wieder aktiviert: ${option?.titel || "(ohne Titel)"}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath(`/termine/${seminarterminId}`);
}

export async function deleteOptionFeature(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const featureId = String(formData.get("feature_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("seminartermin_options_features").delete().eq("id", featureId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function deletePreisstaffel(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const preisstaffelId = String(formData.get("preisstaffel_id"));
  const seminarterminId = String(formData.get("seminartermin_id"));
  const { error } = await supabase.from("preisstaffeln").delete().eq("id", preisstaffelId);
  if (error) throw new Error(error.message);
  revalidatePath(`/termine/${seminarterminId}`);
}

export async function sendeTestMail(formData: FormData) {
  await requireBackstageLogin();
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

function bausteinSchalterAusFormular(formData: FormData) {
  return {
    baustein_signatur: formData.get("baustein_signatur") === "on",
    baustein_rechtliches: formData.get("baustein_rechtliches") === "on",
    baustein_abmelden: formData.get("baustein_abmelden") === "on",
  };
}

export async function speichereMailBausteine(formData: FormData) {
  await requireBackstageLogin();
  const text = (feld: string, max: number) => String(formData.get(feld) || "").trim().slice(0, max);
  const url = (feld: string) => {
    const wert = text(feld, 300);
    if (wert && !/^https:\/\//i.test(wert)) throw new Error("Links bitte mit https:// angeben.");
    return wert;
  };
  const { error } = await getSupabaseAdmin()
    .from("mail_bausteine")
    .update({
      signatur: text("signatur", 2000),
      firmenangaben: text("firmenangaben", 2000),
      impressum_url: url("impressum_url"),
      datenschutz_url: url("datenschutz_url"),
      abmelde_text: text("abmelde_text", 300),
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect("/funnel?mail=bausteine&gespeichert=1");
}

export async function createFunnelMail(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("funnel_mails").insert({
    name: String(formData.get("name")),
    trigger_typ: String(formData.get("trigger_typ")),
    versatz_tage: Number(formData.get("versatz_tage") || 0),
    betreff: String(formData.get("betreff")),
    inhalt: String(formData.get("inhalt")),
    ...bausteinSchalterAusFormular(formData),
    // Neu angelegte Mails sind nie sofort aktiv -- erst pruefen, dann bewusst aktivieren.
    aktiv: false,
  }).select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect(`/funnel?mail=${data.id}`);
}

export async function updateFunnelMail(formData: FormData) {
  await requireBackstageLogin();
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
      ...bausteinSchalterAusFormular(formData),
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect(`/funnel?mail=${id}&gespeichert=1`);
}

export async function toggleFunnelMailAktiv(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id"));
  const aktivNeu = String(formData.get("aktiv_neu")) === "true";
  // aktiviert_am = Untergrenze fuer den Cron (lib/funnel.ts): nach dem
  // Aktivieren gehen nur Mails fuer Stichtage ab heute raus, nie rueckwirkend.
  const { error } = await supabase
    .from("funnel_mails")
    .update(aktivNeu ? { aktiv: true, aktiviert_am: new Date().toISOString() } : { aktiv: false })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect(`/funnel?mail=${id}&gespeichert=1`);
}

export async function deleteFunnelMail(formData: FormData) {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id"));
  // Soft-Delete: die Versand-Historie (funnel_versand_log) haengt an der Mail.
  const { error } = await supabase.from("funnel_mails").update({ aktiv: false, geloescht_am: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect("/funnel");
}

export async function stelleFunnelMailWiederHer(formData: FormData) {
  await requireBackstageLogin();
  const { error } = await getSupabaseAdmin().from("funnel_mails").update({ geloescht_am: null }).eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/funnel");
  redirect(`/funnel?mail=${String(formData.get("id"))}`);
}

// Import aus eingefuegtem Text (z. B. ChatGPT): Platzhalter wurden im UI schon
// auf echte Merge-Felder gemappt. Immer INAKTIV angelegt -- nie automatisch
// scharf geschaltet.
export async function importiereFunnelMail(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const name = String(formData.get("name") || "").trim();
  const betreff = String(formData.get("betreff") || "").trim();
  const inhalt = String(formData.get("inhalt") || "").trim();
  const trigger = String(formData.get("trigger_typ") || "");
  const versatz = Number(formData.get("versatz_tage") || 0);
  if (!name) return { fehler: "Bitte einen internen Namen angeben." };
  if (!betreff) return { fehler: "Bitte einen Betreff angeben." };
  if (!inhalt) return { fehler: "Der Text ist leer." };
  if (!["buchung_erstellt", "vor_seminarstart", "nach_seminarende", "lead_erstellt", "warteliste_eingetragen"].includes(trigger)) {
    return { fehler: "Bitte einen Auslöser wählen." };
  }
  if (!Number.isInteger(versatz) || versatz < 0 || versatz > 365) return { fehler: "Anzahl Tage muss zwischen 0 und 365 liegen." };
  const { error } = await getSupabaseAdmin()
    .from("funnel_mails")
    .insert({ name, betreff, inhalt, trigger_typ: trigger, versatz_tage: versatz, aktiv: false });
  if (error) return { fehler: error.message };
  revalidatePath("/funnel");
  return { fehler: null };
}

// ---------- Seminar-Unterlagen (Tabelle seminar_unterlagen, Bucket seminar-unterlagen) ----------
// Dateien laden direkt vom Browser in den privaten Bucket (signierte Upload-URL),
// weil Server-Action-Uploads bei Vercel auf ~4,5 MB begrenzt sind.

export async function erzeugeUnterlagenUpload(formData: FormData): Promise<VorlagenAktionsErgebnis & { pfad?: string; uploadUrl?: string }> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const terminId = String(formData.get("seminartermin_id") || "");
  const dateiname = String(formData.get("dateiname") || "datei")
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80);
  if (!/^[0-9a-f-]{36}$/i.test(terminId)) return { fehler: "Termin fehlt." };
  const pfad = `${terminId}/${Date.now()}-${dateiname}`;
  const { data, error } = await getSupabaseAdmin().storage.from("seminar-unterlagen").createSignedUploadUrl(pfad);
  if (error || !data) return { fehler: error?.message || "Upload konnte nicht vorbereitet werden." };
  return { fehler: null, pfad: data.path, uploadUrl: data.signedUrl };
}

export async function speichereSeminarUnterlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const terminId = String(formData.get("seminartermin_id") || "");
  const titel = String(formData.get("titel") || "").trim();
  const pfad = String(formData.get("pfad") || "").trim();
  const link = String(formData.get("link") || "").trim();
  if (!titel) return { fehler: "Bitte einen Titel angeben." };
  if (!pfad && !link) return { fehler: "Bitte eine Datei hochladen oder einen Link angeben." };
  if (link && !/^https:\/\//i.test(link)) return { fehler: "Links bitte mit https:// angeben." };
  const supabase = getSupabaseAdmin();
  const { data: letzte } = await supabase.from("seminar_unterlagen").select("position").eq("seminartermin_id", terminId).order("position", { ascending: false }).limit(1);
  const { error } = await supabase.from("seminar_unterlagen").insert({
    seminartermin_id: terminId,
    titel,
    datei_url: pfad ? `storage:${pfad}` : link,
    position: (letzte?.[0]?.position ?? -1) + 1,
  });
  if (error) return { fehler: error.message };
  revalidatePath(`/termine/${terminId}`);
  return { fehler: null };
}

export async function verschiebeSeminarUnterlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const terminId = String(formData.get("seminartermin_id") || "");
  const richtung = String(formData.get("richtung") || "");
  const supabase = getSupabaseAdmin();
  const { data: liste, error } = await supabase.from("seminar_unterlagen").select("id, position").eq("seminartermin_id", terminId).order("position").order("erstellt_am");
  if (error) return { fehler: error.message };
  const reihe = [...(liste || [])];
  const i = reihe.findIndex((u) => u.id === id);
  const j = richtung === "hoch" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= reihe.length) return { fehler: null };
  [reihe[i], reihe[j]] = [reihe[j], reihe[i]];
  for (let k = 0; k < reihe.length; k++) {
    if (reihe[k].position !== k) await supabase.from("seminar_unterlagen").update({ position: k }).eq("id", reihe[k].id);
  }
  revalidatePath(`/termine/${terminId}`);
  return { fehler: null };
}

export async function loescheSeminarUnterlage(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const supabase = getSupabaseAdmin();
  const { data: u } = await supabase.from("seminar_unterlagen").select("seminartermin_id, datei_url").eq("id", id).maybeSingle();
  if (!u) return { fehler: "Unterlage nicht gefunden." };
  const { error } = await supabase.from("seminar_unterlagen").delete().eq("id", id);
  if (error) return { fehler: error.message };
  if (String(u.datei_url).startsWith("storage:")) {
    await supabase.storage.from("seminar-unterlagen").remove([String(u.datei_url).slice(8)]);
  }
  revalidatePath(`/termine/${u.seminartermin_id}`);
  return { fehler: null };
}

export async function funnelVersandJetzt() {
  await requireBackstageLogin();
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
  await requireBackstageLogin();
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export async function setMitarbeiterZugang(formData: FormData) {
  await requireBackstageLogin();
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

// Wissen-Autor-Bio: zentral am Mitarbeiter-Datensatz gepflegt (siehe
// app/(public)/wissen/[slug]/page.tsx), damit Name/Rolle/Bio/Foto/LinkedIn
// aendbar sind, ohne Code anzufassen. "ist_wissen_autor" markiert, wessen
// Bio auf den oeffentlichen Wissen-Seiten als Autor-Box erscheint.
export async function setMitarbeiterBio(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const bioRolle = String(formData.get("bio_rolle") || "").trim();
  const bioText = String(formData.get("bio_text") || "").trim();
  const bioFotoUrl = String(formData.get("bio_foto_url") || "").trim();
  const bioLinkedinUrl = String(formData.get("bio_linkedin_url") || "").trim();
  const istWissenAutor = formData.get("ist_wissen_autor") === "on";

  const supabase = getSupabaseAdmin();

  if (istWissenAutor) {
    // Nur eine Person kann gleichzeitig der Wissen-Autor sein.
    await supabase.from("mitarbeiter").update({ ist_wissen_autor: false }).neq("id", id);
  }

  const { error } = await supabase
    .from("mitarbeiter")
    .update({
      bio_rolle: bioRolle || null,
      bio_text: bioText || null,
      bio_foto_url: bioFotoUrl || null,
      bio_linkedin_url: bioLinkedinUrl || null,
      ist_wissen_autor: istWissenAutor,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/mitarbeiter");
  revalidiereWissen();
  redirect("/mitarbeiter");
}

// Einmaliges Setup fuer Resend-Tracking (Oeffnungen/Klicks) + Webhook-Empfang.
// Aktiviert open/click-Tracking auf der agencyuplifted.de-Domain mit der
// Tracking-Subdomain "links" (Markus richtet dafuer selbst den DNS-CNAME-Eintrag
// ein) und registriert (falls noch nicht vorhanden) einen Webhook auf
// /api/webhooks/resend. Ergebnis (DNS-Eintrag + Webhook-Signing-Secret) wird in
// resend_setup_status gespeichert und auf /email-test/tracking-setup angezeigt -
// bewusst nicht per URL-Query, damit das Secret nicht in der Browser-Historie landet.
const RESEND_WEBHOOK_ENDPOINT =
  process.env.RESEND_WEBHOOK_URL || "https://agencyuplifted-backend.vercel.app/api/webhooks/resend";
const RESEND_TRACKING_SUBDOMAIN = "links";
const RESEND_WEBHOOK_EVENTS = [
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
] as const;

export async function richteResendTrackingEin() {
  await requireBackstageLogin();
  const supabase = getSupabaseAdmin();
  const resend = getResend();

  try {
    const { data: domainListe, error: domainListeFehler } = await resend.domains.list();
    if (domainListeFehler) throw new Error(domainListeFehler.message);

    const domain = (domainListe?.data || []).find(
      (d) => d.name === "agencyuplifted.de" || d.name.endsWith(".agencyuplifted.de")
    );
    if (!domain) {
      throw new Error(
        "Keine Domain 'agencyuplifted.de' bei Resend gefunden. Bitte zuerst die Domain in Resend anlegen/verifizieren."
      );
    }

    // Erst die vollen Domain-Details holen (domains.list() liefert kein
    // tracking_subdomain-Feld, nur domains.get()) - sonst wird trackingSubdomain
    // bei jedem erneuten Lauf erneut mitgeschickt und Resend lehnt das mit
    // "A tracking domain with the subdomain ... already exists" ab.
    const { data: domainVorher, error: domainVorherFehler } = await resend.domains.get(domain.id);
    if (domainVorherFehler) throw new Error(domainVorherFehler.message);

    const domainUpdatePayload: { id: string; openTracking: boolean; clickTracking: boolean; trackingSubdomain?: string } = {
      id: domain.id,
      openTracking: true,
      clickTracking: true,
    };
    if (domainVorher?.tracking_subdomain !== RESEND_TRACKING_SUBDOMAIN) {
      domainUpdatePayload.trackingSubdomain = RESEND_TRACKING_SUBDOMAIN;
    }
    const { error: updateFehler } = await resend.domains.update(domainUpdatePayload);
    if (updateFehler) throw new Error(updateFehler.message);

    const { data: domainDetails, error: domainDetailsFehler } = await resend.domains.get(domain.id);
    if (domainDetailsFehler) throw new Error(domainDetailsFehler.message);

    const { data: webhookListe, error: webhookListeFehler } = await resend.webhooks.list();
    if (webhookListeFehler) throw new Error(webhookListeFehler.message);

    let webhookId: string;
    let signingSecret: string;

    const bestehenderWebhook = (webhookListe?.data || []).find((w) => w.endpoint === RESEND_WEBHOOK_ENDPOINT);
    if (bestehenderWebhook) {
      const { data: webhookDetails, error: webhookDetailsFehler } = await resend.webhooks.get(bestehenderWebhook.id);
      if (webhookDetailsFehler) throw new Error(webhookDetailsFehler.message);
      webhookId = bestehenderWebhook.id;
      signingSecret = webhookDetails!.signing_secret;
    } else {
      const { data: neuerWebhook, error: webhookCreateFehler } = await resend.webhooks.create({
        endpoint: RESEND_WEBHOOK_ENDPOINT,
        events: [...RESEND_WEBHOOK_EVENTS],
      });
      if (webhookCreateFehler) throw new Error(webhookCreateFehler.message);
      webhookId = neuerWebhook!.id;
      signingSecret = neuerWebhook!.signing_secret;
    }

    const { error: upsertFehler } = await supabase.from("resend_setup_status").upsert({
      id: "default",
      domain_id: domain.id,
      domain_name: domain.name,
      tracking_subdomain: RESEND_TRACKING_SUBDOMAIN,
      dns_records: domainDetails?.records || [],
      webhook_id: webhookId,
      webhook_signing_secret: signingSecret,
      webhook_endpoint: RESEND_WEBHOOK_ENDPOINT,
      eingerichtet_am: new Date().toISOString(),
      aktualisiert_am: new Date().toISOString(),
    });
    if (upsertFehler) throw new Error(upsertFehler.message);
  } catch (e: any) {
    revalidatePath("/email-test/tracking-setup");
    redirect(`/email-test/tracking-setup?fehler=${encodeURIComponent(e?.message || "Unbekannter Fehler.")}`);
  }

  revalidatePath("/email-test/tracking-setup");
  redirect("/email-test/tracking-setup?erfolg=1");
}

// Ordnet eine einzelne Alt-Buchung (legacy_buchungen) manuell einem konkreten
// Seminartermin zu (Zuordnungsmaske). Erzeugt keine neue "echte" Buchung/Position,
// ergänzt nur die Verknüpfung für Anzeige/Statistik der historischen Daten.
export async function ordneLegacyBuchungZu(formData: FormData) {
  await requireBackstageLogin();
  const legacyId = String(formData.get("legacy_buchung_id"));
  const seminarterminIdRaw = formData.get("seminartermin_id");
  const seminarterminId = seminarterminIdRaw ? String(seminarterminIdRaw) : null;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("legacy_buchungen")
    .update({ seminartermin_id: seminarterminId })
    .eq("id", legacyId);
  if (error) throw new Error(error.message);

  revalidatePath("/buchungen/alte-seminare");
  revalidatePath("/termine");
}

// Ordnet alle Alt-Buchungen einer Gruppe (gleiches Jahr + gleicher Seminartyp)
// gesammelt einem Termin zu. Einzelne Zeilen lassen sich in der Maske danach
// weiterhin individuell überschreiben (z. B. Aufteilung auf zwei Termine im Jahr).
export async function ordneLegacyGruppeZu(formData: FormData) {
  await requireBackstageLogin();
  const jahr = Number(formData.get("jahr"));
  const seminartypIdRaw = formData.get("seminartyp_id");
  const seminartypId = seminartypIdRaw ? String(seminartypIdRaw) : null;
  const seminarterminIdRaw = formData.get("seminartermin_id");
  const seminarterminId = seminarterminIdRaw ? String(seminarterminIdRaw) : null;

  const supabase = getSupabaseAdmin();
  let query = supabase.from("legacy_buchungen").update({ seminartermin_id: seminarterminId }).eq("jahr", jahr);
  query = seminartypId ? query.eq("seminartyp_id", seminartypId) : query.is("seminartyp_id", null);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidatePath("/buchungen/alte-seminare");
  revalidatePath("/termine");
}

// Schritt 1 der doppelten Freigabe fürs Löschen eines Termins: leitet nur zur
// Vorschauseite weiter, löscht noch nichts.
export async function previewSeminarterminLoeschen(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("seminartermin_id"));
  redirect(`/termine/${id}/loeschen`);
}

// Schritt 2: löscht den Termin endgültig — nur wenn serverseitig bestätigt keine
// Buchungspositionen (auch keine stornierten) mehr daran hängen. Legacy-Zuordnungen
// werden vorher automatisch gelöst (nur eine Anzeige-Verknüpfung, keine echte Buchung).
export async function loescheSeminartermin(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("seminartermin_id"));
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("titel, kennung, seminartypen(name)")
    .eq("id", id)
    .single();

  const { count: positionenCount } = await supabase
    .from("buchungspositionen")
    .select("id", { count: "exact", head: true })
    .eq("seminartermin_id", id);

  if ((positionenCount || 0) > 0) {
    throw new Error(
      `Termin kann nicht gelöscht werden: Es hängen noch ${positionenCount} Buchungsposition(en) daran (auch stornierte zählen). Bitte zuerst die zugehörigen Buchungen bereinigen.`
    );
  }

  await supabase.from("legacy_buchungen").update({ seminartermin_id: null }).eq("seminartermin_id", id);

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: id,
    ereignis: "loeschung",
    beschreibung: `Termin gelöscht: ${termin?.kennung ? termin.kennung + " – " : ""}${termin?.titel || (termin as any)?.seminartypen?.name || "(ohne Titel)"}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  const { error } = await supabase.from("seminartermine").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/termine");
  redirect("/termine");
}

// Vorschau/Bestaetigungsseite fuers Stornieren eines Termins (statt hartem
// Loeschen) -- anders als loescheSeminartermin funktioniert das auch, wenn
// bereits Buchungen/Teilnehmer an diesem Termin haengen.
export async function previewSeminarterminStornieren(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("seminartermin_id"));
  redirect(`/termine/${id}/stornieren`);
}

// Storniert einen Termin: setzt status auf "abgesagt". Dieser Wert wird
// bereits von der oeffentlichen Terminliste, der Detail-API und der
// Buchungs-API respektiert (Termin verschwindet von der Website, keine neuen
// Buchungen mehr moeglich) -- keine Aenderung an den /api/public/* Routen
// noetig. Bestehende Buchungen bleiben unangetastet; Teilnehmer muessen
// einzeln ueber die "Umbuchen"-Funktion an der jeweiligen Buchung auf einen
// anderen Termin verschoben werden.
export async function stornierSeminartermin(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("seminartermin_id"));
  const grund = String(formData.get("grund") || "");
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("titel, kennung, seminartypen(name)")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("seminartermine")
    .update({ status: "abgesagt", deaktiviert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: id,
    ereignis: "stornierung",
    beschreibung: `Termin storniert: ${termin?.kennung ? termin.kennung + " – " : ""}${termin?.titel || (termin as any)?.seminartypen?.name || "(ohne Titel)"}${grund ? ` · Grund: ${grund}` : ""}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath("/termine");
  revalidatePath(`/termine/${id}`);
  redirect(`/termine/${id}`);
}

// Macht eine Stornierung rueckgaengig: status zurueck auf "geplant". Der
// Termin erscheint danach wieder auf der Website und kann wieder gebucht
// werden.
export async function reaktiviereSeminartermin(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("seminartermin_id"));
  const supabase = getSupabaseAdmin();

  const { data: termin } = await supabase
    .from("seminartermine")
    .select("titel, kennung, seminartypen(name)")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("seminartermine")
    .update({ status: "geplant", deaktiviert_am: null })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const benutzer = await getAktuellerBenutzer();
  await supabase.from("aenderungsprotokoll").insert({
    bezug_typ: "seminartermin",
    bezug_id: id,
    ereignis: "reaktivierung",
    beschreibung: `Termin wieder aktiviert (Stornierung zurueckgenommen): ${termin?.kennung ? termin.kennung + " – " : ""}${termin?.titel || (termin as any)?.seminartypen?.name || "(ohne Titel)"}`,
    bearbeiter: benutzer?.name || "Unbekannt",
  });

  revalidatePath("/termine");
  revalidatePath(`/termine/${id}`);
}

export async function updateFinanzKonfiguration(formData: FormData) {
  await requireBackstageLogin();
  const fremdkosten = Number(formData.get("fremdkosten_pro_person_netto"));
  const supabase = getSupabaseAdmin();
  const benutzer = await getAktuellerBenutzer();

  const { error } = await supabase
    .from("finanz_konfiguration")
    .update({
      fremdkosten_pro_person_netto: fremdkosten,
      aktualisiert_am: new Date().toISOString(),
      aktualisiert_von: benutzer?.name || "Unbekannt",
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);

  revalidatePath("/einstellungen");
  revalidatePath("/dashboard");
  redirect("/einstellungen");
}

// ---------- Content Creation (Content-/GEO-Pflegeaufgaben) ----------

export async function erledigtMarkierenContentAufgabe(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("content_aufgaben")
    .update({ status: "erledigt", zuletzt_erledigt_am: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function wiederEroeffnenContentAufgabe(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("content_aufgaben").update({ status: "offen" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function neueContentAufgabe(formData: FormData) {
  await requireBackstageLogin();
  const titel = String(formData.get("titel") || "").trim();
  if (!titel) throw new Error("Titel darf nicht leer sein.");
  const beschreibung = String(formData.get("beschreibung") || "").trim() || null;
  const rhythmus = String(formData.get("rhythmus") || "einmalig");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("content_aufgaben").insert({ titel, beschreibung, rhythmus });
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

// ---------- Themen-Radar (Ideen-Pipeline fuer Insights/Blog + LinkedIn) ----------

export async function erstelleThemenRadarIdee(formData: FormData) {
  await requireBackstageLogin();
  const thema = String(formData.get("thema") || "").trim();
  if (!thema) throw new Error("Bitte ein Thema angeben.");
  const cluster = String(formData.get("cluster") || "Sonstige");
  const notiz = String(formData.get("notiz") || "").trim() || null;
  const fuer_linkedin = formData.get("fuer_linkedin") === "on";

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("themen_radar_ideen").insert({
    thema,
    cluster,
    notiz,
    fuer_linkedin,
    quelle: "manuell",
    status: "neu",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

// Holt Google-Autocomplete-Vorschlaege zu einem Startbegriff und legt sie direkt als
// neue Ideen an (Quelle "autocomplete", Status "neu") -- unpassende koennen danach in
// der Liste verworfen/geloescht werden. Bewusst ohne Vorab-Auswahl-UI, um v1 schlank zu
// halten; GSC kommt als praezisere Quelle spaeter dazu.
export async function holeAutocompleteIdeen(formData: FormData) {
  await requireBackstageLogin();
  const seed = String(formData.get("seed") || "").trim();
  if (!seed) throw new Error("Bitte einen Startbegriff angeben.");
  const cluster = String(formData.get("cluster") || "Sonstige");

  const vorschlaege = await holeAutocompleteVorschlaege(seed);
  if (!vorschlaege.length) {
    revalidatePath("/content-creation");
    return;
  }

  const supabase = getSupabaseAdmin();
  // Bereits vorhandene Themen (gleicher Wortlaut) nicht doppelt anlegen.
  const { data: vorhandene } = await supabase.from("themen_radar_ideen").select("thema");
  const vorhandeneSet = new Set((vorhandene || []).map((v: any) => v.thema.toLowerCase()));
  const neue = vorschlaege
    .filter((v) => !vorhandeneSet.has(v.toLowerCase()))
    .map((thema) => ({ thema, cluster, quelle: "autocomplete", status: "neu" }));

  if (neue.length) {
    const { error } = await supabase.from("themen_radar_ideen").insert(neue);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/content-creation");
}

export async function aktualisiereThemenRadarStatus(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("themen_radar_ideen")
    .update({ status, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function toggleThemenRadarLinkedin(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const neuerWert = formData.get("neuer_wert") === "true";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("themen_radar_ideen")
    .update({ fuer_linkedin: neuerWert, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function loescheThemenRadarIdee(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("themen_radar_ideen").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

// Cluster-Label auf einer Themen-Radar-Idee -- dasselbe freie Textfeld-Konzept wie
// triage_cluster_label auf insights_eintraege. Damit lassen sich neue Ideen und alte
// Entwuerfe unter demselben Label buendeln und gemeinsam zusammenfuehren (siehe
// fuehreTriageClusterZusammen).
export async function aktualisiereThemenRadarClusterLabel(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const clusterLabel = String(formData.get("cluster_label") || "").trim() || null;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("themen_radar_ideen")
    .update({ cluster_label: clusterLabel, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

// Legt aus einer Themen-Radar-Idee direkt einen Insights-Entwurf an (Status "entwurf")
// und verknuepft beide Datensaetze -- kein Copy-Paste zwischen den Bereichen noetig.
export async function uebernehmeThemenRadarIdeeInInsights(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();

  const { data: idee, error: ideeError } = await supabase
    .from("themen_radar_ideen")
    .select("*")
    .eq("id", id)
    .single();
  if (ideeError || !idee) throw new Error(ideeError?.message || "Idee nicht gefunden.");

  const basisSlug = erzeugeSlug(idee.thema);
  const slug = await eindeutigerSlug(basisSlug, "artikel");
  const benutzer = await getAktuellerBenutzer();

  const { data: eintrag, error: eintragError } = await supabase
    .from("insights_eintraege")
    .insert({
      typ: "artikel",
      slug,
      titel: idee.thema,
      kurzfassung: idee.notiz || null,
      seo_titel: idee.thema,
      bloecke: [],
      status: "entwurf",
      autor_id: benutzer?.id || null,
      quelle_typ: "themen_radar",
      quelle_referenz: idee.id,
    })
    .select("id")
    .single();
  if (eintragError) throw new Error(eintragError.message);

  await supabase
    .from("themen_radar_ideen")
    .update({ insights_eintrag_id: eintrag.id, status: "in_arbeit", aktualisiert_am: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/content-creation");
  revalidatePath("/insights");
  redirect(`/insights/${eintrag.id}`);
}

// ---------- Buch-Versand (Rezensions-/Gratisexemplare) ----------

export async function legeBuchVersandAn(formData: FormData) {
  await requireBackstageLogin();
  const name = String(formData.get("name") || "").trim();
  const firma = String(formData.get("firma") || "").trim() || null;
  const strasse = String(formData.get("strasse") || "").trim();
  const plz = String(formData.get("plz") || "").trim();
  const ort = String(formData.get("ort") || "").trim();
  const land = String(formData.get("land") || "Deutschland").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const grund = String(formData.get("grund") || "rezension");
  const rohtext = String(formData.get("rohtext") || "") || null;
  const empfaengerTyp = String(formData.get("empfaenger_typ") || "Agenturunternehmer");
  const empfaengerStatus = empfaengerTyp === "Agenturunternehmer" ? String(formData.get("empfaenger_status") || "neu") : null;

  if (!name || !strasse || !plz || !ort) {
    throw new Error("Name, Straße, PLZ und Ort sind Pflichtfelder.");
  }

  const supabase = getSupabaseAdmin();
  // Shopify-Anbindung folgt (Ticket #154) - bis dahin Status "entwurf",
  // damit nichts fälschlich als versendet gilt.
  const { data: neuerEintrag, error } = await supabase
    .from("buch_versand")
    .insert({
      name,
      firma,
      strasse,
      plz,
      ort,
      land,
      email,
      grund,
      rohtext,
      status: "entwurf",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Getrennt von der Teilnehmer-Liste: jeder Buch-Empfänger landet zusätzlich
  // in einer eigenen, getaggten Kontaktliste (potenzielle Leads).
  const { error: empfaengerFehler } = await supabase.from("buch_empfaenger").insert({
    buch_versand_id: neuerEintrag?.id || null,
    name,
    firma,
    email,
    typ: empfaengerTyp,
    status: empfaengerStatus,
  });
  if (empfaengerFehler) throw new Error(empfaengerFehler.message);

  revalidatePath("/buch-versand");
  revalidatePath("/buch-empfaenger");
}

// Ein einmal angelegter Eintrag war bislang "fest" - Adresse/Kategorie ließen
// sich nicht mehr korrigieren, wenn beim Einfügen etwas falsch geparst wurde.
// Aktualisiert sowohl den Buch-Versand-Datensatz als auch den verknüpften
// Buch-Empfänger-Eintrag (Name/Firma/E-Mail/Kategorie/Status sind dort
// dupliziert, damit die Empfänger-Liste unabhängig von buch_versand lesbar
// bleibt).
export async function updateBuchVersand(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const firma = String(formData.get("firma") || "").trim() || null;
  const strasse = String(formData.get("strasse") || "").trim();
  const plz = String(formData.get("plz") || "").trim();
  const ort = String(formData.get("ort") || "").trim();
  const land = String(formData.get("land") || "Deutschland").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const grund = String(formData.get("grund") || "rezension");
  const empfaengerTyp = String(formData.get("empfaenger_typ") || "Agenturunternehmer");
  const empfaengerStatus = empfaengerTyp === "Agenturunternehmer" ? String(formData.get("empfaenger_status") || "neu") : null;
  const geburtsdatum = String(formData.get("geburtsdatum") || "").trim() || null;
  const linkedinUrl = String(formData.get("linkedin_url") || "").trim() || null;

  if (!id || !name || !strasse || !plz || !ort) {
    throw new Error("Name, Straße, PLZ und Ort sind Pflichtfelder.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("buch_versand")
    .update({ name, firma, strasse, plz, ort, land, email, grund })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { error: empfaengerFehler } = await supabase
    .from("buch_empfaenger")
    .update({ name, firma, email, typ: empfaengerTyp, status: empfaengerStatus, geburtsdatum, linkedin_url: linkedinUrl })
    .eq("buch_versand_id", id);
  if (empfaengerFehler) throw new Error(empfaengerFehler.message);

  revalidatePath("/buch-versand");
  revalidatePath("/buch-empfaenger");
  revalidatePath("/geburtstage");
  redirect("/buch-versand");
}

export async function deleteBuchVersand(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();

  const { error: empfaengerFehler } = await supabase.from("buch_empfaenger").delete().eq("buch_versand_id", id);
  if (empfaengerFehler) throw new Error(empfaengerFehler.message);

  const { error } = await supabase.from("buch_versand").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/buch-versand");
  revalidatePath("/buch-empfaenger");
  redirect("/buch-versand");
}

// ---------- Buch-Kontakt-Kategorien (erweiterbare Liste statt fester Werte) ----------

export async function createBuchKontaktKategorie(formData: FormData) {
  await requireBackstageLogin();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Bitte einen Namen für die Kategorie angeben.");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("buch_kontakt_kategorien").insert({ name });
  if (error) {
    if (error.code === "23505") throw new Error(`Kategorie "${name}" existiert bereits.`);
    throw new Error(error.message);
  }
  revalidatePath("/buch-versand/kategorien");
  revalidatePath("/buch-versand");
  redirect("/buch-versand/kategorien");
}

export async function deleteBuchKontaktKategorie(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("buch_kontakt_kategorien").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/buch-versand/kategorien");
  revalidatePath("/buch-versand");
  redirect("/buch-versand/kategorien");
}

export async function versendeBuchExemplarAction(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();

  const { data: eintrag, error: ladeFehler } = await supabase
    .from("buch_versand")
    .select("id, name, firma, email, strasse, plz, ort, land, grund")
    .eq("id", id)
    .single();
  if (ladeFehler || !eintrag) throw new Error(ladeFehler?.message || "Eintrag nicht gefunden.");

  try {
    const { versendeAlsShopifyBestellung } = await import("./shopify");
    const { shopifyOrderId, shopifyOrderName } = await versendeAlsShopifyBestellung(eintrag);
    await supabase
      .from("buch_versand")
      .update({ status: "versendet", shopify_order_id: shopifyOrderName || shopifyOrderId, fehlermeldung: null })
      .eq("id", id);
  } catch (err: any) {
    await supabase.from("buch_versand").update({ status: "fehler", fehlermeldung: err.message }).eq("id", id);
    // Bewusst kein erneutes throw: der Fehler steht jetzt in der Tabelle und wird
    // in der UI angezeigt. Ein throw hier wuerde die ganze Seite mit Next.js'
    // generischer "Application error"-Seite abstuerzen lassen.
  }

  revalidatePath("/buch-versand");
}

// ---------------------------------------------------------------------------
// Kampagnen & gespeicherte Filtergruppen (Teilnehmer-Segmentierung, v0.1)
// ---------------------------------------------------------------------------

function leseFilterAusFormData(formData: FormData): import("./kampagnen").FilterKriterien {
  const listeAus = (key: string) => formData.getAll(key).map(String).filter(Boolean);
  return {
    anrede: listeAus("anrede"),
    rolle: listeAus("rolle"),
    seminartypen: listeAus("seminartypen"),
    unternehmer_status: listeAus("unternehmer_status"),
    kategorie2: String(formData.get("kategorie2") || "") || undefined,
    kategorie2_modus: formData.get("kategorie2_modus") === "nicht_besucht" ? "nicht_besucht" : "besucht",
    teilnahme_stand: listeAus("teilnahme_stand"),
    netzwerk_mitglied: (["ja", "nein"].includes(String(formData.get("netzwerk_mitglied"))) ? String(formData.get("netzwerk_mitglied")) : undefined) as "ja" | "nein" | undefined,
    tags: listeAus("tags"),
  };
}

export async function speichereTeilnehmerSegment(formData: FormData) {
  await requireBackstageLogin();
  const name = String(formData.get("segment_name") || "").trim();
  if (!name) throw new Error("Bitte einen Namen fuer die Filtergruppe angeben.");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("teilnehmer_segmente").insert({
    name,
    filter_kriterien: leseFilterAusFormData(formData),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/teilnehmer");
  revalidatePath("/kampagnen/neu");
}

export async function loescheTeilnehmerSegment(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("teilnehmer_segmente").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/teilnehmer");
  revalidatePath("/kampagnen/neu");
}

// Frequency-Capping: 0 = keine Sperrfrist (z. B. dringende Programmaenderung)
function leseMindestabstand(formData: FormData): number {
  const wert = Number(formData.get("mindestabstand_tage") ?? 4);
  if (!Number.isInteger(wert) || wert < 0 || wert > 90) throw new Error("Mindestabstand muss zwischen 0 und 90 Tagen liegen.");
  return wert;
}

export async function setzeKampagnenMindestabstand(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const { error } = await getSupabaseAdmin()
    .from("kampagnen")
    .update({ mindestabstand_tage: leseMindestabstand(formData), aktualisiert_am: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "entwurf");
  if (error) throw new Error(error.message);
  redirect(`/kampagnen/${id}/vorschau`);
}

export async function erstelleKampagne(formData: FormData) {
  await requireBackstageLogin();
  const name = String(formData.get("name") || "").trim();
  const betreff = String(formData.get("betreff") || "").trim();
  const inhalt = String(formData.get("inhalt") || "").trim();
  const segmentId = String(formData.get("segment_id") || "") || null;
  if (!name || !betreff || !inhalt) throw new Error("Bitte Name, Betreff und Inhalt ausfuellen.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("kampagnen")
    .insert({
      name,
      betreff,
      inhalt,
      filter_kriterien: leseFilterAusFormData(formData),
      segment_id: segmentId,
      mindestabstand_tage: leseMindestabstand(formData),
      baustein_signatur: formData.get("baustein_signatur") === "on",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/kampagnen");
  redirect(`/kampagnen/${data.id}/vorschau`);
}

export async function kampagneVersandJetzt(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const { sendeKampagneJetzt } = await import("./kampagnen");
  const ergebnis = await sendeKampagneJetzt(id, formData.get("trotz_sperrfrist") === "ja");
  revalidatePath("/kampagnen");
  redirect(`/kampagnen?versendet=1&gesendet=${ergebnis.gesendet}&fehler=${ergebnis.fehler}&uebersprungen=${ergebnis.uebersprungen}`);
}

export async function loescheKampagnenEntwurf(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { data: kampagne } = await supabase.from("kampagnen").select("status").eq("id", id).single();
  if (kampagne?.status === "versendet") throw new Error("Bereits versendete Kampagnen koennen nicht geloescht werden.");
  const { error } = await supabase.from("kampagnen").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/kampagnen");
  redirect("/kampagnen");
}

// ---- Insights (Wissenshub v0.1) ----

// Wissen-Seiten sind zwischengespeichert (ISR bzw. Datencache Tag "wissen",
// siehe app/(public)/wissen). Jede Aenderung, die oeffentlich sichtbar sein
// kann -- Inhalt, Status/Veroeffentlichen, Kategorien, Autor-Bio,
// Zusammenfuehren -- muss das hier aufrufen, sonst bleibt die alte Fassung
// bis zu einen Tag lang online.
function revalidiereWissen() {
  revalidatePath("/wissen", "layout");
  revalidateTag("wissen");
  revalidatePath("/sitemap.xml");
  revalidatePath("/llms.txt");
}

export async function erstelleInsightsEintrag(formData: FormData) {
  await requireBackstageLogin();
  const typ = String(formData.get("typ") || "artikel");
  const titel = String(formData.get("titel") || "").trim();
  if (!titel) throw new Error("Bitte einen Titel angeben.");

  const basisSlug = erzeugeSlug(titel);
  const slug = await eindeutigerSlug(basisSlug, typ as any);

  const supabase = getSupabaseAdmin();
  const benutzer = await getAktuellerBenutzer();
  const { data, error } = await supabase
    .from("insights_eintraege")
    .insert({
      typ,
      slug,
      titel,
      bloecke: [],
      status: "entwurf",
      autor_id: benutzer?.id || null,
      quelle_typ: "manuell",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/insights");
  redirect(`/insights/${data.id}`);
}

export async function speichereInsightsEintrag(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const titel = String(formData.get("titel") || "").trim();
  const kurzfassung = String(formData.get("kurzfassung") || "").trim() || null;
  const titelbildUrl = String(formData.get("titelbild_url") || "").trim() || null;
  const titelbildAlt = String(formData.get("titelbild_alt") || "").trim() || null;
  const bloeckeRoh = String(formData.get("bloecke") || "[]");
  const hauptkategorieId = String(formData.get("hauptkategorie_id") || "") || null;
  const seoTitel = String(formData.get("seo_titel") || "").trim() || null;
  const seoBeschreibung = String(formData.get("seo_beschreibung") || "").trim() || null;
  const istGespraechsmaterial = formData.get("ist_gespraechsmaterial") === "on";
  const tagIds = formData.getAll("tag_ids").map((v) => String(v)).filter(Boolean);
  const neueTagsRoh = String(formData.get("neue_tags") || "").trim();
  if (!titel) throw new Error("Bitte einen Titel angeben.");

  let bloecke: unknown;
  try {
    bloecke = JSON.parse(bloeckeRoh);
  } catch {
    throw new Error("Die Bausteine konnten nicht gelesen werden.");
  }

  const supabase = getSupabaseAdmin();

  // Versions-Snapshot vor dem Ueberschreiben sichern
  const { data: bisher } = await supabase.from("insights_eintraege").select("titel, bloecke, slug").eq("id", id).single();
  if (bisher) {
    const benutzer = await getAktuellerBenutzer();
    await supabase.from("insights_eintrag_versionen").insert({
      eintrag_id: id,
      titel: bisher.titel,
      bloecke: bisher.bloecke,
      erstellt_von: benutzer?.id || null,
    });
  }

  const { error } = await supabase
    .from("insights_eintraege")
    .update({
      titel,
      kurzfassung,
      titelbild_url: titelbildUrl,
      titelbild_alt: titelbildAlt,
      bloecke,
      seo_titel: seoTitel,
      seo_beschreibung: seoBeschreibung,
      ist_gespraechsmaterial: istGespraechsmaterial,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (hauptkategorieId) {
    await supabase.from("insights_eintrag_kategorien").delete().eq("eintrag_id", id);
    await supabase
      .from("insights_eintrag_kategorien")
      .insert({ eintrag_id: id, kategorie_id: hauptkategorieId, ist_hauptkategorie: true });
  }

  // Neue Tags anlegen (kommagetrennt eingegeben) und mit anhaengen
  const alleTagIds = [...tagIds];
  if (neueTagsRoh) {
    const namen = neueTagsRoh.split(",").map((n) => n.trim()).filter(Boolean);
    for (const name of namen) {
      const slug = erzeugeTagSlug(name);
      const { data: neuerTag, error: tagFehler } = await supabase
        .from("insights_tags")
        .upsert({ name, slug }, { onConflict: "slug" })
        .select("id")
        .single();
      if (!tagFehler && neuerTag) alleTagIds.push(neuerTag.id);
    }
  }

  await supabase.from("insights_eintrag_tags").delete().eq("eintrag_id", id);
  if (alleTagIds.length > 0) {
    await supabase
      .from("insights_eintrag_tags")
      .insert(alleTagIds.map((tagId) => ({ eintrag_id: id, tag_id: tagId })));
  }

  revalidatePath("/insights");
  revalidatePath(`/insights/${id}`);
  revalidiereWissen();
  if (bisher?.slug) revalidatePath(`/wissen/${bisher.slug}`);
  redirect(`/insights/${id}?gespeichert=1`);
}

export async function setzeInsightsStatus(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["entwurf", "review", "veroeffentlicht", "archiviert"].includes(status)) {
    throw new Error("Unbekannter Status.");
  }
  const supabase = getSupabaseAdmin();
  const felder: Record<string, unknown> = { status };
  if (status === "veroeffentlicht") {
    const { data: bisher } = await supabase.from("insights_eintraege").select("veroeffentlicht_am").eq("id", id).single();
    if (!bisher?.veroeffentlicht_am) felder.veroeffentlicht_am = new Date().toISOString();
  }
  const { error } = await supabase.from("insights_eintraege").update(felder).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/insights");
  revalidiereWissen();
  revalidatePath(`/insights/${id}`);
  redirect(`/insights/${id}?gespeichert=1`);
}

// ---------------------------------------------------------------------------
// Geburtstage: Vorlagen (Textbausteine) + manueller E-Mail-Versand
// ---------------------------------------------------------------------------

export async function createGeburtstagsVorlage(formData: FormData) {
  await requireBackstageLogin();
  const name = String(formData.get("name") || "").trim();
  const betreff = String(formData.get("betreff") || "").trim();
  const inhalt = String(formData.get("inhalt") || "").trim();
  const istStandard = formData.get("ist_standard") === "on";
  if (!name || !betreff || !inhalt) throw new Error("Name, Betreff und Inhalt sind Pflichtfelder.");

  const supabase = getSupabaseAdmin();
  if (istStandard) {
    await supabase.from("geburtstags_vorlagen").update({ ist_standard: false }).eq("ist_standard", true);
  }
  const { error } = await supabase.from("geburtstags_vorlagen").insert({ name, betreff, inhalt, ist_standard: istStandard });
  if (error) throw new Error(error.message);

  revalidatePath("/geburtstage/vorlagen");
  redirect("/geburtstage/vorlagen");
}

export async function updateGeburtstagsVorlage(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const betreff = String(formData.get("betreff") || "").trim();
  const inhalt = String(formData.get("inhalt") || "").trim();
  if (!id || !name || !betreff || !inhalt) throw new Error("Name, Betreff und Inhalt sind Pflichtfelder.");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("geburtstags_vorlagen")
    .update({ name, betreff, inhalt, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/geburtstage/vorlagen");
  redirect("/geburtstage/vorlagen");
}

export async function setGeburtstagsVorlageStandard(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  await supabase.from("geburtstags_vorlagen").update({ ist_standard: false }).eq("ist_standard", true);
  const { error } = await supabase.from("geburtstags_vorlagen").update({ ist_standard: true }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/geburtstage/vorlagen");
  redirect("/geburtstage/vorlagen");
}

export async function deleteGeburtstagsVorlage(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("geburtstags_vorlagen").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/geburtstage/vorlagen");
  redirect("/geburtstage/vorlagen");
}

// Sendet die (ggf. vom Nutzer noch bearbeitete) Geburtstags-Mail direkt per
// Resend und schreibt einen Log-Eintrag (quelle+kontakt_id+jahr eindeutig),
// damit dieselbe Person im selben Jahr nicht zweimal angeschrieben wird und
// die Übersicht "bereits gratuliert" anzeigen kann.
export async function sendeGeburtstagsMail(formData: FormData) {
  await requireBackstageLogin();
  const quelle = String(formData.get("quelle"));
  const kontaktId = String(formData.get("kontakt_id"));
  const email = String(formData.get("email") || "").trim();
  const betreff = String(formData.get("betreff") || "").trim();
  const inhalt = String(formData.get("inhalt") || "").trim();
  const vorlageId = String(formData.get("vorlage_id") || "") || null;

  if (quelle !== "teilnehmer" && quelle !== "buch_empfaenger") throw new Error("Unbekannte Quelle.");
  if (!kontaktId || !email || !betreff || !inhalt) throw new Error("Fehlende Angaben für den Versand.");

  const jahr = new Date().getFullYear();
  const supabase = getSupabaseAdmin();

  let status: "gesendet" | "fehler" = "gesendet";
  let fehlermeldung: string | null = null;
  let resendEmailId: string | null = null;
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: ABSENDER,
      to: [email],
      subject: betreff,
      html: inhalt.replace(/\n/g, "<br/>"),
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

  const { error: logFehler } = await supabase.from("geburtstags_versand_log").insert({
    quelle,
    kontakt_id: kontaktId,
    jahr,
    email,
    vorlage_id: vorlageId,
    status,
    fehlermeldung,
    resend_email_id: resendEmailId,
  });
  // Eindeutigkeits-Constraint (quelle+kontakt_id+jahr) kann bei Doppelklick
  // zuschlagen - das ist gewollt (kein zweiter Log-Eintrag), aber wenn der
  // Versand selbst fehlgeschlagen ist, soll der Nutzer trotzdem eine
  // Fehlermeldung sehen statt einer stillen Doppel-Sperre.
  if (logFehler && status === "fehler") throw new Error(fehlermeldung || logFehler.message);

  revalidatePath("/geburtstage");
  redirect(`/geburtstage?versendet=${status === "gesendet" ? "1" : "0"}`);
}

// ---- Phase-0-Triage der Alt-Entwuerfe -----------------------------------

export async function aktualisiereTriageAktion(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const aktion = String(formData.get("triage_aktion"));

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("insights_eintraege")
    .update({ triage_aktion: aktion, triage_bearbeitet_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/content-creation");
}

export async function aktualisiereTriageClusterLabel(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const label = String(formData.get("triage_cluster_label") || "").trim() || null;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("insights_eintraege")
    .update({ triage_cluster_label: label, triage_bearbeitet_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/content-creation");
}

// Fuehrt alle Entwuerfe mit demselben Triage-Cluster-Label (und Aktion "cluster_sammeln")
// zu einem neuen, zusammengefuehrten Insights-Pillar-Entwurf zusammen: jeder Quell-Entwurf
// wird als eigener Abschnitt (Ueberschrift + seine Bloecke) uebernommen, die Quellen selbst
// werden auf "archiviert" gesetzt und auf den neuen Entwurf verlinkt (kein Datenverlust,
// jederzeit im Insights-Editor nachvollziehbar).
export async function fuehreTriageClusterZusammen(formData: FormData) {
  await requireBackstageLogin();
  const label = String(formData.get("triage_cluster_label") || "").trim();
  const neuerTitel = String(formData.get("neuer_titel") || "").trim();
  if (!label) throw new Error("Kein Cluster-Label angegeben.");
  if (!neuerTitel) throw new Error("Bitte einen Titel für den zusammengeführten Entwurf angeben.");

  const supabase = getSupabaseAdmin();

  const { data: quellen, error: quellenFehler } = await supabase
    .from("insights_eintraege")
    .select("id, titel, bloecke, kurzfassung, insights_eintrag_kategorien(ist_hauptkategorie, kategorie_id)")
    .eq("triage_cluster_label", label)
    .eq("triage_aktion", "cluster_sammeln")
    .in("status", ["entwurf", "review"])
    .order("erstellt_am", { ascending: true });
  if (quellenFehler) throw new Error(quellenFehler.message);

  // Themen-Radar-Ideen mit demselben Cluster-Label -- dasselbe Label buendelt jetzt
  // sowohl alte Entwuerfe als auch neue, noch nicht geschriebene Ideen (vereinheitlichtes
  // Cluster-Konzept, siehe lib/themen-radar.ts). Nur nicht abgeschlossene Ideen
  // (weder veroeffentlicht noch verworfen) werden mitgezogen.
  const { data: ideen, error: ideenFehler } = await supabase
    .from("themen_radar_ideen")
    .select("id, thema, notiz")
    .eq("cluster_label", label)
    .not("status", "in", "(veroeffentlicht,verworfen)")
    .order("erstellt_am", { ascending: true });
  if (ideenFehler) throw new Error(ideenFehler.message);

  const quellenListe = (quellen || []) as any[];
  const ideenListe = (ideen || []) as any[];
  if (quellenListe.length + ideenListe.length < 2) {
    throw new Error("Für dieses Cluster-Label gibt es keine (mindestens zwei) offenen Entwürfe/Ideen mehr.");
  }

  const zusammengefuehrteBloecke: any[] = [];
  for (const q of quellenListe) {
    zusammengefuehrteBloecke.push({ typ: "ueberschrift", ebene: 2, text: q.titel });
    if (Array.isArray(q.bloecke)) zusammengefuehrteBloecke.push(...q.bloecke);
  }
  // Neue Ideen bekommen nur ein Ueberschrift/Platzhalter-Geruest (Ebene 3 -- Unterabschnitt
  // im Pillar-Artikel, kein eigenstaendiger H2 wie die vollen Alt-Entwuerfe), da noch kein
  // Fliesstext existiert. Siehe Konzeptdokument Abschnitt 3 ("In Insights-Entwurf uebernehmen
  // auf Pillar-Ebene").
  for (const i of ideenListe) {
    zusammengefuehrteBloecke.push({ typ: "ueberschrift", ebene: 3, text: i.thema });
    zusammengefuehrteBloecke.push({ typ: "absatz", text: i.notiz || "" });
  }

  const hauptkategorieId =
    quellenListe[0]?.insights_eintrag_kategorien?.find((k: any) => k.ist_hauptkategorie)?.kategorie_id ||
    quellenListe[0]?.insights_eintrag_kategorien?.[0]?.kategorie_id ||
    null;

  const basisSlug = erzeugeSlug(neuerTitel);
  const slug = await eindeutigerSlug(basisSlug, "artikel");
  const benutzer = await getAktuellerBenutzer();

  const { data: neuerEintrag, error: einfuegeFehler } = await supabase
    .from("insights_eintraege")
    .insert({
      typ: "artikel",
      slug,
      titel: neuerTitel,
      bloecke: zusammengefuehrteBloecke,
      status: "entwurf",
      autor_id: benutzer?.id || null,
      quelle_typ: "manuell",
      quelle_referenz: `triage_cluster:${label}`,
    })
    .select("id")
    .single();
  if (einfuegeFehler) throw new Error(einfuegeFehler.message);

  if (hauptkategorieId) {
    await supabase
      .from("insights_eintrag_kategorien")
      .insert({ eintrag_id: neuerEintrag.id, kategorie_id: hauptkategorieId, ist_hauptkategorie: true });
  }

  if (quellenListe.length) {
    const quellIds = quellenListe.map((q) => q.id);
    const { error: archivFehler } = await supabase
      .from("insights_eintraege")
      .update({
        status: "archiviert",
        merged_in_eintrag_id: neuerEintrag.id,
        triage_bearbeitet_am: new Date().toISOString(),
      })
      .in("id", quellIds);
    if (archivFehler) throw new Error(archivFehler.message);
  }

  if (ideenListe.length) {
    const ideenIds = ideenListe.map((i) => i.id);
    const { error: ideenUpdateFehler } = await supabase
      .from("themen_radar_ideen")
      .update({
        status: "in_arbeit",
        insights_eintrag_id: neuerEintrag.id,
        aktualisiert_am: new Date().toISOString(),
      })
      .in("id", ideenIds);
    if (ideenUpdateFehler) throw new Error(ideenUpdateFehler.message);
  }

  revalidatePath("/content-creation");
  revalidatePath("/insights");
  revalidiereWissen();
  redirect(`/insights/${neuerEintrag.id}`);
}

// ---------- 301-Weiterleitungen (insights_redirects) ----------
// Fuer die Migration alter agencyuplifted.de-URLs (Contao) auf die neuen
// .com-URLs (Wissen/Insights). Wird von middleware.ts gelesen (nur fuer
// Hosts in PUBLIC_HOSTS). alte_url/neue_url sind reine Pfade (z. B.
// "/blog/mein-artikel"), keine vollstaendigen URLs.

function normalisierePfad(wert: string): string {
  let pfad = wert.trim();
  // Falls versehentlich eine volle URL eingefuegt wurde, nur den Pfad behalten.
  try {
    if (/^https?:\/\//i.test(pfad)) {
      pfad = new URL(pfad).pathname;
    }
  } catch {
    // ignorieren, dann greift die Fallback-Normalisierung unten
  }
  if (!pfad.startsWith("/")) pfad = "/" + pfad;
  if (pfad.length > 1 && pfad.endsWith("/")) pfad = pfad.slice(0, -1);
  return pfad;
}

export async function erstelleRedirect(formData: FormData) {
  await requireBackstageLogin();
  const alteUrl = normalisierePfad(String(formData.get("alte_url") || ""));
  const neueUrl = String(formData.get("neue_url") || "").trim();
  const statusCode = Number(formData.get("status_code")) || 301;
  if (!alteUrl || alteUrl === "/") throw new Error("Bitte eine gültige alte URL (Pfad) angeben.");
  if (!neueUrl) throw new Error("Bitte eine Ziel-URL angeben.");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("insights_redirects").insert({
    alte_url: alteUrl,
    neue_url: neueUrl,
    status_code: statusCode,
    aktiv: true,
  });
  if (error) {
    if (error.code === "23505") throw new Error(`Für "${alteUrl}" existiert bereits eine Weiterleitung.`);
    throw new Error(error.message);
  }
  revalidatePath("/redirects");
  redirect("/redirects");
}

// Bulk-Import: eine Zeile pro Weiterleitung, alte und neue URL getrennt durch
// Tab, "->", "→" oder mehrere Leerzeichen. Zeilen ohne erkennbares Trennzeichen
// werden übersprungen und als Fehler zurückgemeldet.
export async function importiereRedirectsBulk(formData: FormData) {
  await requireBackstageLogin();
  const rohtext = String(formData.get("bulk_text") || "");
  const zeilen = rohtext.split("\n").map((z) => z.trim()).filter(Boolean);

  const eintraege: { alte_url: string; neue_url: string; status_code: number; aktiv: boolean }[] = [];
  const fehlerZeilen: string[] = [];

  for (const zeile of zeilen) {
    const teile = zeile.split(/\t|->|→|\s{2,}/).map((t) => t.trim()).filter(Boolean);
    if (teile.length < 2) {
      fehlerZeilen.push(zeile);
      continue;
    }
    const [alt, neu] = teile;
    const alteUrl = normalisierePfad(alt);
    if (!alteUrl || alteUrl === "/" || !neu) {
      fehlerZeilen.push(zeile);
      continue;
    }
    eintraege.push({ alte_url: alteUrl, neue_url: neu, status_code: 301, aktiv: true });
  }

  if (eintraege.length) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("insights_redirects")
      .upsert(eintraege, { onConflict: "alte_url" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/redirects");
  redirect(
    `/redirects?importiert=${eintraege.length}${fehlerZeilen.length ? `&fehler=${fehlerZeilen.length}` : ""}`
  );
}

export async function toggleRedirectAktiv(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const aktiv = formData.get("aktiv") === "true";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("insights_redirects").update({ aktiv: !aktiv }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/redirects");
}

export async function loescheRedirect(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("insights_redirects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/redirects");
}

// ---------- Off-Site-Autoritäts-Pipeline (content_offsite_platzierungen) ----------
// Podcasts, Gastbeiträge, Interviews, Erwähnungen durch Dritte -- siehe
// Konzeptdokument Abschnitt 14.4. Unabhängig von den Insights-Artikeln.

export async function erstelleOffsitePlatzierung(formData: FormData) {
  await requireBackstageLogin();
  const titel = String(formData.get("titel") || "").trim();
  const typ = String(formData.get("typ") || "sonstiges");
  const plattform = String(formData.get("plattform") || "").trim() || null;
  const notizen = String(formData.get("notizen") || "").trim() || null;
  if (!titel) throw new Error("Bitte einen Titel angeben.");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("content_offsite_platzierungen").insert({
    titel,
    typ,
    plattform,
    notizen,
    status: "idee",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/content-creation");
  redirect("/content-creation?tab=offsite");
}

export async function aktualisiereOffsitePlatzierungStatus(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["idee", "angefragt", "geplant", "veroeffentlicht", "abgelehnt"].includes(status)) {
    throw new Error("Unbekannter Status.");
  }
  const supabase = getSupabaseAdmin();
  const felder: Record<string, unknown> = { status, aktualisiert_am: new Date().toISOString() };
  if (status === "veroeffentlicht") felder.veroeffentlicht_am = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("content_offsite_platzierungen").update(felder).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function aktualisiereOffsitePlatzierungZielUrl(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const zielUrl = String(formData.get("ziel_url") || "").trim() || null;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("content_offsite_platzierungen")
    .update({ ziel_url: zielUrl, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function loescheOffsitePlatzierung(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("content_offsite_platzierungen").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

// ---- FastBill-Rechnungsabgleich (siehe app/(backstage)/buchungen/fastbill) ----
// Umfang bewusst schmal: nur 2026er Ausgangs-/Stornorechnungen, keine
// automatische Buchungserstellung -- nur Rohimport + Matching-Vorschlag +
// manuelle Bestaetigung, analog zur bestehenden Zuordnungsmaske fuer
// legacy_buchungen (siehe ordneLegacyBuchungZu oben).

// Importiert alle Ausgangs-/Stornorechnungen eines Kalenderjahrs aus FastBill
// und speichert sie roh in fastbill_rechnungen. Bereits vorhandene Rechnungen
// (gleiche fastbill_invoice_id) werden NICHT ueberschrieben -- so gehen
// manuelle Zuordnungen/Notizen bei einem erneuten Import nie verloren; ein
// erneuter Lauf ergaenzt nur wirklich neue Rechnungen.
export async function importFastbillRechnungen(formData: FormData) {
  await requireBackstageLogin();
  const jahr = Number(formData.get("jahr")) || new Date().getFullYear();
  const supabase = getSupabaseAdmin();

  const debugLog: string[] = [];
  let invoices: Awaited<ReturnType<typeof fetchFastbillInvoices>> = [];
  let fehlermeldung: string | null = null;
  try {
    invoices = await fetchFastbillInvoices({
      startDate: `${jahr}-01-01`,
      endDate: `${jahr}-12-31`,
      debugLog,
    });
  } catch (err) {
    fehlermeldung = err instanceof Error ? err.message : String(err);
  }

  const { data: bestehende } = await supabase.from("fastbill_rechnungen").select("fastbill_invoice_id");
  const bekannteIds = new Set((bestehende || []).map((r: any) => r.fastbill_invoice_id));
  const neueInvoices = invoices.filter((inv) => !bekannteIds.has(inv.invoiceId));

  // Preiskandidaten fuer die Matching-Heuristik: JEDE Preisstaffel JEDER
  // Option ueber ALLE Termine (nicht nach Jahr gefiltert, siehe fastbill.ts).
  const { data: staffeln } = await supabase
    .from("preisstaffeln")
    .select("preis, seminartermin_optionen(id, seminartermin_id)");
  const preisKandidaten = (staffeln || [])
    .filter((s: any) => s.seminartermin_optionen)
    .map((s: any) => ({
      seminartermin_id: s.seminartermin_optionen.seminartermin_id as string,
      option_id: s.seminartermin_optionen.id as string,
      preis_netto: Number(s.preis),
    }));

  let eingefuegt = 0;
  for (const inv of neueInvoices) {
    const match = findePreisMatch(inv.subTotal, preisKandidaten);
    const { error } = await supabase.from("fastbill_rechnungen").insert({
      fastbill_invoice_id: inv.invoiceId,
      fastbill_invoice_number: inv.invoiceNumber,
      rechnungsdatum: inv.invoiceDate,
      ist_storno: inv.type === "credit",
      kunde_firma: inv.organization,
      kunde_vorname: inv.firstName,
      kunde_nachname: inv.lastName,
      betrag_netto: inv.subTotal,
      betrag_brutto: inv.total,
      positionen: inv.items,
      rohdaten: inv.raw,
      kategorie: match ? "seminar" : "unklar",
      vorgeschlagener_seminartermin_id: match?.seminartermin_id ?? null,
      vorgeschlagene_option_id: match?.option_id ?? null,
    });
    if (!error) eingefuegt++;
  }

  revalidatePath("/buchungen/fastbill");
  const debugParam = encodeURIComponent(debugLog.slice(0, 2).join(" ||| ").slice(0, 1500));
  const fehlerParam = fehlermeldung ? `&fehler=${encodeURIComponent(fehlermeldung)}` : "";
  redirect(
    `/buchungen/fastbill?importiert=${eingefuegt}&gefunden=${invoices.length}&jahr=${jahr}&debug=${debugParam}${fehlerParam}`
  );
}

export async function setzeFastbillKategorie(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const kategorie = String(formData.get("kategorie"));
  if (!["seminar", "projekt", "unklar"].includes(kategorie)) {
    throw new Error("Unbekannte Kategorie.");
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("fastbill_rechnungen")
    .update({ kategorie, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/buchungen/fastbill");
}

// Entfernt (falls vorhanden) die aus einer FastBill-Zuordnung erzeugte
// Buchung/Buchungsposition wieder -- genutzt von "Ignorieren" und "Zurueck
// auf offen", damit dort nie ein verwaister oder doppelter Teilnehmer-
// Eintrag an einem Termin haengen bleibt.
async function entferneFastbillBuchung(supabase: ReturnType<typeof getSupabaseAdmin>, fastbillRechnungId: string) {
  const { data: row } = await supabase
    .from("fastbill_rechnungen")
    .select("buchung_id")
    .eq("id", fastbillRechnungId)
    .single();
  if (row?.buchung_id) {
    await supabase.from("buchungspositionen").delete().eq("buchung_id", row.buchung_id);
    await supabase.from("buchungen").delete().eq("id", row.buchung_id);
  }
}

export async function ignoriereFastbillRechnung(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  await entferneFastbillBuchung(supabase, id);
  const { error } = await supabase
    .from("fastbill_rechnungen")
    .update({ status: "ignoriert", buchung_id: null, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/buchungen/fastbill");
  revalidatePath("/termine");
}

export async function setzeFastbillOffen(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  await entferneFastbillBuchung(supabase, id);
  const { error } = await supabase
    .from("fastbill_rechnungen")
    .update({ status: "offen", buchung_id: null, aktualisiert_am: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/buchungen/fastbill");
  revalidatePath("/termine");
}

// Bestaetigt die Zuordnung einer FastBill-Rechnung zu einem Termin und bis
// zu 4 Teilnehmern (Gesamtrechnungen decken haeufig eine Gruppe ab, nicht
// nur eine Person). Jede Teilnehmer-Zeile ist entweder ein bestehender
// Teilnehmer per Dropdown oder wird per Vorname+Nachname neu angelegt;
// leere/unvollstaendige Zeilen werden ignoriert. Legt dafuer eine echte
// Buchung an (Status "bestaetigt", da die FastBill-Rechnung ja bereits
// gestellt ist) mit einer Buchungsposition pro Teilnehmer, damit alle wie
// jede andere Buchung auch in der Teilnehmerliste des Termins auftauchen.
// Wird eine bereits zugeordnete Zeile erneut bestaetigt (z.B. weiterer
// Teilnehmer ergaenzt, Termin korrigiert), werden die bestehenden
// Buchungspositionen komplett durch die neu eingereichten ersetzt (die
// Buchung selbst bleibt erhalten) -- einfacher und robuster als ein Diff.
export async function bestaetigeFastbillZuordnung(formData: FormData) {
  await requireBackstageLogin();
  const id = String(formData.get("id"));
  const seminarterminId = String(formData.get("seminartermin_id") || "") || null;
  if (!seminarterminId) {
    throw new Error("Bitte Termin auswaehlen.");
  }

  const supabase = getSupabaseAdmin();

  const { data: rechnungRow, error: rechnungError } = await supabase
    .from("fastbill_rechnungen")
    .select("buchung_id, betrag_netto")
    .eq("id", id)
    .single();
  if (rechnungError) throw new Error(rechnungError.message);

  const gesamtNetto = Number(rechnungRow?.betrag_netto || 0);

  const teilnehmerIds: string[] = [];
  const optionIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    let teilnehmerId = String(formData.get(`teilnehmer_id_${i}`) || "") || null;
    const optionId = String(formData.get(`seminartermin_option_id_${i}`) || "") || null;
    const neuVorname = String(formData.get(`neu_vorname_${i}`) || "").trim();
    const neuNachname = String(formData.get(`neu_nachname_${i}`) || "").trim();
    const neuEmail = String(formData.get(`neu_email_${i}`) || "").trim();

    if (!teilnehmerId && neuVorname && neuNachname) {
      const { anrede, anrede_quelle } = ermittleAnredeUndQuelle(null, neuVorname);
      const { data: neuerTeilnehmer, error: insertError } = await supabase
        .from("teilnehmer")
        .insert({
          anrede,
          anrede_quelle,
          vorname: neuVorname,
          nachname: neuNachname,
          email: neuEmail || "",
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);
      teilnehmerId = neuerTeilnehmer.id;
    }

    if (!teilnehmerId || !optionId) continue;
    teilnehmerIds.push(teilnehmerId);
    optionIds.push(optionId);
  }

  if (teilnehmerIds.length === 0) {
    throw new Error("Bitte mindestens einen Teilnehmer (mit Option) angeben.");
  }

  let buchungId = rechnungRow?.buchung_id || null;

  if (buchungId) {
    const { error: delError } = await supabase.from("buchungspositionen").delete().eq("buchung_id", buchungId);
    if (delError) throw new Error(delError.message);
    const { error: buchungUpdateError } = await supabase
      .from("buchungen")
      .update({ rechnungsempfaenger_teilnehmer_id: teilnehmerIds[0] })
      .eq("id", buchungId);
    if (buchungUpdateError) throw new Error(buchungUpdateError.message);
  } else {
    const { data: neueBuchung, error: buchungError } = await supabase
      .from("buchungen")
      .insert({
        rechnungsempfaenger_teilnehmer_id: teilnehmerIds[0],
        status: "bestaetigt",
        // Retroaktiv per FastBill zugeordnete Buchung -- kein regulaerer
        // Online-Buchungsvorgang. Der Funnel-Versand (buchung_erstellt,
        // z.B. "Reservierung bestaetigt") soll dafuer NICHT ausgeloest
        // werden, siehe sammleFaelligeEmpfaenger() in lib/funnel.ts.
        metadata: { quelle: "fastbill" },
      })
      .select("id")
      .single();
    if (buchungError) throw new Error(buchungError.message);
    buchungId = neueBuchung.id;
  }

  // Rechnungsbetrag (netto) komplett der ersten Position zuordnen -- eine
  // Aufteilung auf mehrere Teilnehmer kann bei Bedarf manuell in der Buchung
  // nachgezogen werden; hier geht es primaer um korrekte Teilnehmerpflege.
  const positionen = teilnehmerIds.map((tId, idx) => ({
    buchung_id: buchungId,
    teilnehmer_id: tId,
    seminartermin_id: seminarterminId,
    seminartermin_option_id: optionIds[idx],
    listenpreis: idx === 0 ? gesamtNetto : 0,
    rabatt_betrag: 0,
  }));
  const { error: posError } = await supabase.from("buchungspositionen").insert(positionen);
  if (posError) throw new Error(posError.message);

  const { error } = await supabase
    .from("fastbill_rechnungen")
    .update({
      seminartermin_id: seminarterminId,
      seminartermin_option_id: optionIds[0],
      teilnehmer_id: teilnehmerIds[0],
      buchung_id: buchungId,
      kategorie: "seminar",
      status: "zugeordnet",
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/buchungen/fastbill");
  revalidatePath("/teilnehmer");
  revalidatePath("/termine");
  revalidatePath(`/termine/${seminarterminId}`);
}

// ---------------------------------------------------------------------------
// Modul "Ideen & Wiedervorlage" -- Phase 1: Inbox (siehe lib/inbox.ts).
// Kein Hard-Delete (DB-Trigger kein_hartes_loeschen), nur Status verworfen/
// archiviert. Aktionen geben { fehler } zurueck statt zu werfen, weil sie aus
// Client-Komponenten kommen (siehe VorlagenAktionsErgebnis).

export async function erfasseInboxEintrag(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const text = String(formData.get("text") || "").trim();
  if (!text) return { fehler: "Bitte etwas eintragen." };
  if (text.length > INBOX_TEXT_MAX) return { fehler: `Text zu lang (max. ${INBOX_TEXT_MAX} Zeichen).` };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("inbox_eintraege").insert({ text, quelle: "backstage", status: "neu" });
  if (error) return { fehler: error.message };
  revalidatePath("/inbox");
  return { fehler: null };
}

// Speichert den kompletten bearbeitbaren Zustand eines Eintrags auf einmal --
// die Karte im UI schickt nach jeder Aenderung ihren ganzen Stand, statt
// einzelne Feld-Actions zu brauchen. Cluster werden als Differenz
// synchronisiert (Verknuepfungstabelle darf geloescht werden).
export async function speichereInboxEintrag(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  if (!id) return { fehler: "Eintrag nicht gefunden." };
  const text = String(formData.get("text") || "").trim();
  if (!text) return { fehler: "Der Text darf nicht leer sein." };
  if (text.length > INBOX_TEXT_MAX) return { fehler: `Text zu lang (max. ${INBOX_TEXT_MAX} Zeichen).` };

  const typRoh = String(formData.get("typ") || "");
  const statusRoh = String(formData.get("status") || "neu");
  const wiedervorlage = String(formData.get("wiedervorlage_am") || "").trim();
  if (wiedervorlage && !/^\d{4}-\d{2}-\d{2}$/.test(wiedervorlage)) return { fehler: "Ungültiges Wiedervorlage-Datum." };

  const felder = {
    text,
    titel: String(formData.get("titel") || "").trim() || null,
    typ: (INBOX_TYPEN as readonly string[]).includes(typRoh) ? typRoh : null,
    status: (INBOX_STATUS as readonly string[]).includes(statusRoh) ? statusRoh : "neu",
    bereiche: nurErlaubte(formData.getAll("bereiche"), INBOX_BEREICHE),
    formate: nurErlaubte(formData.getAll("formate"), INBOX_FORMATE),
    ist_fokus: formData.get("ist_fokus") === "true",
    wiedervorlage_am: wiedervorlage || null,
    notizen: String(formData.get("notizen") || "").trim() || null,
  };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("inbox_eintraege").update(felder).eq("id", id);
  if (error) return { fehler: error.message };

  const clusterNeu = new Set(formData.getAll("cluster_ids").map(String).filter(Boolean));
  const { data: bisher, error: ladeFehler } = await supabase
    .from("inbox_eintrag_cluster")
    .select("themencluster_id")
    .eq("inbox_eintrag_id", id);
  if (ladeFehler) return { fehler: ladeFehler.message };
  const clusterBisher = new Set((bisher || []).map((z) => z.themencluster_id as string));
  const entfernen = [...clusterBisher].filter((c) => !clusterNeu.has(c));
  const hinzufuegen = [...clusterNeu].filter((c) => !clusterBisher.has(c));
  if (entfernen.length) {
    const { error: e } = await supabase.from("inbox_eintrag_cluster").delete().eq("inbox_eintrag_id", id).in("themencluster_id", entfernen);
    if (e) return { fehler: e.message };
  }
  if (hinzufuegen.length) {
    const { error: e } = await supabase
      .from("inbox_eintrag_cluster")
      .insert(hinzufuegen.map((c) => ({ inbox_eintrag_id: id, themencluster_id: c })));
    if (e) return { fehler: e.message };
  }

  revalidatePath("/inbox");
  return { fehler: null };
}

export async function legeThemenclusterAn(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const name = String(formData.get("name") || "").trim();
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const supabase = getSupabaseAdmin();
  const { data: letzter } = await supabase.from("themencluster").select("sortierung").order("sortierung", { ascending: false }).limit(1);
  const { error } = await supabase
    .from("themencluster")
    .insert({ name, beschreibung: String(formData.get("beschreibung") || "").trim() || null, sortierung: (letzter?.[0]?.sortierung ?? 0) + 1 });
  if (error) return { fehler: error.code === "23505" ? `Cluster „${name}“ gibt es schon.` : error.message };
  revalidatePath("/inbox");
  return { fehler: null };
}

// Uebergibt einen Inbox-Eintrag an den bestehenden Themen-Radar
// (Content-Pipeline fuer Insights/LinkedIn), statt Themen doppelt zu pflegen.
// Themenfeld nur grob abgeleitet -- im Themen-Radar jederzeit aenderbar.
export async function uebergebeInboxAnThemenRadar(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const supabase = getSupabaseAdmin();
  const { data: eintrag, error: ladeFehler } = await supabase
    .from("inbox_eintraege")
    .select("id, text, titel, notizen, themen_radar_idee_id, formate, inbox_eintrag_cluster(themencluster(name))")
    .eq("id", id)
    .maybeSingle();
  if (ladeFehler) return { fehler: ladeFehler.message };
  if (!eintrag) return { fehler: "Eintrag nicht gefunden." };
  if (eintrag.themen_radar_idee_id) return { fehler: "Bereits an den Themen-Radar übergeben." };

  const clusterNamen = ((eintrag as any).inbox_eintrag_cluster || []).map((z: any) => String(z.themencluster?.name || "")).join(" ");
  const themenfeld = /vertrieb|kundengewinnung|akquise/i.test(clusterNamen) ? "Vertrieb" : /bestandskunden/i.test(clusterNamen) ? "Kundengespräche" : "Sonstige";

  const { data: idee, error } = await supabase
    .from("themen_radar_ideen")
    .insert({
      thema: eintrag.titel || eintrag.text,
      cluster: themenfeld,
      notiz: [eintrag.titel ? eintrag.text : null, eintrag.notizen, "Aus der Ideen-Inbox übernommen."].filter(Boolean).join("\n\n"),
      fuer_linkedin: (eintrag.formate || []).includes("linkedin_post"),
      quelle: "manuell",
      status: "neu",
    })
    .select("id")
    .single();
  if (error) return { fehler: error.message };

  const { error: e2 } = await supabase.from("inbox_eintraege").update({ themen_radar_idee_id: idee.id, status: "geplant" }).eq("id", id);
  if (e2) return { fehler: e2.message };
  revalidatePath("/inbox");
  revalidatePath("/content-creation");
  return { fehler: null };
}

// ---------------------------------------------------------------------------
// Modul "Ideen & Wiedervorlage" -- Phase 2: Events, Kontakte, Aufgaben (siehe
// lib/events.ts, lib/wiedervorlage.ts). Kein Hard-Delete (DB-Trigger), nur
// archiviert_am; reine Verknuepfungstabellen duerfen geloescht werden.
// Bewusst KEIN Mailversand an Kontakte -- das Modul dokumentiert nur.

function textOderNull(formData: FormData, feld: string): string | null {
  const wert = String(formData.get(feld) ?? "").trim();
  return wert || null;
}

function datumOderNull(formData: FormData, feld: string): string | null {
  const wert = String(formData.get(feld) ?? "").trim();
  if (!wert) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) throw new Error(`Ungültiges Datum: ${wert}`);
  return wert;
}

function skalaOderNull(formData: FormData, feld: string): number | null {
  const n = Number(formData.get(feld));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function revalidiereWiedervorlage(reiheId?: string | null) {
  revalidatePath("/events");
  if (reiheId) revalidatePath(`/events/${reiheId}`);
  revalidatePath("/kontakte");
  revalidatePath("/wiedervorlage");
  revalidatePath("/dashboard");
}

export async function speichereEventReihe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = textOderNull(formData, "id");
  const name = textOderNull(formData, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const felder = {
    name,
    website_url: textOderNull(formData, "website_url"),
    turnus: nurErlaubterWert(formData.get("turnus"), TURNUS) || "jaehrlich",
    beschreibung: textOderNull(formData, "beschreibung"),
    zielgruppen_fit: skalaOderNull(formData, "zielgruppen_fit"),
    speaker_chance: skalaOderNull(formData, "speaker_chance"),
    kosten_notiz: textOderNull(formData, "kosten_notiz"),
  };
  const supabase = getSupabaseAdmin();
  const { error } = id
    ? await supabase.from("event_reihen").update(felder).eq("id", id)
    : await supabase.from("event_reihen").insert(felder);
  if (error) return { fehler: error.code === "23505" ? `Es gibt bereits eine Event-Reihe „${name}“.` : error.message };
  revalidiereWiedervorlage(id);
  return { fehler: null };
}

export async function archiviereEventReihe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const archivieren = formData.get("archivieren") === "true";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("event_reihen").update({ archiviert_am: archivieren ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(id);
  return { fehler: null };
}

export async function speichereEventAusgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = textOderNull(formData, "id");
  const reiheId = textOderNull(formData, "event_reihe_id");
  const jahr = Number(formData.get("jahr"));
  if (!reiheId) return { fehler: "Event-Reihe fehlt." };
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) return { fehler: "Bitte ein gültiges Jahr angeben." };
  let felder;
  try {
    felder = {
      event_reihe_id: reiheId,
      jahr,
      datum_start: datumOderNull(formData, "datum_start"),
      datum_ende: datumOderNull(formData, "datum_ende"),
      ort: textOderNull(formData, "ort"),
      cfp_start: datumOderNull(formData, "cfp_start"),
      cfp_ende: datumOderNull(formData, "cfp_ende"),
      teilnahme: nurErlaubterWert(formData.get("teilnahme"), TEILNAHME) || "offen",
      notizen: textOderNull(formData, "notizen"),
    };
  } catch (e: any) {
    return { fehler: e.message };
  }
  const supabase = getSupabaseAdmin();
  const { error } = id
    ? await supabase.from("event_ausgaben").update(felder).eq("id", id)
    : await supabase.from("event_ausgaben").insert(felder);
  if (error) return { fehler: error.code === "23505" ? `Für ${jahr} gibt es bereits eine Ausgabe.` : error.message };
  revalidiereWiedervorlage(reiheId);
  return { fehler: null };
}

// "Naechste Ausgabe anlegen": Jahr +1, Ort uebernommen (meist gleich),
// Datum/CfP leer, Teilnahme offen -- plus Recherche-Aufgabe, damit die
// unbekannten Daten nicht vergessen werden.
export async function legeNaechsteEventAusgabeAn(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const reiheId = String(formData.get("event_reihe_id") || "");
  const supabase = getSupabaseAdmin();
  const { data: letzte, error: ladeFehler } = await supabase
    .from("event_ausgaben")
    .select("jahr, ort")
    .eq("event_reihe_id", reiheId)
    .order("jahr", { ascending: false })
    .limit(1);
  if (ladeFehler) return { fehler: ladeFehler.message };
  const jahr = (letzte?.[0]?.jahr ?? Number(berlinHeute().slice(0, 4)) - 1) + 1;
  const { data: neu, error } = await supabase
    .from("event_ausgaben")
    .insert({ event_reihe_id: reiheId, jahr, ort: letzte?.[0]?.ort ?? null, teilnahme: "offen" })
    .select("id")
    .single();
  if (error) return { fehler: error.code === "23505" ? `Für ${jahr} gibt es bereits eine Ausgabe.` : error.message };
  const { error: aufgabeFehler } = await supabase.from("aufgaben").insert({
    titel: `CfP-Termin & Datum ${jahr} recherchieren`,
    faellig_am: tagPlus(berlinHeute(), 14),
    event_ausgabe_id: neu.id,
  });
  if (aufgabeFehler) return { fehler: aufgabeFehler.message };
  revalidiereWiedervorlage(reiheId);
  return { fehler: null };
}

export async function archiviereEventAusgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const archivieren = formData.get("archivieren") === "true";
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("event_ausgaben")
    .update({ archiviert_am: archivieren ? new Date().toISOString() : null })
    .eq("id", id)
    .select("event_reihe_id")
    .single();
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(data.event_reihe_id);
  return { fehler: null };
}

// Legt einen Kontakt an bzw. aktualisiert ihn. Beim Anlegen im Kontext einer
// Event-Ausgabe (event_ausgabe_id + rolle) wird er direkt verknuepft.
// "quelle" ist Pflicht (Datenschutz: Herkunft jedes Kontakts dokumentieren).
export async function speichereKontakt(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = textOderNull(formData, "id");
  const name = textOderNull(formData, "name");
  const quelle = textOderNull(formData, "quelle");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  if (!quelle) return { fehler: "Bitte die Quelle angeben (woher stammt der Kontakt?)." };
  const felder = {
    name,
    quelle,
    firma: textOderNull(formData, "firma"),
    position: textOderNull(formData, "position"),
    linkedin_url: textOderNull(formData, "linkedin_url"),
    email: textOderNull(formData, "email"),
    status: nurErlaubterWert(formData.get("status"), KONTAKT_STATUS) || "recherchieren",
    notizen: textOderNull(formData, "notizen"),
    organisation_id: textOderNull(formData, "organisation_id"),
  };
  const supabase = getSupabaseAdmin();
  let kontaktId = id;
  if (id) {
    const { error } = await supabase.from("kontakte").update(felder).eq("id", id);
    if (error) return { fehler: error.message };
  } else {
    const { data, error } = await supabase.from("kontakte").insert(felder).select("id").single();
    if (error) return { fehler: error.message };
    kontaktId = data.id;
  }

  const ausgabeId = textOderNull(formData, "event_ausgabe_id");
  const rolle = nurErlaubterWert(formData.get("rolle"), EVENT_ROLLEN);
  let reiheId: string | null = null;
  if (ausgabeId && rolle && kontaktId) {
    const { error } = await supabase
      .from("event_ausgabe_kontakte")
      .upsert({ event_ausgabe_id: ausgabeId, kontakt_id: kontaktId, rolle }, { onConflict: "event_ausgabe_id,kontakt_id,rolle", ignoreDuplicates: true });
    if (error) return { fehler: error.message };
    const { data: a } = await supabase.from("event_ausgaben").select("event_reihe_id").eq("id", ausgabeId).single();
    reiheId = a?.event_reihe_id ?? null;
  }
  revalidiereWiedervorlage(reiheId);
  return { fehler: null };
}

export async function setzeKontaktStatus(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const status = nurErlaubterWert(formData.get("status"), KONTAKT_STATUS);
  if (!status) return { fehler: "Ungültiger Status." };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("kontakte").update({ status }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

export async function archiviereKontakt(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const archivieren = formData.get("archivieren") === "true";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("kontakte").update({ archiviert_am: archivieren ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage();
  return { fehler: null };
}

export async function verknuepfeKontaktMitAusgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const ausgabeId = String(formData.get("event_ausgabe_id") || "");
  const kontaktId = String(formData.get("kontakt_id") || "");
  const rolle = nurErlaubterWert(formData.get("rolle"), EVENT_ROLLEN);
  if (!kontaktId) return { fehler: "Bitte einen Kontakt auswählen." };
  if (!rolle) return { fehler: "Bitte eine Rolle auswählen." };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("event_ausgabe_kontakte")
    .upsert({ event_ausgabe_id: ausgabeId, kontakt_id: kontaktId, rolle }, { onConflict: "event_ausgabe_id,kontakt_id,rolle", ignoreDuplicates: true });
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

export async function entferneKontaktVonAusgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("event_ausgabe_kontakte")
    .delete()
    .eq("event_ausgabe_id", String(formData.get("event_ausgabe_id") || ""))
    .eq("kontakt_id", String(formData.get("kontakt_id") || ""))
    .eq("rolle", String(formData.get("rolle") || ""));
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

// Nur auf ausdruecklichen Klick: aus einem Netzwerk-Kontakt wird ein
// Seminar-Lead. Achtung, Leads koennen lead_erstellt-Funnel-Mails bekommen --
// deshalb fragt das UI vorher nach und es passiert nie automatisch.
export async function uebernehmeKontaktAlsLead(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const supabase = getSupabaseAdmin();
  const { data: k, error: ladeFehler } = await supabase.from("kontakte").select("*").eq("id", id).maybeSingle();
  if (ladeFehler) return { fehler: ladeFehler.message };
  if (!k) return { fehler: "Kontakt nicht gefunden." };
  if (k.lead_id) return { fehler: "Ist bereits als Lead übernommen." };
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({ name: k.name, firma: k.firma, email: k.email, quelle: `Kontakt (${k.quelle})`, notizen: k.notizen, status: "neu" })
    .select("id")
    .single();
  if (error) return { fehler: error.message };
  const { error: e2 } = await supabase.from("kontakte").update({ lead_id: lead.id }).eq("id", id);
  if (e2) return { fehler: e2.message };
  revalidatePath("/leads");
  revalidiereWiedervorlage();
  return { fehler: null };
}

export async function speichereAufgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = textOderNull(formData, "id");
  const titel = textOderNull(formData, "titel");
  if (!titel) return { fehler: "Bitte einen Titel angeben." };
  let faellig: string | null;
  try {
    faellig = datumOderNull(formData, "faellig_am");
  } catch (e: any) {
    return { fehler: e.message };
  }
  const felder: Record<string, unknown> = { titel, faellig_am: faellig, notizen: textOderNull(formData, "notizen") };
  if (!id) {
    felder.event_ausgabe_id = textOderNull(formData, "event_ausgabe_id");
    felder.kontakt_id = textOderNull(formData, "kontakt_id");
    felder.inbox_eintrag_id = textOderNull(formData, "inbox_eintrag_id");
  }
  const supabase = getSupabaseAdmin();
  const { error } = id ? await supabase.from("aufgaben").update(felder).eq("id", id) : await supabase.from("aufgaben").insert(felder);
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

export async function setzeAufgabeErledigt(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const erledigt = formData.get("erledigt") === "true";
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("aufgaben").update({ erledigt_am: erledigt ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

export async function archiviereAufgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("aufgaben").update({ archiviert_am: new Date().toISOString() }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

export async function verknuepfeThemaMitAusgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const eintragId = String(formData.get("inbox_eintrag_id") || "");
  const ausgabeId = String(formData.get("event_ausgabe_id") || "");
  if (!eintragId) return { fehler: "Bitte ein Thema auswählen." };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("inbox_eintrag_event_ausgaben")
    .upsert({ inbox_eintrag_id: eintragId, event_ausgabe_id: ausgabeId, notiz: textOderNull(formData, "notiz") }, { onConflict: "inbox_eintrag_id,event_ausgabe_id" });
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

export async function entferneThemaVonAusgabe(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("inbox_eintrag_event_ausgaben")
    .delete()
    .eq("inbox_eintrag_id", String(formData.get("inbox_eintrag_id") || ""))
    .eq("event_ausgabe_id", String(formData.get("event_ausgabe_id") || ""));
  if (error) return { fehler: error.message };
  revalidiereWiedervorlage(textOderNull(formData, "event_reihe_id"));
  return { fehler: null };
}

// ---------------------------------------------------------------------------
// Modul "Ideen & Wiedervorlage" -- Phase 3: Erinnerungen & Kalender-Abo
// (lib/erinnerungen.ts). Empfaenger nur interne Adressen, Versand per Cron.

export async function speichereErinnerung(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = textOderNull(formData, "id");
  const name = textOderNull(formData, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const empfaenger = Array.from(
    new Set(
      String(formData.get("empfaenger") || "")
        .split(/[,;\s]+/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const ungueltig = empfaenger.filter((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
  if (ungueltig.length) return { fehler: `Ungültige E-Mail-Adresse: ${ungueltig.join(", ")}` };
  const aktiv = formData.get("aktiv") === "on";
  if (aktiv && !empfaenger.length) return { fehler: "Zum Aktivieren bitte mindestens einen Empfänger eintragen." };

  const frequenz = nurErlaubterWert(formData.get("frequenz"), FREQUENZEN) || "taeglich";
  const wochentag = Number(formData.get("wochentag")) || 1;
  const monatstag = Math.min(28, Math.max(1, Number(formData.get("monatstag")) || 1));
  const zahl = (feld: string, max: number, standard: number) => {
    const n = Number(formData.get(feld));
    return Number.isInteger(n) && n >= 0 && n <= max ? n : standard;
  };
  const felder = {
    name,
    aktiv,
    empfaenger,
    frequenz,
    wochentag: frequenz === "woechentlich" ? wochentag : null,
    monatstag: frequenz === "monatlich" ? monatstag : null,
    vorschau_tage: zahl("vorschau_tage", 60, 0),
    cfp_vorschau_tage: zahl("cfp_vorschau_tage", 365, 90),
    mit_aufgaben: formData.get("mit_aufgaben") === "on",
    mit_wiedervorlagen: formData.get("mit_wiedervorlagen") === "on",
    mit_events: formData.get("mit_events") === "on",
    mit_cfp: formData.get("mit_cfp") === "on",
    mit_unsortiert: formData.get("mit_unsortiert") === "on",
    nur_wenn_inhalt: formData.get("nur_wenn_inhalt") === "on",
  };
  const supabase = getSupabaseAdmin();
  const { error } = id ? await supabase.from("erinnerungen").update(felder).eq("id", id) : await supabase.from("erinnerungen").insert(felder);
  if (error) return { fehler: error.message };
  revalidatePath("/wiedervorlage/einstellungen");
  return { fehler: null };
}

// Schickt die Erinnerung sofort als Test (Betreff mit "[Test]"), unabhaengig
// von Frequenz/aktiv -- an die gespeicherten Empfaenger.
export async function sendeErinnerungTest(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const { data, error } = await getSupabaseAdmin().from("erinnerungen").select("*").eq("id", id).maybeSingle();
  if (error) return { fehler: error.message };
  if (!data) return { fehler: "Erinnerung nicht gefunden." };
  const r = await sendeErinnerung(data as Erinnerung, { erzwingen: true });
  revalidatePath("/wiedervorlage/einstellungen");
  if (r.status === "keine_empfaenger") return { fehler: "Bitte zuerst Empfänger eintragen und speichern." };
  if (r.status === "fehler") return { fehler: `Versand fehlgeschlagen: ${r.info}` };
  return { fehler: null };
}

export async function speichereKalenderAbo(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = textOderNull(formData, "id");
  const felder = {
    name: textOderNull(formData, "name") || "Kalender",
    aktiv: formData.get("aktiv") === "on",
    mit_aufgaben: formData.get("mit_aufgaben") === "on",
    mit_wiedervorlagen: formData.get("mit_wiedervorlagen") === "on",
    mit_events: formData.get("mit_events") === "on",
    mit_cfp: formData.get("mit_cfp") === "on",
  };
  const supabase = getSupabaseAdmin();
  const { error } = id ? await supabase.from("kalender_abos").update(felder).eq("id", id) : await supabase.from("kalender_abos").insert(felder);
  if (error) return { fehler: error.message };
  revalidatePath("/wiedervorlage/einstellungen");
  return { fehler: null };
}

// Neuer Token = alter Abo-Link sofort ungueltig (z. B. wenn er versehentlich
// geteilt wurde). Das Abo muss danach im Kalender neu eingerichtet werden.
export async function erneuereKalenderToken(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const id = String(formData.get("id") || "");
  const token = randomBytes(24).toString("hex");
  const { error } = await getSupabaseAdmin().from("kalender_abos").update({ token }).eq("id", id);
  if (error) return { fehler: error.message };
  revalidatePath("/wiedervorlage/einstellungen");
  return { fehler: null };
}

// ---------------------------------------------------------------------------
// Netzwerk "Uplifted Agencies" -- Backstage-Seite /netzwerk-einladen.
// Einladungen gehen NUR per ausdruecklichem Klick raus. Harte Regel ohne
// Override: marketing_consent_status abgemeldet/keine_zustimmung kommt in
// keine Liste. Login-Pruefung siehe pruefeBackstageLogin() oben.

const NETZWERK_AUSGESCHLOSSEN = ["abgemeldet", "keine_zustimmung"];

export async function ladeInPilotkreisEin(formData: FormData): Promise<VorlagenAktionsErgebnis & { info?: string }> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  // Ohne Publishable Key funktioniert /netzwerk nicht -- dann lieber gar
  // nicht einladen, als Links auf eine Fehlerseite zu verschicken.
  try {
    getNetzwerkAuthKonfig();
  } catch {
    return { fehler: "Das Netzwerk ist noch nicht fertig eingerichtet: NEXT_PUBLIC_SUPABASE_ANON_KEY fehlt in Vercel. Es wurde nichts verschickt." };
  }
  const ids = formData.getAll("teilnehmer_id").map(String).filter(Boolean);
  if (!ids.length) return { fehler: "Bitte mindestens eine Person auswählen." };
  if (ids.length > 10) return { fehler: "Bitte höchstens 10 Personen auf einmal einladen – der Pilotkreis ist bewusst klein." };

  const supabase = getSupabaseAdmin();
  const { pilot } = await getNetzwerkGruppen();
  const { data: personen, error } = await supabase
    .from("teilnehmer")
    .select("id, vorname, nachname, anrede, email, marketing_consent_status, deaktiviert_am, teilnehmer_community_status(community_gruppe_id)")
    .in("id", ids);
  if (error) return { fehler: error.message };

  const eingeladen: string[] = [];
  const uebersprungen: string[] = [];
  for (const p of (personen || []) as any[]) {
    const name = `${p.vorname} ${p.nachname}`;
    if (p.deaktiviert_am || NETZWERK_AUSGESCHLOSSEN.includes(p.marketing_consent_status)) { uebersprungen.push(`${name} (Einwilligung)`); continue; }
    if (!p.email) { uebersprungen.push(`${name} (keine E-Mail)`); continue; }
    if ((p.teilnehmer_community_status || []).some((s: any) => s.community_gruppe_id === pilot)) { uebersprungen.push(`${name} (schon im Pilotkreis)`); continue; }
    const { error: insFehler } = await supabase.from("teilnehmer_community_status").insert({ teilnehmer_id: p.id, community_gruppe_id: pilot, status: "eingeladen" });
    if (insFehler) { uebersprungen.push(`${name} (${insFehler.message})`); continue; }
    try {
      await sendeNetzwerkLink({ email: p.email, vorname: p.vorname, anrede: p.anrede, art: "einladung" });
      eingeladen.push(name);
    } catch (e: any) {
      // Ohne Mail keine "eingeladen"-Leiche hinterlassen
      await supabase.from("teilnehmer_community_status").delete().eq("teilnehmer_id", p.id).eq("community_gruppe_id", pilot);
      uebersprungen.push(`${name} (${e.message})`);
    }
  }
  revalidatePath("/netzwerk-einladen");
  return {
    fehler: uebersprungen.length && !eingeladen.length ? `Niemand eingeladen: ${uebersprungen.join(", ")}` : null,
    info: [eingeladen.length ? `Eingeladen: ${eingeladen.join(", ")}` : null, uebersprungen.length ? `Übersprungen: ${uebersprungen.join(", ")}` : null].filter(Boolean).join(" · "),
  };
}

export async function sendeNetzwerkEinladungErneut(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const supabase = getSupabaseAdmin();
  const { data: p } = await supabase.from("teilnehmer").select("vorname, anrede, email, marketing_consent_status").eq("id", String(formData.get("teilnehmer_id") || "")).maybeSingle();
  if (!p?.email) return { fehler: "Keine E-Mail-Adresse." };
  if (NETZWERK_AUSGESCHLOSSEN.includes(p.marketing_consent_status)) return { fehler: "Einwilligung fehlt – keine Einladung möglich." };
  try {
    await sendeNetzwerkLink({ email: p.email, vorname: p.vorname, anrede: p.anrede, art: "einladung" });
  } catch (e: any) {
    return { fehler: e.message };
  }
  return { fehler: null };
}

export async function setzeAufNetzwerkVormerkliste(formData: FormData): Promise<VorlagenAktionsErgebnis & { info?: string }> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const ids = formData.getAll("teilnehmer_id").map(String).filter(Boolean);
  if (!ids.length) return { fehler: "Bitte mindestens eine Person auswählen." };
  const supabase = getSupabaseAdmin();
  const { vormerkliste } = await getNetzwerkGruppen();
  const { data: personen, error } = await supabase.from("teilnehmer").select("id, marketing_consent_status").in("id", ids);
  if (error) return { fehler: error.message };
  const erlaubt = (personen || []).filter((p: any) => !NETZWERK_AUSGESCHLOSSEN.includes(p.marketing_consent_status)).map((p: any) => p.id);
  if (erlaubt.length) {
    const { error: e } = await supabase
      .from("teilnehmer_community_status")
      .upsert(erlaubt.map((id) => ({ teilnehmer_id: id, community_gruppe_id: vormerkliste, status: "vorgemerkt" })), { onConflict: "teilnehmer_id,community_gruppe_id", ignoreDuplicates: true });
    if (e) return { fehler: e.message };
  }
  revalidatePath("/netzwerk-einladen");
  return { fehler: null, info: `${erlaubt.length} vorgemerkt – es wurde nichts verschickt.` };
}

export async function entferneVonNetzwerkVormerkliste(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const { vormerkliste } = await getNetzwerkGruppen();
  const { error } = await getSupabaseAdmin()
    .from("teilnehmer_community_status")
    .delete()
    .eq("teilnehmer_id", String(formData.get("teilnehmer_id") || ""))
    .eq("community_gruppe_id", vormerkliste);
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk-einladen");
  return { fehler: null };
}

// Zugang sperren (Status "abgelehnt") bzw. wieder freigeben. Sperren wirkt
// sofort, weil RLS nur Status "aktiv" als Mitglied zaehlt.
export async function setzeNetzwerkZugang(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const teilnehmerId = String(formData.get("teilnehmer_id") || "");
  const sperren = formData.get("sperren") === "true";
  const supabase = getSupabaseAdmin();
  const { pilot } = await getNetzwerkGruppen();
  const { data: t } = await supabase.from("teilnehmer").select("auth_user_id").eq("id", teilnehmerId).maybeSingle();
  const status = sperren ? "abgelehnt" : t?.auth_user_id ? "aktiv" : "eingeladen";
  const { error } = await supabase.from("teilnehmer_community_status").update({ status }).eq("teilnehmer_id", teilnehmerId).eq("community_gruppe_id", pilot);
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk-einladen");
  return { fehler: null };
}

// Manuelle Zuordnung aus der Pruefliste: Markus entscheidet, welcher
// Teilnehmer hinter einem Login steckt. Einwilligungs-Ausschluss gilt auch hier.
export async function ordneNetzwerkAnmeldungZu(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const pruefId = String(formData.get("pruef_id") || "");
  const teilnehmerId = String(formData.get("teilnehmer_id") || "");
  const supabase = getSupabaseAdmin();
  const { data: eintrag } = await supabase.from("netzwerk_anmeldungen_pruefen").select("*").eq("id", pruefId).maybeSingle();
  if (!eintrag?.auth_user_id) return { fehler: "Eintrag oder Login nicht gefunden." };
  const { data: t } = await supabase.from("teilnehmer").select("id, auth_user_id, marketing_consent_status").eq("id", teilnehmerId).maybeSingle();
  if (!t) return { fehler: "Teilnehmer nicht gefunden." };
  if (NETZWERK_AUSGESCHLOSSEN.includes(t.marketing_consent_status)) return { fehler: "Diese Person hat keine Einwilligung – keine Freischaltung möglich." };
  if (t.auth_user_id && t.auth_user_id !== eintrag.auth_user_id) return { fehler: "Dieser Teilnehmer ist bereits mit einem anderen Login verknüpft." };
  const { data: belegt } = await supabase.from("teilnehmer").select("id").eq("auth_user_id", eintrag.auth_user_id).neq("id", teilnehmerId).maybeSingle();
  if (belegt) return { fehler: "Dieser Login ist bereits einem anderen Teilnehmer zugeordnet." };

  const { pilot } = await getNetzwerkGruppen();
  const { error: e1 } = await supabase.from("teilnehmer").update({ auth_user_id: eintrag.auth_user_id }).eq("id", teilnehmerId);
  if (e1) return { fehler: e1.message };
  const { error: e2 } = await supabase
    .from("teilnehmer_community_status")
    .upsert({ teilnehmer_id: teilnehmerId, community_gruppe_id: pilot, status: "aktiv" }, { onConflict: "teilnehmer_id,community_gruppe_id" });
  if (e2) return { fehler: e2.message };
  await supabase.rpc("netzwerk_verbindungen_berechnen", { p_teilnehmer: teilnehmerId });
  await supabase.from("netzwerk_anmeldungen_pruefen").update({ erledigt_am: new Date().toISOString(), notiz: `zugeordnet: ${teilnehmerId}` }).eq("id", pruefId);
  revalidatePath("/netzwerk-einladen");
  return { fehler: null };
}

export async function erledigeNetzwerkPruefung(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const { error } = await getSupabaseAdmin()
    .from("netzwerk_anmeldungen_pruefen")
    .update({ erledigt_am: new Date().toISOString(), notiz: String(formData.get("notiz") || "").trim() || "ohne Zuordnung erledigt" })
    .eq("id", String(formData.get("pruef_id") || ""));
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk-einladen");
  return { fehler: null };
}

export async function setzeAgenturRolle(formData: FormData): Promise<VorlagenAktionsErgebnis> {
  const loginFehler = await pruefeBackstageLogin();
  if (loginFehler) return { fehler: loginFehler };
  const rolle = String(formData.get("agentur_rolle") || "");
  if (!["inhaber", "mitinhaber", "angestellt", "unbekannt"].includes(rolle)) return { fehler: "Ungültige Rolle." };
  const { error } = await getSupabaseAdmin().from("teilnehmer_organisationen").update({ agentur_rolle: rolle }).eq("id", String(formData.get("id") || ""));
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk-einladen");
  return { fehler: null };
}


// ---- Tags (Katalog `tags`, Zuordnung `teilnehmer_tags`) ----
// Tags werden nie geloescht, nur deaktiviert (aktiv = false): Zuordnungen und
// spaetere Auswertungen bleiben so nachvollziehbar. `key` ist nach dem Anlegen
// fest, weil Automatisierungen (z. B. Funnel) sich darauf beziehen sollen.

const TAG_TYPEN = ["dem", "beh", "life", "pref"];

function tagKeyAus(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function legeTagAn(formData: FormData) {
  await requireBackstageLogin();
  const label = String(formData.get("label") || "").trim().slice(0, 80);
  const typ = String(formData.get("typ") || "");
  const key = tagKeyAus(String(formData.get("key") || "") || label);
  if (!label || !key) throw new Error("Bitte eine Bezeichnung angeben.");
  if (!TAG_TYPEN.includes(typ)) throw new Error("Bitte einen Typ wählen.");
  const { error } = await getSupabaseAdmin()
    .from("tags")
    .insert({ key, label, typ, beschreibung: String(formData.get("beschreibung") || "").trim().slice(0, 500) || null });
  if (error) throw new Error(error.code === "23505" ? `Den Schlüssel "${key}" gibt es schon.` : error.message);
  revalidatePath("/tags");
  redirect("/tags");
}

export async function aktualisiereTag(formData: FormData) {
  await requireBackstageLogin();
  const label = String(formData.get("label") || "").trim().slice(0, 80);
  const typ = String(formData.get("typ") || "");
  if (!label || !TAG_TYPEN.includes(typ)) throw new Error("Bezeichnung und Typ sind Pflicht.");
  const { error } = await getSupabaseAdmin()
    .from("tags")
    .update({ label, typ, beschreibung: String(formData.get("beschreibung") || "").trim().slice(0, 500) || null })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/tags");
  redirect("/tags");
}

export async function setzeTagAktiv(formData: FormData) {
  await requireBackstageLogin();
  const { error } = await getSupabaseAdmin()
    .from("tags")
    .update({ aktiv: formData.get("aktiv") === "true" })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/tags");
  redirect("/tags");
}

export async function setzeTeilnehmerTags(formData: FormData) {
  await requireBackstageLogin();
  const teilnehmerId = String(formData.get("teilnehmer_id"));
  const gewuenscht = new Set(formData.getAll("tags").map(String).filter(Boolean));
  const supabase = getSupabaseAdmin();
  const { data: vorhanden, error: e1 } = await supabase.from("teilnehmer_tags").select("tag_id").eq("teilnehmer_id", teilnehmerId);
  if (e1) throw new Error(e1.message);
  const bisher = new Set((vorhanden || []).map((v: any) => v.tag_id));
  const neu = [...gewuenscht].filter((id) => !bisher.has(id));
  const weg = [...bisher].filter((id) => !gewuenscht.has(id));
  if (neu.length) {
    const { error } = await supabase.from("teilnehmer_tags").insert(neu.map((tag_id) => ({ teilnehmer_id: teilnehmerId, tag_id, quelle: "manuell" })));
    if (error) throw new Error(error.message);
  }
  if (weg.length) {
    const { error } = await supabase.from("teilnehmer_tags").delete().eq("teilnehmer_id", teilnehmerId).in("tag_id", weg);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/teilnehmer/${teilnehmerId}`);
  redirect(`/teilnehmer/${teilnehmerId}`);
}
