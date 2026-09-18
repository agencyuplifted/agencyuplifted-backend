"use server";

import { fuehreAbmeldungDurch } from "./abmelden";

// Oeffentliche Action der Abmeldeseite -- geschuetzt allein durch den
// signierten Token (kein Login). Erst der Klick meldet ab, nicht schon das
// Oeffnen des Links: Mail-Scanner rufen Links vorab auf.
export async function bestaetigeAbmeldung(formData: FormData): Promise<{ fehler: string | null; info?: string }> {
  try {
    const ok = await fuehreAbmeldungDurch(String(formData.get("token") || ""), "abmeldelink");
    if (!ok) return { fehler: "Dieser Abmeldelink ist ungültig." };
  } catch {
    return { fehler: "Das hat gerade nicht geklappt. Bitte versuch es gleich noch einmal oder antworte einfach auf die Mail." };
  }
  return { fehler: null, info: "Erledigt – du bekommst von uns keine automatischen Mails mehr." };
}
