import { getSupabaseAdmin } from "./supabase";
import { monatsName } from "./format";

export type GeburtstagsQuelle = "teilnehmer" | "buch_empfaenger";

export type GeburtstagsEintrag = {
  quelle: GeburtstagsQuelle;
  id: string;
  name: string;
  firma: string | null;
  email: string | null;
  linkedinUrl: string | null;
  geburtsdatum: string; // ISO yyyy-mm-dd, wie in der DB gespeichert
  geburtsMonat: number; // 1-12
  geburtsTag: number;
  naechstesJahrMitGeburtstag: number;
  tageBis: number;
  wirdAlt: number; // Alter, das die Person am naechsten Geburtstag erreicht
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  bereitsGratuliertDiesesJahr: boolean;
  detailHref: string;
};

function heuteMitternachtUTC(): Date {
  const jetzt = new Date();
  return new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
}

function berechneNaechstenGeburtstag(geburtsdatumISO: string, heute: Date) {
  const [geburtsJahr, monat, tag] = geburtsdatumISO.split("-").map(Number);
  let kandidat = new Date(Date.UTC(heute.getUTCFullYear(), monat - 1, tag));
  if (kandidat < heute) {
    kandidat = new Date(Date.UTC(heute.getUTCFullYear() + 1, monat - 1, tag));
  }
  const tageBis = Math.round((kandidat.getTime() - heute.getTime()) / 86400000);
  return {
    monat,
    tag,
    naechstesJahrMitGeburtstag: kandidat.getUTCFullYear(),
    tageBis,
    wirdAlt: kandidat.getUTCFullYear() - geburtsJahr,
  };
}

// Laedt alle Kontakte mit bekanntem Geburtsdatum aus beiden Quellen
// (Teilnehmer + Buch-Empfaenger/Presse-Kontakte) und normalisiert sie auf ein
// gemeinsames Format. Wird sowohl fuer die Vorlauf- als auch die
// Kalenderansicht genutzt - Filterung/Sortierung passiert danach im Aufrufer.
export async function ladeAlleGeburtstage(): Promise<GeburtstagsEintrag[]> {
  const supabase = getSupabaseAdmin();
  const heute = heuteMitternachtUTC();
  const jahr = heute.getUTCFullYear();

  const [{ data: teilnehmer }, { data: empfaenger }, { data: versandLog }] = await Promise.all([
    supabase
      .from("teilnehmer")
      .select("id, vorname, nachname, email, geburtsdatum, linkedin_url, firma_freitext, privatadresse_strasse, privatadresse_plz, privatadresse_ort, privatadresse_land, marketing_consent_status, deaktiviert_am")
      .not("geburtsdatum", "is", null)
      .is("deaktiviert_am", null),
    supabase
      .from("buch_empfaenger")
      .select("id, name, email, firma, geburtsdatum, linkedin_url, buch_versand_id, buch_versand(strasse, plz, ort, land)")
      .not("geburtsdatum", "is", null),
    supabase.from("geburtstags_versand_log").select("quelle, kontakt_id, jahr").eq("jahr", jahr),
  ]);

  const bereitsGesendetSet = new Set((versandLog || []).map((v: any) => `${v.quelle}:${v.kontakt_id}`));

  const eintraege: GeburtstagsEintrag[] = [];

  for (const t of teilnehmer || []) {
    if (t.marketing_consent_status === "abgemeldet") continue;
    const berechnung = berechneNaechstenGeburtstag(t.geburtsdatum, heute);
    eintraege.push({
      quelle: "teilnehmer",
      id: t.id,
      name: `${t.vorname} ${t.nachname}`.trim(),
      firma: t.firma_freitext || null,
      email: t.email,
      linkedinUrl: t.linkedin_url,
      geburtsdatum: t.geburtsdatum,
      geburtsMonat: berechnung.monat,
      geburtsTag: berechnung.tag,
      naechstesJahrMitGeburtstag: berechnung.naechstesJahrMitGeburtstag,
      tageBis: berechnung.tageBis,
      wirdAlt: berechnung.wirdAlt,
      strasse: t.privatadresse_strasse,
      plz: t.privatadresse_plz,
      ort: t.privatadresse_ort,
      land: t.privatadresse_land,
      bereitsGratuliertDiesesJahr: bereitsGesendetSet.has(`teilnehmer:${t.id}`),
      detailHref: `/teilnehmer/${t.id}`,
    });
  }

  for (const e of empfaenger || []) {
    const berechnung = berechneNaechstenGeburtstag(e.geburtsdatum, heute);
    const adresse = (e as any).buch_versand;
    eintraege.push({
      quelle: "buch_empfaenger",
      id: e.id,
      name: e.name,
      firma: e.firma || null,
      email: e.email,
      linkedinUrl: e.linkedin_url,
      geburtsdatum: e.geburtsdatum,
      geburtsMonat: berechnung.monat,
      geburtsTag: berechnung.tag,
      naechstesJahrMitGeburtstag: berechnung.naechstesJahrMitGeburtstag,
      tageBis: berechnung.tageBis,
      wirdAlt: berechnung.wirdAlt,
      strasse: adresse?.strasse || null,
      plz: adresse?.plz || null,
      ort: adresse?.ort || null,
      land: adresse?.land || null,
      bereitsGratuliertDiesesJahr: bereitsGesendetSet.has(`buch_empfaenger:${e.id}`),
      detailHref: e.buch_versand_id ? `/buch-versand/${e.buch_versand_id}` : "/buch-empfaenger",
    });
  }

  eintraege.sort((a, b) => a.tageBis - b.tageBis);
  return eintraege;
}

export async function ladeAnstehendeGeburtstage(tageVorlauf: number): Promise<GeburtstagsEintrag[]> {
  const alle = await ladeAlleGeburtstage();
  return alle.filter((e) => e.tageBis <= tageVorlauf);
}

export type GeburtstagsMonatsGruppe = { monat: number; monatsName: string; eintraege: GeburtstagsEintrag[] };

// Kalenderansicht: gruppiert nach Geburtsmonat (nicht nach "naechstem
// Vorkommen"), damit man z.B. "alle Maerz-Geburtstage" sehen kann, egal ob
// der naechste Jahrestag schon in ein paar Wochen oder erst in 11 Monaten ist.
export function gruppiereNachMonat(eintraege: GeburtstagsEintrag[]): GeburtstagsMonatsGruppe[] {
  const gruppen: GeburtstagsMonatsGruppe[] = Array.from({ length: 12 }, (_, i) => ({
    monat: i + 1,
    monatsName: monatsName(i),
    eintraege: [],
  }));
  for (const e of eintraege) {
    gruppen[e.geburtsMonat - 1].eintraege.push(e);
  }
  for (const g of gruppen) {
    g.eintraege.sort((a, b) => a.geburtsTag - b.geburtsTag);
  }
  return gruppen;
}

export const QUARTALE: { key: number; label: string; monate: number[] }[] = [
  { key: 1, label: "Q1 (Jan – Mär)", monate: [1, 2, 3] },
  { key: 2, label: "Q2 (Apr – Jun)", monate: [4, 5, 6] },
  { key: 3, label: "Q3 (Jul – Sep)", monate: [7, 8, 9] },
  { key: 4, label: "Q4 (Okt – Dez)", monate: [10, 11, 12] },
];
