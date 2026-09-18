"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "./supabase";
import {
  createNetzwerkClient,
  requireMitglied,
  ermittleZuordnung,
  meldeZurPruefung,
  getNetzwerkGruppen,
  normalisiereEmail,
  sendeNetzwerkLink,
} from "./netzwerk";

// Server Actions des Mitgliederbereichs /netzwerk. Getrennt von
// lib/actions.ts (Backstage), und jede Action prueft selbst, wer eingeloggt
// ist -- Server Actions sind per ID von jeder Route aus aufrufbar, die
// Middleware allein reicht nicht.

type Ergebnis = { fehler: string | null; info?: string };

// Einfaches Rate Limit fuer Login-Links (pro Adresse), damit niemand einem
// Mitglied Mails hinterherwerfen kann.
const letzteLinks = new Map<string, number[]>();

export async function fordereLoginLinkAn(formData: FormData): Promise<Ergebnis> {
  const email = normalisiereEmail(String(formData.get("email") || ""));
  const neutral = { fehler: null, info: "Wenn diese Adresse zum Pilotkreis gehört, ist jetzt ein Anmelde-Link unterwegs. Schau auch in den Spam-Ordner." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { fehler: "Bitte eine gültige E-Mail-Adresse eingeben." };

  const jetzt = Date.now();
  const liste = (letzteLinks.get(email) || []).filter((t) => jetzt - t < 15 * 60_000);
  if (liste.length >= 3) return neutral;
  liste.push(jetzt);
  letzteLinks.set(email, liste);

  const admin = getSupabaseAdmin();
  const { pilot } = await getNetzwerkGruppen();
  const { data } = await admin
    .from("teilnehmer")
    .select("id, vorname, anrede, email, teilnehmer_community_status!inner(status, community_gruppe_id)")
    .ilike("email", email.replace(/[%_\\]/g, "\\$&"))
    .is("deaktiviert_am", null)
    .eq("teilnehmer_community_status.community_gruppe_id", pilot)
    .in("teilnehmer_community_status.status", ["eingeladen", "aktiv"]);
  const treffer = (data || []).filter((t: any) => normalisiereEmail(t.email) === email);
  // Bewusst immer dieselbe Antwort -- verraet nicht, wer Mitglied ist.
  if (treffer.length !== 1) return neutral;
  try {
    await sendeNetzwerkLink({ email, vorname: treffer[0].vorname, anrede: treffer[0].anrede, art: "login" });
  } catch (e: any) {
    console.error("Netzwerk-Login-Link:", e.message);
  }
  return neutral;
}

export async function bestaetigeAnmeldung(formData: FormData): Promise<Ergebnis> {
  const tokenHash = String(formData.get("token_hash") || "");
  const typ = String(formData.get("type") || "");
  if (!tokenHash || (typ !== "invite" && typ !== "magiclink")) return { fehler: "Der Link ist unvollständig." };
  const client = await createNetzwerkClient();
  const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: typ });
  if (error) return { fehler: "Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an." };
  redirect("/netzwerk/willkommen");
}

// "Ja, das bin ich": Zuordnung serverseitig NOCHMAL pruefen (nie der
// Formular-ID vertrauen), dann verknuepfen, aktiv setzen, Verbindungen
// (gemeinsame Seminare) zu anderen aktiven Mitgliedern berechnen.
export async function bestaetigeIdentitaet(): Promise<Ergebnis> {
  const client = await createNetzwerkClient();
  const { data } = await client.auth.getUser();
  if (!data.user?.email) redirect("/netzwerk/login");
  const zuordnung = await ermittleZuordnung(data.user.id, data.user.email);
  if (zuordnung.fall === "aktiv") redirect("/netzwerk");
  if (zuordnung.fall !== "bestaetigen") return { fehler: "Die Zuordnung ist nicht eindeutig – Markus schaut sich das an." };

  const admin = getSupabaseAdmin();
  const { pilot } = await getNetzwerkGruppen();
  const teilnehmerId = zuordnung.teilnehmer.id;
  const { error: e1 } = await admin.from("teilnehmer").update({ auth_user_id: data.user.id }).eq("id", teilnehmerId).is("auth_user_id", null);
  if (e1) return { fehler: e1.message };
  const { error: e2 } = await admin
    .from("teilnehmer_community_status")
    .update({ status: "aktiv" })
    .eq("teilnehmer_id", teilnehmerId)
    .eq("community_gruppe_id", pilot);
  if (e2) return { fehler: e2.message };
  const { error: e3 } = await admin.rpc("netzwerk_verbindungen_berechnen", { p_teilnehmer: teilnehmerId });
  if (e3) console.error("Verbindungen berechnen:", e3.message);
  redirect("/netzwerk");
}

export async function lehneIdentitaetAb(): Promise<Ergebnis> {
  const client = await createNetzwerkClient();
  const { data } = await client.auth.getUser();
  if (!data.user?.email) redirect("/netzwerk/login");
  await meldeZurPruefung(data.user.id, normalisiereEmail(data.user.email), "nicht_ich");
  return { fehler: null, info: "Danke! Markus ordnet dein Profil von Hand zu und meldet sich bei dir." };
}

export async function abmelden(): Promise<void> {
  const client = await createNetzwerkClient();
  await client.auth.signOut();
  redirect("/netzwerk/login");
}

function tagsAus(wert: FormDataEntryValue | null): string[] {
  return Array.from(
    new Set(
      String(wert || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.slice(0, 40))
    )
  ).slice(0, 12);
}

export async function speichereGesuch(formData: FormData): Promise<Ergebnis> {
  const { client, teilnehmerId } = await requireMitglied();
  const typ = String(formData.get("typ") || "");
  const titel = String(formData.get("titel") || "").trim();
  if (typ !== "gesuch" && typ !== "angebot") return { fehler: "Bitte Gesuch oder Angebot wählen." };
  if (!titel) return { fehler: "Bitte einen Titel angeben." };
  // Schreiben mit der Mitglieder-Session: RLS erzwingt teilnehmer_id = ich.
  const { error } = await client.from("gesuche_angebote").insert({
    teilnehmer_id: teilnehmerId,
    typ,
    titel: titel.slice(0, 160),
    beschreibung: String(formData.get("beschreibung") || "").trim().slice(0, 4000) || null,
    tags: tagsAus(formData.get("tags")),
  });
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk/gesuche");
  redirect("/netzwerk/gesuche");
}

export async function setzeGesuchStatus(formData: FormData): Promise<Ergebnis> {
  const { client } = await requireMitglied();
  const status = String(formData.get("status") || "");
  if (!["aktiv", "erledigt"].includes(status)) return { fehler: "Ungültiger Status." };
  const { error } = await client.from("gesuche_angebote").update({ status }).eq("id", String(formData.get("id") || ""));
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk/gesuche");
  return { fehler: null };
}

export async function speichereNetzwerkProfil(formData: FormData): Promise<Ergebnis> {
  const { client, teilnehmerId } = await requireMitglied();
  const text = (feld: string, max: number) => String(formData.get(feld) || "").trim().slice(0, max) || null;
  const linkedin = text("linkedin_url", 300);
  if (linkedin && !/^https?:\/\//i.test(linkedin)) return { fehler: "Bitte den LinkedIn-Link mit https:// angeben." };
  const { error } = await client
    .from("teilnehmer")
    .update({
      netzwerk_sichtbar: formData.get("netzwerk_sichtbar") === "on",
      netzwerk_spezialisierungen: tagsAus(formData.get("netzwerk_spezialisierungen")),
      netzwerk_standort: text("netzwerk_standort", 120),
      netzwerk_kurzprofil: text("netzwerk_kurzprofil", 1500),
      position: text("position", 120),
      telefon: text("telefon", 60),
      mobiltelefon: text("mobiltelefon", 60),
      linkedin_url: linkedin,
    })
    .eq("id", teilnehmerId);
  if (error) return { fehler: error.message };
  revalidatePath("/netzwerk", "layout");
  return { fehler: null, info: "Gespeichert." };
}
