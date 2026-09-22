"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "./supabase";
import { getAktuellerBenutzer } from "./auth";

// Backstage-Aktionen fuer Programme (/programme/[programm]): Programm-Daten,
// Optionen & Preise (von Markus ohne Deploy aenderbar) und Leads. Eigene
// Datei wie beim Terminplaner -- in sich geschlossenes Modul. Alle Aktionen
// geben { fehler } zurueck (AktionsFormular zeigt den Text direkt an).

type Ergebnis = { fehler: string | null };

async function loginFehler(): Promise<string | null> {
  return (await getAktuellerBenutzer()) ? null : "Nicht angemeldet.";
}

const aktualisieren = () => revalidatePath("/programme/[programm]", "page");

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
// "" = leer (null), sonst Zahl >= 0; ungueltig -> Fehler
function betrag(fd: FormData, k: string, label: string): number | null {
  const v = text(fd, k).replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}: bitte einen Betrag ab 0 eingeben.`);
  return Math.round(n * 100) / 100;
}

/** Programm anlegen (mit Schluessel, z. B. "foundation") oder bearbeiten */
export async function speicherProgramm(fd: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const id = text(fd, "id");
  const name = text(fd, "name");
  if (!name) return { fehler: "Bitte einen Namen angeben." };
  const werte = { name, kurzbeschreibung: text(fd, "kurzbeschreibung") || null, aktiv: fd.get("aktiv") === "on" };
  const supabase = getSupabaseAdmin();
  const { error } = id
    ? await supabase.from("programme").update(werte).eq("id", id)
    : await supabase.from("programme").insert({ ...werte, schluessel: text(fd, "schluessel") || null });
  if (error) return { fehler: error.code === "23505" ? "Für dieses Programm gibt es schon einen Datensatz." : error.message };
  aktualisieren();
  return { fehler: null };
}

/** Option anlegen/bearbeiten -- Preise, Ratenzahlung, Zusatzteilnehmer */
export async function speicherProgrammOption(fd: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const id = text(fd, "id");
  const programmId = text(fd, "programm_id");
  const titel = text(fd, "titel");
  if (!titel) return { fehler: "Bitte einen Titel angeben." };
  let werte: Record<string, unknown>;
  try {
    const raten = text(fd, "ratenzahlung_anzahl_raten");
    const ratenZahl = raten === "" ? null : Math.floor(Number(raten));
    if (ratenZahl !== null && (!Number.isFinite(ratenZahl) || ratenZahl < 2 || ratenZahl > 60)) {
      throw new Error("Anzahl Raten bzw. Laufzeit: bitte 2 bis 60 Monate.");
    }
    werte = {
      titel,
      beschreibung: text(fd, "beschreibung") || null,
      badge: text(fd, "badge") || null,
      sortierung: Math.floor(Number(text(fd, "sortierung") || 0)) || 0,
      preis_monatlich: betrag(fd, "preis_monatlich", "Preis monatlich"),
      preis_jaehrlich: betrag(fd, "preis_jaehrlich", "Preis jährlich"),
      ratenzahlung_aktiv: fd.get("ratenzahlung_aktiv") === "on",
      ratenzahlung_anzahl_raten: ratenZahl,
      ratenzahlung_aufschlag_prozent: betrag(fd, "ratenzahlung_aufschlag_prozent", "Aufschlag"),
      zusatzteilnehmer_preis_monatlich: betrag(fd, "zusatzteilnehmer_preis_monatlich", "Zusatzteilnehmer monatlich"),
      zusatzteilnehmer_preis_jaehrlich: betrag(fd, "zusatzteilnehmer_preis_jaehrlich", "Zusatzteilnehmer jährlich"),
      zusatz_teilnehmer_hinweis: text(fd, "zusatz_teilnehmer_hinweis") || null,
    };
  } catch (e: any) {
    return { fehler: e.message };
  }
  if (werte.ratenzahlung_aktiv && werte.preis_monatlich === null) {
    return { fehler: "Monatliche Zahlung ist aktiv – bitte einen Monatspreis angeben." };
  }
  if (werte.preis_jaehrlich === null && werte.preis_monatlich === null) {
    return { fehler: "Bitte mindestens einen Preis (monatlich oder jährlich) angeben." };
  }
  const supabase = getSupabaseAdmin();
  const { error } = id
    ? await supabase.from("programm_optionen").update(werte).eq("id", id)
    : await supabase.from("programm_optionen").insert({ ...werte, programm_id: programmId });
  if (error) return { fehler: error.message };
  aktualisieren();
  return { fehler: null };
}

/** Option deaktivieren/reaktivieren (kein Loeschen: Buchungen verweisen darauf) */
export async function setzeProgrammOptionAktiv(fd: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const aktiv = fd.get("aktiv") === "true";
  const { error } = await getSupabaseAdmin()
    .from("programm_optionen")
    .update({ deaktiviert_am: aktiv ? null : new Date().toISOString() })
    .eq("id", text(fd, "id"));
  if (error) return { fehler: error.message };
  aktualisieren();
  return { fehler: null };
}

/** Lead als kontaktiert markieren bzw. zuruecksetzen */
export async function setzeLeadKontaktiert(fd: FormData): Promise<Ergebnis> {
  const f = await loginFehler();
  if (f) return { fehler: f };
  const kontaktiert = fd.get("kontaktiert") === "true";
  const { error } = await getSupabaseAdmin()
    .from("programm_leads")
    .update({ kontaktiert_am: kontaktiert ? new Date().toISOString() : null })
    .eq("id", text(fd, "id"));
  if (error) return { fehler: error.message };
  aktualisieren();
  return { fehler: null };
}
