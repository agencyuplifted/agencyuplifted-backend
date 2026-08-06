"use server";

import { getSupabaseAdmin } from "./supabase";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getResend, ABSENDER } from "./email";
import { signSession, SESSION_COOKIE_NAME, SESSION_TTL } from "./session";
import { hashePasswort, pruefePasswort } from "./passwort";
import { getAktuellerBenutzer } from "./auth";
import { TERMIN_FELD_LABELS, formatDatum } from "./format";
import { renderPlatzhalter } from "./funnel";
import { verknuepfeTeilnehmerMitOrganisationAutomatisch } from "./organisationsverknuepfung";
import { randomUUID } from "crypto";

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

export async function updateSeminartypFarbe(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartyp_id"));
  const farbe = String(formData.get("farbe") || "#102A4C");
  const { error } = await supabase.from("seminartypen").update({ farbe }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/seminartypen");
  revalidatePath("/termine");
  redirect("/seminartypen");
}

export async function updateTeilnehmerStammdaten(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("teilnehmer")
    .update({
      anrede: formData.get("anrede") || "keine_angabe",
      rolle: formData.get("rolle") || "teilnehmer",
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

// Verknuepft einen Teilnehmer mit einer Organisation (M:N, siehe
// teilnehmer_organisationen). Ein Teilnehmer kann mehrere Organisationen
// haben (z.B. bei mehreren moeglichen Rechnungsempfaengern) - eine davon ist
// als "Hauptorganisation" markiert. Ist es die erste Verknuepfung, wird sie
// automatisch zur Hauptorganisation.
export async function verknuepfeTeilnehmerOrganisation(formData: FormData) {
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
  const id = String(formData.get("seminartermin_id"));
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") params.set(key, value);
  }
  redirect(`/termine/${id}/bestaetigen?${params.toString()}`);
}

export async function updateSeminartermin(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("seminartermin_id"));
  const datumStart = String(formData.get("datum_start"));
  const datumEnde = formData.get("datum_ende") || datumStart;

  const { data: alterTermin } = await supabase
    .from("seminartermine")
    .select("*, veranstaltungsorte(name), trainer(name)")
    .eq("id", id)
    .single();

  const neuerOrtId = formData.get("veranstaltungsort_id");
  const neuerTrainerId = formData.get("trainer_id");
  const neuerOrt = neuerOrtId
    ? (await supabase.from("veranstaltungsorte").select("name").eq("id", String(neuerOrtId)).single()).data?.name
    : null;
  const neuerTrainer = neuerTrainerId
    ? (await supabase.from("trainer").select("name").eq("id", String(neuerTrainerId)).single()).data?.name
    : null;

  const update = {
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
    angezeigte_restplaetze: formData.get("angezeigte_restplaetze")
      ? Number(formData.get("angezeigte_restplaetze"))
      : null,
    zusatzteilnehmer_preis: formData.get("zusatzteilnehmer_preis")
      ? Number(formData.get("zusatzteilnehmer_preis"))
      : null,
    zusatzteilnehmer_rabatt_prozent: formData.get("zusatzteilnehmer_rabatt_prozent")
      ? Number(formData.get("zusatzteilnehmer_rabatt_prozent"))
      : null,
  };

  const { error } = await supabase.from("seminartermine").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  if (alterTermin) {
    const neuAnzeige = (feld: string): string => {
      if (feld === "veranstaltungsort_id") return neuerOrt || "—";
      if (feld === "trainer_id") return neuerTrainer || "—";
      const wert = (update as any)[feld];
      return wert === null || wert === undefined || wert === "" ? "—" : String(wert);
    };
    const altAnzeige = (feld: string): string => {
      if (feld === "veranstaltungsort_id") return (alterTermin as any).veranstaltungsorte?.name || "—";
      if (feld === "trainer_id") return (alterTermin as any).trainer?.name || "—";
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
    .select("betreff, inhalt")
    .eq("id", ZAHLUNGSBESTAETIGUNG_FUNNEL_MAIL_ID)
    .single();

  if (funnelMail) {
    for (const [email, vorname] of empfaengerMap) {
      const werte = { vorname, seminartitel, seminardatum };
      const betreff = renderPlatzhalter(funnelMail.betreff, werte);
      const inhaltHtml = renderPlatzhalter(funnelMail.inhalt, werte).replace(/\n/g, "<br/>");

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

export async function setzeZimmerpartner(formData: FormData) {
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
  redirect(`/termine/${seminarterminId}`);
}

export async function entferneZimmerpartner(formData: FormData) {
  const supabase = getSupabaseAdmin();
  const seminarterminId = String(formData.get("seminartermin_id"));
  const zuordnungId = String(formData.get("zuordnung_id"));
  const { error } = await supabase
    .from("seminartermin_zimmerpartner")
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
  const id = String(formData.get("seminartermin_id"));
  redirect(`/termine/${id}/loeschen`);
}

// Schritt 2: löscht den Termin endgültig — nur wenn serverseitig bestätigt keine
// Buchungspositionen (auch keine stornierten) mehr daran hängen. Legacy-Zuordnungen
// werden vorher automatisch gelöst (nur eine Anzeige-Verknüpfung, keine echte Buchung).
export async function loescheSeminartermin(formData: FormData) {
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

// ---------- Content Creation (Content-/GEO-Pflegeaufgaben) ----------

export async function erledigtMarkierenContentAufgabe(formData: FormData) {
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
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("content_aufgaben").update({ status: "offen" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

export async function neueContentAufgabe(formData: FormData) {
  const titel = String(formData.get("titel") || "").trim();
  if (!titel) throw new Error("Titel darf nicht leer sein.");
  const beschreibung = String(formData.get("beschreibung") || "").trim() || null;
  const rhythmus = String(formData.get("rhythmus") || "einmalig");

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("content_aufgaben").insert({ titel, beschreibung, rhythmus });
  if (error) throw new Error(error.message);
  revalidatePath("/content-creation");
}

// ---------- Buch-Versand (Rezensions-/Gratisexemplare) ----------

export async function legeBuchVersandAn(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const strasse = String(formData.get("strasse") || "").trim();
  const plz = String(formData.get("plz") || "").trim();
  const ort = String(formData.get("ort") || "").trim();
  const land = String(formData.get("land") || "Deutschland").trim();
  const email = String(formData.get("email") || "").trim() || null;
  const grund = String(formData.get("grund") || "rezension");
  const rohtext = String(formData.get("rohtext") || "") || null;

  if (!name || !strasse || !plz || !ort) {
    throw new Error("Name, Straße, PLZ und Ort sind Pflichtfelder.");
  }

  const supabase = getSupabaseAdmin();
  // Shopify-Anbindung folgt (Ticket #154) - bis dahin Status "entwurf",
  // damit nichts fälschlich als versendet gilt.
  const { error } = await supabase.from("buch_versand").insert({
    name,
    strasse,
    plz,
    ort,
    land,
    email,
    grund,
    rohtext,
    status: "entwurf",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/buch-versand");
}

export async function versendeBuchExemplarAction(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = getSupabaseAdmin();

  const { data: eintrag, error: ladeFehler } = await supabase
    .from("buch_versand")
    .select("id, name, email, strasse, plz, ort, land, grund")
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
