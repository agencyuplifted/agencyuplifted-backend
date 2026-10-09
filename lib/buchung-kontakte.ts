import { schaetzeAnredeAusVorname } from "./geschlecht";
import { verknuepfeTeilnehmerMitOrganisationAutomatisch } from "./organisationsverknuepfung";
import { findeOrganisationPerName, findeTeilnehmerPerEmail, UNIQUE_VERSTOSS } from "./kontakt-suche";

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

export type ErkannterTeilnehmer = { id: string; email: string; vorname: string; rufname?: string | null; roomOption?: string };

export type Rechnungsadresse = { strasse: string; plz: string; ort: string };

export async function ermittleKontakte(
  supabase: any,
  personen: Teilnehmerangabe[],
  rechnungsadresse: Rechnungsadresse,
  consentQuelle: string,
  // Mit welchem Marketing-Status neue Teilnehmer angelegt werden. Bewusst
  // ein Parameter und kein fester Wert: "abonniert" darf nur die Strecke
  // setzen, deren Formular den Werbehinweis auch tatsaechlich zeigt (siehe
  // unten). Die Programm-Buchungen tun das noch nicht und bleiben deshalb
  // auf "unbekannt".
  consentStatus: "abonniert" | "unbekannt" = "unbekannt"
): Promise<{ fehler: { code: string; detail: string } | null; organisationId: string | null; teilnehmer: ErkannterTeilnehmer[] }> {
  // Organisation anlegen/wiedererkennen (nur beim Hauptkontakt abgefragt).
  let organisationId: string | null = null;
  if (personen[0].company) {
    const bestehendeOrga = await findeOrganisationPerName(
      supabase,
      personen[0].company,
      "id, rechnungsadresse_strasse, rechnungsadresse_plz, rechnungsadresse_ort"
    );
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

    const TEILNEHMER_SPALTEN = "id, rufname, privatadresse_strasse, privatadresse_plz, privatadresse_ort";
    const bestehenderTeilnehmer = await findeTeilnehmerPerEmail(supabase, person.email, TEILNEHMER_SPALTEN);

    if (bestehenderTeilnehmer) {
      teilnehmer.push({ id: bestehenderTeilnehmer.id, email: person.email, vorname: person.firstName, rufname: bestehenderTeilnehmer.rufname, roomOption: person.roomOption });
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
        // Bestandskundenwerbung (§ 7 Abs. 3 UWG): Wer bucht, wird Kunde --
        // Werbung per E-Mail fuer eigene aehnliche Leistungen ist dann auch
        // ohne Opt-in-Haken zulaessig, ABER nur wenn der Kunde schon beim
        // Erheben der Adresse klar auf das Widerspruchsrecht hingewiesen
        // wurde. Genau dafuer steht der Werbehinweis im Buchungsformular
        // (@siteui/seminar-booking-form, werbehinweisLabel) -- verschwindet
        // der, faellt die Grundlage weg und hier darf nur noch "unbekannt"
        // uebergeben werden. Abmeldelink und Sperrliste decken die uebrigen
        // Bedingungen ab (lib/abmelden.ts, ladeSperrliste).
        // Vorher stand hier fest "unbekannt" -- Kampagnen gehen aber nur an
        // "abonniert", dadurch fiel jede Website-Buchung aus dem Verteiler
        // (Befund Markus 09.10.2026: fuenf Teilnehmer seit dem Import).
        marketing_consent_status: consentStatus,
        marketing_consent_quelle: consentQuelle,
        marketing_consent_zeitpunkt: consentStatus === "abonniert" ? new Date().toISOString() : null,
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
    if (teilnehmerError) {
      // Der Unique-Index auf lower(trim(email)) kann hier zuschlagen, wenn
      // zwischen Abgleich und Insert eine zweite Buchung derselben Person
      // durchlief (zwei Formulare gleichzeitig, oder beide Buchungsstrecken).
      // Das ist kein Fehlerfall fuer den Buchenden: der Datensatz existiert ja
      // jetzt, wir nehmen ihn.
      if (teilnehmerError.code === UNIQUE_VERSTOSS) {
        const nachtraeglich = await findeTeilnehmerPerEmail(supabase, person.email, TEILNEHMER_SPALTEN);
        if (nachtraeglich) {
          teilnehmer.push({ id: nachtraeglich.id, email: person.email, vorname: person.firstName, rufname: nachtraeglich.rufname, roomOption: person.roomOption });
          continue;
        }
      }
      return { fehler: { code: "teilnehmer_fehler", detail: teilnehmerError.message }, organisationId, teilnehmer };
    }
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
