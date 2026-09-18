"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "./supabase";
import { pruefeSeminarToken } from "./seminar-links";

// Einzige oeffentliche Aktion der Teilnehmer-Seiten: die eigene Freigabe fuer
// die Teilnehmerliste setzen. Berechtigung ausschliesslich ueber den
// signierten Token -- und nur fuer genau diese eine Person.
export async function setzeTeilnehmerlisteFreigabe(formData: FormData): Promise<{ fehler: string | null; info?: string }> {
  const geprueft = pruefeSeminarToken(String(formData.get("token") || ""));
  if (!geprueft) return { fehler: "Der Link ist ungültig." };
  const freigabe = formData.get("freigabe") === "on";
  const linkedin = String(formData.get("linkedin_url") || "").trim();
  if (linkedin && !/^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i.test(linkedin)) {
    return { fehler: "Bitte einen LinkedIn-Link angeben, der mit https://www.linkedin.com/ beginnt." };
  }
  const felder: Record<string, unknown> = { teilnehmerliste_freigabe: freigabe };
  if (linkedin) felder.linkedin_url = linkedin;
  const { error } = await getSupabaseAdmin().from("teilnehmer").update(felder).eq("id", geprueft.teilnehmerId);
  if (error) return { fehler: "Speichern hat leider nicht geklappt. Bitte später noch einmal versuchen." };
  revalidatePath(`/seminar/${String(formData.get("token"))}/teilnehmer`);
  return { fehler: null, info: freigabe ? "Danke! Du erscheinst in der Teilnehmerliste mit LinkedIn-Profil." : "Gespeichert – du erscheinst ohne LinkedIn-Profil." };
}
