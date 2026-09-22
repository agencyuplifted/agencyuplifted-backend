import { schaetzeAnredeAusVorname } from "./geschlecht";
import { verknuepfeTeilnehmerMitOrganisationAutomatisch } from "./organisationsverknuepfung";

// Gemeinsame Kontakt-Logik der oeffentlichen Buchungsstrecken (Seminare:
// /api/public/buchungen, Programme: /api/public/programm-buchungen) --
// Organisation und Teilnehmer anlegen bzw. per Name/E-Mail wiedererkennen.
// Aus der Seminar-Route herausgeloest, damit beide Strecken exakt gleich
// mit Stammdaten umgehen (eine Datenbasis, keine zweite Infrastruktur).

export type Teilnehmerangabe = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  roomOption?: string;
};

export type ErkannterTeilnehmer = { id: string; email: string; vorname: string; roomOption?: string };

export type Rechnungsadresse = { strasse: string; plz: string; ort: string };

export async function ermittleKontakte(
  supabase: any,
  personen: Teilnehmerangabe[],
  rechnungsadresse: Rechnungsadresse,
  consentQuelle: string
): Promise<{ fehler: { code: string; detail: string } | null; organisationId: string | null; teilnehmer: ErkannterTeilnehmer[] }> {
  // Organisation anlegen/wiedererkennen (nur beim Hauptkontakt abgefragt).
  let organisationId: string | null = null;
  if (personen[0].company) {
    const { data: bestehendeOrga } = await supabase
      .from("organisationen")
      .select("id, rechnungsadresse_strasse, rechnungsadresse_plz, rechnungsadresse_ort")
      .ilike("name", personen[0].company)
      .maybeSingle();
    if (bestehendeOrga) {
      organisationId = bestehendeOrga.id;
      // Rechnungsadresse nur nachtragen, wenn noch keine hinterlegt ist -
      // eine bereits gepflegte Adresse wird durch eine neue Buchung nicht ueberschrieben.
      if (!bestehendeOrga.rechnungsadresse_strasse && !bestehendeOrga.rechnungsadresse_plz && !bestehendeOrga.rechnungsadresse_ort) {
        await supabase
          .from("organisationen")
          .update({
            rechnungsadresse_strasse: rechnungsadresse.strasse,
            rechnungsadresse_plz: rechnungsadresse.plz,
            rechnungsadresse_ort: rechnungsadresse.ort,
          })
          .eq("id", organisationId);
      }
    } else {
      const { data: neueOrga, error: orgaError } = await supabase
        .from("organisationen")
        .insert({
          name: personen[0].company,
          rechnungsadresse_strasse: rechnungsadresse.strasse,
          rechnungsadresse_plz: rechnungsadresse.plz,
          rechnungsadresse_ort: rechnungsadresse.ort,
        })
        .select("id")
        .single();
      if (orgaError) return { fehler: { code: "organisation_fehler", detail: orgaError.message }, organisationId: null, teilnehmer: [] };
      organisationId = neueOrga.id;
    }
  }

  // Teilnehmer je Person anlegen/wiedererkennen (Abgleich per E-Mail).
  const teilnehmer: ErkannterTeilnehmer[] = [];
  for (let i = 0; i < personen.length; i++) {
    const person = personen[i];
    // Die Rechnungsadresse aus dem Formular gilt fuer die gesamte Buchung und
    // wird - falls keine Organisation/Firma angegeben ist - beim Hauptkontakt
    // (erste Person) als Privatadresse hinterlegt. Weitere Teilnehmer:innen
    // bekommen keine eigene Adresse (kein Feld im Formular).
    const istHauptkontaktOhneOrganisation = i === 0 && !organisationId;

    const { data: bestehenderTeilnehmer } = await supabase
      .from("teilnehmer")
      .select("id, privatadresse_strasse, privatadresse_plz, privatadresse_ort")
      .ilike("email", person.email)
      .maybeSingle();

    if (bestehenderTeilnehmer) {
      teilnehmer.push({ id: bestehenderTeilnehmer.id, email: person.email, vorname: person.firstName, roomOption: person.roomOption });
      if (
        istHauptkontaktOhneOrganisation &&
        !bestehenderTeilnehmer.privatadresse_strasse &&
        !bestehenderTeilnehmer.privatadresse_plz &&
        !bestehenderTeilnehmer.privatadresse_ort
      ) {
        await supabase
          .from("teilnehmer")
          .update({
            privatadresse_strasse: rechnungsadresse.strasse,
            privatadresse_plz: rechnungsadresse.plz,
            privatadresse_ort: rechnungsadresse.ort,
            privatadresse_land: "Deutschland",
          })
          .eq("id", bestehenderTeilnehmer.id);
      }
      continue;
    }

    const { data: neuerTeilnehmer, error: teilnehmerError } = await supabase
      .from("teilnehmer")
      .insert({
        vorname: person.firstName,
        nachname: person.lastName,
        email: person.email,
        telefon: person.phone || null,
        firma_freitext: person.company || null,
        marketing_consent_status: "unbekannt",
        marketing_consent_quelle: consentQuelle,
        anrede: schaetzeAnredeAusVorname(person.firstName) || "keine_angabe",
        anrede_quelle: schaetzeAnredeAusVorname(person.firstName) ? "automatisch" : null,
        ...(istHauptkontaktOhneOrganisation
          ? {
              privatadresse_strasse: rechnungsadresse.strasse,
              privatadresse_plz: rechnungsadresse.plz,
              privatadresse_ort: rechnungsadresse.ort,
              privatadresse_land: "Deutschland",
            }
          : {}),
      })
      .select("id")
      .single();
    if (teilnehmerError) return { fehler: { code: "teilnehmer_fehler", detail: teilnehmerError.message }, organisationId, teilnehmer };
    teilnehmer.push({ id: neuerTeilnehmer.id, email: person.email, vorname: person.firstName, roomOption: person.roomOption });
  }

  return { fehler: null, organisationId, teilnehmer };
}

// Bei Buchung ueber eine Organisation: alle beteiligten Teilnehmer
// automatisch mit dieser Organisation verknuepfen (siehe
// teilnehmer_organisationen), damit die Stammdaten nicht wieder veralten.
export async function verknuepfeMitOrganisation(supabase: any, organisationId: string | null, teilnehmer: ErkannterTeilnehmer[]) {
  if (!organisationId) return;
  for (const t of teilnehmer) {
    await verknuepfeTeilnehmerMitOrganisationAutomatisch(supabase, t.id, organisationId);
  }
}

// Nutzereingaben in den internen Benachrichtigungsmails (HTML) entschaerfen
export function htmlSicher(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
