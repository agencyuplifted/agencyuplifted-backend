"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "./supabase";
import { getAktuellerBenutzer } from "./auth";
import { bewerte, ladePlanerDaten, importiereFerien, istSeminarFormat, normalisiereSerienRegel, type Bewertung, type Format } from "./terminplaner";
import { kopiereTerminInhalte, einstellungenAusQuelle, uebernahmeZusammenfassung, type UebernahmeBereiche } from "./termin-uebernahme";

// Server Actions des Terminplaners (/termine/planer). Eigene Datei, weil das
// Modul in sich geschlossen ist; jede Action prueft den Backstage-Login selbst.

type Ergebnis = { fehler: string | null; info?: string };

async function login() {
  if (!(await getAktuellerBenutzer())) redirect("/login");
}
async function loginFehler(): Promise<string | null> {
  return (await getAktuellerBenutzer()) ? null : "Nicht angemeldet.";
}

const heuteBerlin = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const zurueck = (tab?: string) => {
  revalidatePath("/termine/planer");
  redirect(`/termine/planer${tab ? `#${tab}` : ""}`);
};

async function ladeFormat(id: string): Promise<Format> {
  const { data } = await getSupabaseAdmin().from("termin_formate").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Format nicht gefunden.");
  return data as Format;
}

/** Bewertung eines frei gewaehlten Termins, ohne zu speichern (manuelle Terminwahl) */
export async function pruefeKandidat(start: string, formatId: string): Promise<{ fehler: string | null; bewertung?: Bewertung }> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { fehler: "Bitte ein Datum wählen." };
  const format = await ladeFormat(formatId);
  const daten = await ladePlanerDaten(Number(start.slice(0, 4)));
  return { fehler: null, bewertung: bewerte(start, format, daten, heuteBerlin()) };
}

/**
 * Kandidat speichern -- aus den Vorschlaegen (algorithmisch) oder frei gewaehlt
 * (manuell). Bewertung wird serverseitig neu berechnet. Einzige harte Grenze:
 * Ueberschneidung mit eigenem Seminartermin muss ausdruecklich bestaetigt werden.
 */
export async function legeKandidatAn(formData: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const start = String(formData.get("datum_start") || "");
  const formatId = String(formData.get("format_id") || "");
  const herkunft = formData.get("herkunft") === "algorithmisch" ? "algorithmisch" : "manuell";
  const statusRoh = String(formData.get("status") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !formatId) return { fehler: "Datum und Format sind Pflicht." };
  const format = await ladeFormat(formatId);
  // "fest" nur fuer die neuen Terminarten (Online/Praesenz) -- Seminare werden
  // ueber "Als Termin festlegen" zu echten Seminarterminen.
  const status =
    statusRoh === "fest" && !istSeminarFormat(format) ? "fest" : statusRoh === "in_pruefung" && istSeminarFormat(format) ? "in_pruefung" : "vorgeschlagen";
  const b = bewerte(start, format, await ladePlanerDaten(Number(start.slice(0, 4))), heuteBerlin());
  const bestaetigt = formData.get("kollision_bestaetigt") === "on";
  if (b.kollision && !bestaetigt) return { fehler: `${b.kollision}. Zum Speichern „Überschneidung bewusst in Kauf nehmen“ anhaken.` };

  const supabase = getSupabaseAdmin();
  // Online-Termine haben keinen Ort (auch wenn im Filter einer gewaehlt ist)
  const ortId = format.terminart === "online" ? null : String(formData.get("veranstaltungsort_id") || "") || null;
  // Touring: gleicher Tag/Format in einer anderen Stadt ist ein eigener Kandidat
  let doppeltAbfrage = supabase
    .from("terminvorschlaege")
    .select("id")
    .eq("datum_start", b.datum_start)
    .eq("format_id", formatId)
    .neq("status", "verworfen");
  doppeltAbfrage = ortId ? doppeltAbfrage.eq("veranstaltungsort_id", ortId) : doppeltAbfrage.is("veranstaltungsort_id", null);
  const { data: doppelt } = await doppeltAbfrage.limit(1);
  if (doppelt?.length) return { fehler: "Dieser Termin ist schon unter „Kandidaten“." };

  const { error } = await supabase.from("terminvorschlaege").insert({
    datum_start: b.datum_start,
    datum_ende: b.datum_ende,
    anreise_datum: b.anreise_datum,
    format_id: formatId,
    veranstaltungsort_id: ortId,
    // Uhrzeiten aus dem Format vorbefuellt, pro Termin/Stadt ueberschreibbar
    start_uhrzeit: zeit(formData, "start_uhrzeit") ?? format.start_uhrzeit ?? null,
    end_uhrzeit: zeit(formData, "end_uhrzeit") ?? format.end_uhrzeit ?? null,
    seminartyp_id: String(formData.get("seminartyp_id") || "") || null,
    score: b.score,
    begruendung: b.gruende,
    herkunft,
    status,
    kollision_bestaetigt: !!b.kollision && bestaetigt,
    notiz: String(formData.get("notiz") || "").trim() || null,
  });
  if (error) return { fehler: error.message };
  revalidatePath("/termine/planer");
  return {
    fehler: null,
    info: status === "fest" ? "Fest eingeplant." : status === "in_pruefung" ? "Als „in Prüfung“ gespeichert." : "Als Kandidat gemerkt.",
  };
}

/**
 * Kandidat einer neuen Terminart (Online/Praesenz) fest einplanen: blockiert
 * ab dann die Planung wie ein Seminar, wird aber (noch) kein seminartermin --
 * die eigene Sektion dafuer folgt. Ueberschneidung nur mit Bestaetigung
 * ("uebergehen").
 */
export async function setzeKandidatFest(formData: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") || "");
  const { data: k } = await supabase.from("terminvorschlaege").select("*, termin_formate(*)").eq("id", id).maybeSingle();
  if (!k || !k.termin_formate) return { fehler: "Kandidat nicht gefunden." };
  if (istSeminarFormat(k.termin_formate)) return { fehler: "Seminare bitte über „Als Termin festlegen“ übernehmen." };
  const b = bewerte(k.datum_start, k.termin_formate as Format, await ladePlanerDaten(Number(k.datum_start.slice(0, 4))), heuteBerlin(), { vorschlagId: id });
  const bestaetigt = formData.get("kollision_bestaetigt") === "on";
  if (b.kollision && !bestaetigt) return { fehler: `${b.kollision}. Zum Festlegen „Überschneidung bewusst in Kauf nehmen“ anhaken.` };
  const { error } = await supabase
    .from("terminvorschlaege")
    .update({ status: "fest", kollision_bestaetigt: !!b.kollision, score: b.score, begruendung: b.gruende, aktualisiert_am: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["vorgeschlagen", "in_pruefung"]);
  if (error) return { fehler: error.message };
  revalidatePath("/termine/planer");
  return { fehler: null, info: "Fest eingeplant." };
}

/**
 * Serie uebernehmen: alle ausgewaehlten Termine einer Serie auf einmal merken
 * oder fest einplanen. Termine mit Ueberschneidung werden dabei uebersprungen
 * (einzeln mit Bestaetigung moeglich) statt still uebergangen.
 */
export async function uebernehmeSerie(formData: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const formatId = String(formData.get("format_id") || "");
  const status = formData.get("status") === "fest" ? "fest" : "vorgeschlagen";
  const tage = String(formData.get("tage") || "")
    .split(",")
    .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t));
  if (!formatId || !tage.length) return { fehler: "Keine Termine ausgewählt." };
  let ok = 0;
  const uebersprungen: string[] = [];
  for (const tag of tage) {
    const fd = new FormData();
    fd.set("datum_start", tag);
    fd.set("format_id", formatId);
    fd.set("herkunft", "algorithmisch");
    fd.set("status", status);
    const r = await legeKandidatAn(fd);
    if (r.fehler) uebersprungen.push(`${tag.split("-").reverse().join(".")}: ${r.fehler.replace(/\. Zum Speichern.*$/, "")}`);
    else ok += 1;
  }
  revalidatePath("/termine/planer");
  const was = status === "fest" ? "fest eingeplant" : "als Kandidaten gemerkt";
  return uebersprungen.length
    ? { fehler: `${ok} ${was}, ${uebersprungen.length} übersprungen – ${uebersprungen.join("; ")}` }
    : { fehler: null, info: `${ok} Termine ${was}.` };
}

// "" = Feld leer gelassen (null), fehlt = nicht im Formular (undefined -> Format-Wert)
// Leeres Feld = Standard aus den Einstellungen (null)
function abstandAus(fd: FormData): number | null {
  const v = String(fd.get("mindestabstand_tage") ?? "").trim();
  return v === "" ? null : Math.min(120, Math.max(0, Math.floor(Number(v)) || 0));
}

function zeit(fd: FormData, feld: string): string | null | undefined {
  if (!fd.has(feld)) return undefined;
  const v = String(fd.get(feld) || "");
  return /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null;
}

/** Kandidat im Kalender auf einen anderen Tag ziehen: neu bewerten, Kollision nur mit Bestaetigung */
export async function verschiebeKandidat(formData: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const id = String(formData.get("id") || "");
  const start = String(formData.get("datum_start") || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { fehler: "Ungültiges Datum." };
  const supabase = getSupabaseAdmin();
  const { data: v } = await supabase.from("terminvorschlaege").select("id, status, format_id, termin_formate(*)").eq("id", id).maybeSingle();
  if (!v || !["vorgeschlagen", "in_pruefung"].includes(v.status)) return { fehler: "Nur gemerkte oder angefragte Kandidaten lassen sich verschieben." };
  const format = v.termin_formate as unknown as Format;
  const b = bewerte(start, format, await ladePlanerDaten(Number(start.slice(0, 4))), heuteBerlin(), { vorschlagId: id });
  const bestaetigt = formData.get("kollision_bestaetigt") === "on";
  if (b.kollision && !bestaetigt) return { fehler: `${b.kollision}. Zum Verschieben „Überschneidung bewusst in Kauf nehmen“ anhaken.` };
  const { error } = await supabase
    .from("terminvorschlaege")
    .update({
      datum_start: b.datum_start,
      datum_ende: b.datum_ende,
      anreise_datum: b.anreise_datum,
      score: b.score,
      begruendung: b.gruende,
      kollision_bestaetigt: !!b.kollision && bestaetigt,
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { fehler: error.message };
  revalidatePath("/termine/planer");
  return { fehler: null, info: "Verschoben." };
}

/** Bewertung fuer einen bestehenden Kandidaten an einem anderen Tag (Vorschau beim Verschieben) */
export async function pruefeVerschiebung(id: string, start: string): Promise<{ fehler: string | null; bewertung?: Bewertung }> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const { data: v } = await getSupabaseAdmin().from("terminvorschlaege").select("termin_formate(*)").eq("id", id).maybeSingle();
  if (!v?.termin_formate) return { fehler: "Kandidat nicht gefunden." };
  const daten = await ladePlanerDaten(Number(start.slice(0, 4)));
  return { fehler: null, bewertung: bewerte(start, v.termin_formate as unknown as Format, daten, heuteBerlin(), { vorschlagId: id }) };
}

/** Kategorie eines Kandidaten schnell setzen (Auswahl direkt in Liste/Kalender) */
export async function setzeKandidatKategorie(id: string, seminartypId: string | null): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const { error } = await getSupabaseAdmin()
    .from("terminvorschlaege")
    .update({ seminartyp_id: seminartypId || null, aktualisiert_am: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "bestaetigt");
  if (error) return { fehler: error.message };
  revalidatePath("/termine/planer");
  revalidatePath("/termine");
  return { fehler: null };
}

export async function setzeKandidatStatus(formData: FormData) {
  await login();
  const status = String(formData.get("status"));
  if (!["vorgeschlagen", "in_pruefung", "verworfen"].includes(status)) throw new Error("Ungültiger Status.");
  const { error } = await getSupabaseAdmin()
    .from("terminvorschlaege")
    .update({ status, aktualisiert_am: new Date().toISOString() })
    .eq("id", String(formData.get("id")))
    .neq("status", "bestaetigt");
  if (error) throw new Error(error.message);
  zurueck("kandidaten");
}

export async function aktualisiereKandidat(formData: FormData) {
  await login();
  const { error } = await getSupabaseAdmin()
    .from("terminvorschlaege")
    .update({
      veranstaltungsort_id: String(formData.get("veranstaltungsort_id") || "") || null,
      seminartyp_id: String(formData.get("seminartyp_id") || "") || null,
      notiz: String(formData.get("notiz") || "").trim() || null,
      ...(formData.has("start_uhrzeit") ? { start_uhrzeit: zeit(formData, "start_uhrzeit"), end_uhrzeit: zeit(formData, "end_uhrzeit") } : {}),
      aktualisiert_am: new Date().toISOString(),
    })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  zurueck("kandidaten");
}

/**
 * Kandidat wird echter Seminartermin -- direkt aus "Kandidat" oder nach
 * "Hotel anfragen" (Markus klaert Termine teils vorab mit dem Hotel, der
 * Zwischenschritt ist deshalb optional). Optional werden Optionen,
 * Preisstaffeln (relativ zum neuen Start), Termin-Einstellungen, Urgency-
 * Stufen, Mitarbeiter und Unterlagen aus einem bestehenden Termin uebernommen
 * (lib/termin-uebernahme.ts). Gibt die neue Termin-ID zurueck statt zu
 * redirecten, damit das Panel Fehler inline zeigen kann.
 */
export async function legeTerminAusKandidatAn(formData: FormData): Promise<Ergebnis & { terminId?: string }> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const supabase = getSupabaseAdmin();
  const id = String(formData.get("id") || "");
  const seminartypId = String(formData.get("seminartyp_id") || "");
  const ortId = String(formData.get("veranstaltungsort_id") || "");
  const quelleId = String(formData.get("quelle_id") || "");
  if (!seminartypId || !ortId) return { fehler: "Für den Termin braucht es Kategorie und Veranstaltungsort." };

  const bereiche: UebernahmeBereiche = {
    optionen: formData.get("uebernahme_optionen") === "on",
    preisstaffeln: formData.get("uebernahme_optionen") === "on" && formData.get("uebernahme_preisstaffeln") === "on",
    einstellungen: formData.get("uebernahme_einstellungen") === "on",
    urgency: formData.get("uebernahme_urgency") === "on",
    mitarbeiter: formData.get("uebernahme_mitarbeiter") === "on",
    unterlagen: formData.get("uebernahme_unterlagen") === "on",
  };

  let quelle: Record<string, any> | null = null;
  if (quelleId) {
    const { data, error } = await supabase.from("seminartermine").select("*").eq("id", quelleId).single();
    if (error || !data) return { fehler: "Quell-Termin nicht gefunden." };
    quelle = data;
  }

  // Kandidat zuerst "beanspruchen" (nur wenn noch nicht bestaetigt) -- ein
  // Doppelklick legt so keinen zweiten Termin an.
  const { data: v } = await supabase
    .from("terminvorschlaege")
    .update({ status: "bestaetigt", aktualisiert_am: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "bestaetigt")
    .select("*, termin_formate(seminar_tage)")
    .maybeSingle();
  if (!v) return { fehler: "Kandidat nicht gefunden oder schon als Termin angelegt." };

  const titel = String(formData.get("titel") || "").trim() || (quelle && bereiche.einstellungen ? quelle.titel : null) || null;
  const { data: termin, error } = await supabase
    .from("seminartermine")
    .insert({
      ...(quelle && bereiche.einstellungen ? einstellungenAusQuelle(quelle) : {}),
      seminartyp_id: seminartypId,
      veranstaltungsort_id: ortId,
      datum_start: v.datum_start,
      datum_ende: v.datum_ende,
      dauer_tage: v.termin_formate?.seminar_tage || quelle?.dauer_tage || null,
      vorabend_anreise_datum: v.anreise_datum,
      vorabendanreise_inklusive: !!v.anreise_datum,
      // Uhrzeit vom Kandidaten (Abendformate), sonst die des Quelltermins
      zeit_start: v.start_uhrzeit || (bereiche.einstellungen ? quelle?.zeit_start : null) || null,
      zeit_ende: v.end_uhrzeit || (bereiche.einstellungen ? quelle?.zeit_ende : null) || null,
      kennung: String(formData.get("kennung") || "").trim() || null,
      titel,
      status: "geplant",
      metadata: { terminvorschlag_id: v.id, ...(quelle ? { einstellungen_aus_termin_id: quelle.id } : {}) },
    })
    .select("id, datum_start")
    .single();
  if (error || !termin) {
    // Kandidat wieder freigeben, sonst stuende er als "bestaetigt" ohne Termin da
    await supabase.from("terminvorschlaege").update({ status: v.status }).eq("id", id);
    // Kennung ist eindeutig (seminartermine_kennung_key) -- war vorher der
    // haeufigste Grund fuer die leere "Application error"-Seite bei der Uebernahme.
    if (error?.code === "23505" && error.message.includes("kennung")) {
      const kennung = String(formData.get("kennung") || "").trim();
      const { data: vorhanden } = await supabase.from("seminartermine").select("titel, datum_start").eq("kennung", kennung).maybeSingle();
      return {
        fehler: `Die Kennung „${kennung}“ ist schon vergeben${vorhanden ? ` (Termin ${vorhanden.titel ? `„${vorhanden.titel}“ ` : ""}vom ${vorhanden.datum_start.split("-").reverse().join(".")})` : ""}. Bitte eine andere Kennung wählen oder das Feld leer lassen.`,
      };
    }
    return { fehler: error?.message || "Termin konnte nicht angelegt werden." };
  }

  await supabase
    .from("terminvorschlaege")
    .update({ seminartermin_id: termin.id, seminartyp_id: seminartypId, veranstaltungsort_id: ortId })
    .eq("id", id);

  let info = "Leerer Termin angelegt.";
  if (quelle) {
    const e = await kopiereTerminInhalte(supabase, { id: quelle.id, datum_start: quelle.datum_start }, termin, bereiche, heuteBerlin());
    info = uebernahmeZusammenfassung(e, bereiche.einstellungen);
  }

  revalidatePath("/termine");
  revalidatePath("/termine/planer");
  return { fehler: null, info, terminId: termin.id };
}

export async function speichereNachbewertung(formData: FormData) {
  await login();
  const wert = String(formData.get("nachbewertung") || "");
  const { error } = await getSupabaseAdmin()
    .from("terminvorschlaege")
    .update({
      nachbewertung: ["gut", "mittel", "schlecht"].includes(wert) ? wert : null,
      nachbewertung_text: String(formData.get("nachbewertung_text") || "").trim() || null,
    })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  zurueck("kandidaten");
}

// ---------- Stammdaten ----------

const datum = (fd: FormData, feld: string) => {
  const v = String(fd.get(feld) || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("Bitte gültige Daten angeben.");
  return v;
};

export async function legeKonferenzAn(formData: FormData) {
  await login();
  const von = datum(formData, "von");
  const bis = String(formData.get("bis") || "") || von;
  const { error } = await getSupabaseAdmin().from("konferenz_kalender").insert({
    name: String(formData.get("name") || "").trim(),
    von,
    bis,
    ort: String(formData.get("ort") || "").trim() || null,
    gewicht: Math.min(5, Math.max(1, Number(formData.get("gewicht") || 2))),
    quelle: String(formData.get("quelle") || "").trim() || null,
  });
  if (error) throw new Error(error.message);
  zurueck("daten");
}

export async function loescheKonferenz(formData: FormData) {
  await login();
  await getSupabaseAdmin().from("konferenz_kalender").delete().eq("id", String(formData.get("id")));
  zurueck("daten");
}

export async function legeBlockerAn(formData: FormData) {
  await login();
  const tag = datum(formData, "datum");
  const { error } = await getSupabaseAdmin().from("persoenliche_blocker").insert({
    bezeichnung: String(formData.get("bezeichnung") || "").trim() || "Persönlicher Termin",
    monat: Number(tag.slice(5, 7)),
    tag: Number(tag.slice(8, 10)),
    puffer_vorher: Math.max(0, Number(formData.get("puffer_vorher") || 0)),
    puffer_nachher: Math.max(0, Number(formData.get("puffer_nachher") || 0)),
    hart: formData.get("hart") === "on",
  });
  if (error) throw new Error(error.message);
  zurueck("daten");
}

export async function aktualisiereBlocker(formData: FormData) {
  await login();
  const { error } = await getSupabaseAdmin()
    .from("persoenliche_blocker")
    .update({
      bezeichnung: String(formData.get("bezeichnung") || "").trim() || "Persönlicher Termin",
      puffer_vorher: Math.max(0, Number(formData.get("puffer_vorher") || 0)),
      puffer_nachher: Math.max(0, Number(formData.get("puffer_nachher") || 0)),
      hart: formData.get("hart") === "on",
    })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  zurueck("daten");
}

export async function loescheBlocker(formData: FormData) {
  await login();
  await getSupabaseAdmin().from("persoenliche_blocker").delete().eq("id", String(formData.get("id")));
  zurueck("daten");
}

export async function ladeFerienNach(formData: FormData) {
  await login();
  const jahr = Number(formData.get("jahr"));
  if (!(jahr >= 2025 && jahr <= 2040)) throw new Error("Ungültiges Jahr.");
  await importiereFerien(jahr);
  zurueck("daten");
}

export async function legeBedarfAn(formData: FormData) {
  await login();
  const { error } = await getSupabaseAdmin().from("kategorie_bedarf").insert({
    seminartyp_id: String(formData.get("seminartyp_id")),
    jahr: Number(formData.get("jahr")),
    zeitraum: String(formData.get("zeitraum") || "jahr"),
    anzahl: Math.max(1, Number(formData.get("anzahl") || 1)),
    format_id: String(formData.get("format_id") || "") || null,
  });
  if (error) throw new Error(error.message);
  zurueck("bedarf");
}

export async function loescheBedarf(formData: FormData) {
  await login();
  await getSupabaseAdmin().from("kategorie_bedarf").delete().eq("id", String(formData.get("id")));
  zurueck("bedarf");
}

// Terminart, Farbe und Serien-Regel eines Formats (Formate-Reiter)
function formatZusatz(fd: FormData) {
  const art = String(fd.get("terminart") || "seminar");
  const farbe = String(fd.get("farbe") || "");
  // Keine Ferienart angehakt = alle werten (wie bisher)
  const ferienTypen = fd.getAll("ferien_typen").map(String).filter((t) => ["winter", "fasching", "ostern", "pfingsten", "sommer", "herbst", "sonstige"].includes(t));
  return {
    ferien_typen: ferienTypen.length ? ferienTypen : null,
    terminart: ["seminar", "online", "praesenz"].includes(art) ? art : "seminar",
    farbe: /^#[0-9a-f]{6}$/i.test(farbe) && fd.get("farbe_aktiv") === "on" ? farbe : null,
    serien_regel: normalisiereSerienRegel({
      rhythmus: fd.get("serie_rhythmus"),
      start_monat: fd.get("serie_start_monat"),
      modus: fd.get("serie_modus"),
      woche_im_monat: fd.get("serie_woche"),
      wochentag: fd.get("serie_wochentag"),
      wochentage: fd.getAll("serie_wochentage").join(","),
      monate: fd.getAll("serie_monate").join(","),
    }),
  };
}

export async function legeFormatAn(formData: FormData) {
  await login();
  const wt = String(formData.get("start_wochentag") || "");
  const modus = String(formData.get("ferien_gewichtung_modus") || "abschlag");
  const { error } = await getSupabaseAdmin().from("termin_formate").insert({
    name: String(formData.get("name") || "").trim(),
    start_uhrzeit: zeit(formData, "start_uhrzeit") ?? null,
    end_uhrzeit: zeit(formData, "end_uhrzeit") ?? null,
    benoetigt_uebernachtung: formData.get("benoetigt_uebernachtung") === "on",
    ferien_gewichtung_modus: ["abschlag", "neutral", "bonus"].includes(modus) ? modus : "abschlag",
    start_wochentag: wt ? Number(wt) : null,
    seminar_tage: Math.min(10, Math.max(1, Number(formData.get("seminar_tage") || 1))),
    halbtag: formData.get("halbtag") === "on",
    vorabend: formData.get("vorabend") === "on",
    abendprogramm: formData.get("abendprogramm") === "on",
    beschreibung: String(formData.get("beschreibung") || "").trim() || null,
    mindestabstand_tage: abstandAus(formData),
    ...formatZusatz(formData),
    sortierung: 99,
  });
  if (error) throw new Error(error.message);
  zurueck("formate");
}

// Bestehende Formate vollstaendig bearbeiten. Bereits gespeicherte Kandidaten
// behalten ihre Daten; neu bewertet wird mit dem geaenderten Format.
export async function aktualisiereFormat(formData: FormData) {
  await login();
  const modus = String(formData.get("ferien_gewichtung_modus") || "abschlag");
  const wt = String(formData.get("start_wochentag") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Bitte einen Namen angeben.");
  const { error } = await getSupabaseAdmin()
    .from("termin_formate")
    .update({
      name,
      start_wochentag: wt ? Number(wt) : null,
      seminar_tage: Math.min(10, Math.max(1, Number(formData.get("seminar_tage") || 1))),
      halbtag: formData.get("halbtag") === "on",
      vorabend: formData.get("vorabend") === "on",
      abendprogramm: formData.get("abendprogramm") === "on",
      beschreibung: String(formData.get("beschreibung") || "").trim() || null,
      mindestabstand_tage: abstandAus(formData),
      ferien_gewichtung_modus: ["abschlag", "neutral", "bonus"].includes(modus) ? modus : "abschlag",
      benoetigt_uebernachtung: formData.get("benoetigt_uebernachtung") === "on",
      start_uhrzeit: zeit(formData, "start_uhrzeit") ?? null,
      end_uhrzeit: zeit(formData, "end_uhrzeit") ?? null,
      ...formatZusatz(formData),
    })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  zurueck("formate");
}

export async function setzeFormatAktiv(formData: FormData) {
  await login();
  await getSupabaseAdmin().from("termin_formate").update({ aktiv: formData.get("aktiv") === "true" }).eq("id", String(formData.get("id")));
  zurueck("formate");
}

export async function speichereEinstellungen(formData: FormData) {
  await login();
  const { error } = await getSupabaseAdmin()
    .from("terminplaner_einstellungen")
    .update({
      mindestabstand_tage: Math.min(120, Math.max(0, Number(formData.get("mindestabstand_tage") || 0))),
      vorlauf_tage: Math.min(365, Math.max(0, Number(formData.get("vorlauf_tage") || 0))),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  zurueck("formate");
}

export async function setzeOrtFuerPlanung(formData: FormData) {
  await login();
  await getSupabaseAdmin()
    .from("veranstaltungsorte")
    .update({ terminplanung_aktiv: formData.get("aktiv") === "true" })
    .eq("id", String(formData.get("id")));
  zurueck("formate");
}
