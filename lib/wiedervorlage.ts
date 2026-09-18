import { getSupabaseAdmin } from "./supabase";
import { INBOX_STATUS_GESCHLOSSEN } from "./inbox";
import { berlinHeute, tagPlus } from "./events";

// Sammelt alles, was bis zu einem Stichtag faellig ist -- gemeinsame Quelle
// fuer das Dashboard-Widget, die Seite /wiedervorlage und (Phase 3) die
// Erinnerungsmails, damit "was ist faellig" ueberall gleich berechnet wird.
// Ueberfaelliges (Datum < heute) ist immer enthalten.

export type FaelligerPunkt = {
  art: "aufgabe" | "wiedervorlage" | "cfp" | "event";
  id: string;
  datum: string; // YYYY-MM-DD
  titel: string;
  kontext: string | null;
  href: string;
  ueberfaellig: boolean;
};

export async function ladeFaelligkeiten({ bisTage, cfpTage = bisTage }: { bisTage: number; cfpTage?: number }): Promise<FaelligerPunkt[]> {
  const supabase = getSupabaseAdmin();
  const heute = berlinHeute();
  const bis = tagPlus(heute, bisTage);
  const cfpBis = tagPlus(heute, cfpTage);

  const [aufgaben, inbox, cfp, events] = await Promise.all([
    supabase
      .from("aufgaben")
      .select("id, titel, faellig_am, event_ausgaben(id, jahr, event_reihen(id, name)), kontakte(name), inbox_eintraege(id, titel, text)")
      .is("erledigt_am", null)
      .is("archiviert_am", null)
      .lte("faellig_am", bis),
    supabase
      .from("inbox_eintraege")
      .select("id, titel, text, wiedervorlage_am")
      .lte("wiedervorlage_am", bis)
      .not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`),
    supabase
      .from("event_ausgaben")
      .select("id, jahr, cfp_ende, teilnahme, event_reihen!inner(id, name, archiviert_am)")
      .is("archiviert_am", null)
      .is("event_reihen.archiviert_am", null)
      .gte("cfp_ende", heute)
      .lte("cfp_ende", cfpBis),
    supabase
      .from("event_ausgaben")
      .select("id, jahr, datum_start, teilnahme, event_reihen!inner(id, name, archiviert_am)")
      .is("archiviert_am", null)
      .is("event_reihen.archiviert_am", null)
      .neq("teilnahme", "nicht_moeglich")
      .gte("datum_start", heute)
      .lte("datum_start", bis),
  ]);
  for (const r of [aufgaben, inbox, cfp, events]) if (r.error) throw new Error(r.error.message);

  const punkte: FaelligerPunkt[] = [];
  for (const a of (aufgaben.data || []) as any[]) {
    const ausgabe = a.event_ausgaben;
    const kontext = ausgabe
      ? `${ausgabe.event_reihen?.name} ${ausgabe.jahr}`
      : a.kontakte?.name || (a.inbox_eintraege ? a.inbox_eintraege.titel || a.inbox_eintraege.text : null);
    punkte.push({
      art: "aufgabe",
      id: a.id,
      datum: a.faellig_am,
      titel: a.titel,
      kontext,
      href: ausgabe ? `/events/${ausgabe.event_reihen?.id}#ausgabe-${ausgabe.id}` : "/wiedervorlage",
      ueberfaellig: a.faellig_am < heute,
    });
  }
  for (const e of (inbox.data || []) as any[]) {
    punkte.push({
      art: "wiedervorlage",
      id: e.id,
      datum: e.wiedervorlage_am,
      titel: e.titel || e.text,
      kontext: "Ideen-Inbox",
      href: "/inbox?wv=gesetzt",
      ueberfaellig: e.wiedervorlage_am < heute,
    });
  }
  for (const c of (cfp.data || []) as any[]) {
    punkte.push({
      art: "cfp",
      id: c.id,
      datum: c.cfp_ende,
      titel: `CfP-Deadline ${c.event_reihen.name} ${c.jahr}`,
      kontext: null,
      href: `/events/${c.event_reihen.id}#ausgabe-${c.id}`,
      ueberfaellig: false,
    });
  }
  for (const v of (events.data || []) as any[]) {
    punkte.push({
      art: "event",
      id: v.id,
      datum: v.datum_start,
      titel: `${v.event_reihen.name} ${v.jahr} findet statt`,
      kontext: null,
      href: `/events/${v.event_reihen.id}#ausgabe-${v.id}`,
      ueberfaellig: false,
    });
  }

  return punkte.sort((a, b) => a.datum.localeCompare(b.datum) || a.titel.localeCompare(b.titel));
}

export const FAELLIG_ART_LABEL: Record<FaelligerPunkt["art"], string> = {
  aufgabe: "Aufgabe",
  wiedervorlage: "Wiedervorlage",
  cfp: "CfP",
  event: "Event",
};
