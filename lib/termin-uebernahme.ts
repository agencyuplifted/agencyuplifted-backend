import type { SupabaseClient } from "@supabase/supabase-js";
import { uebertrageStaffelnAufTermin } from "./preisstaffeln";

// "Einstellungen uebernehmen aus Termin X" beim Festlegen eines Kandidaten im
// Terminplaner: kopiert die wiederverwendbaren Teile eines bestehenden
// Termins in einen neu angelegten -- alles, was an einem Datum haengt, wird
// relativ zum neuen Starttermin umgerechnet (siehe uebertrageStaffelnAufTermin).
// Bewusst NICHT kopiert: Kennung, Onepage-Slug, Status, Buchungen,
// Teilnehmer, Warteliste, Zimmerpartner, angezeigte Restplaetze (alles
// termin-individuell).

export type UebernahmeBereiche = {
  optionen: boolean;
  preisstaffeln: boolean;
  einstellungen: boolean;
  urgency: boolean;
  mitarbeiter: boolean;
  unterlagen: boolean;
};

// Termin-Felder, die "Termin-Einstellungen" umfasst. Datum, Uhrzeit,
// Vorabend-Datum, Ort und Kategorie kommen immer vom Kandidaten.
export const EINSTELLUNGS_FELDER = [
  "format",
  "trainer_id",
  "kapazitaet",
  "mindestteilnehmerzahl",
  "ueberbuchungspuffer",
  "urgency_label_template",
  "buchungsschluss_stunden_vor_start",
  "vorabend_anreise_uhrzeit",
  "zusatzteilnehmer_preis",
  "zusatzteilnehmer_rabatt_prozent",
  "zimmerupgrade_beschreibung",
  "zimmerupgrade_preis_pro_nacht_netto",
  "eyebrow_text",
  "untertitel",
  "selbstauskunft_label",
  "selbstauskunft_aktiv",
  "verfuegbarkeit_anzeige_modus",
] as const;

export function einstellungenAusQuelle(quelle: Record<string, any>): Record<string, any> {
  const werte: Record<string, any> = {};
  for (const feld of EINSTELLUNGS_FELDER) {
    if (quelle[feld] !== null && quelle[feld] !== undefined) werte[feld] = quelle[feld];
  }
  return werte;
}

export type UebernahmeErgebnis = {
  optionen: number;
  staffeln: number;
  weggelasseneStaffeln: string[];
  urgency: number;
  mitarbeiter: number;
  unterlagen: number;
  fehler: string[];
};

export async function kopiereTerminInhalte(
  supabase: SupabaseClient,
  quelle: { id: string; datum_start: string },
  ziel: { id: string; datum_start: string },
  bereiche: UebernahmeBereiche,
  heuteISO: string
): Promise<UebernahmeErgebnis> {
  const ergebnis: UebernahmeErgebnis = { optionen: 0, staffeln: 0, weggelasseneStaffeln: [], urgency: 0, mitarbeiter: 0, unterlagen: 0, fehler: [] };

  if (bereiche.optionen) {
    // Deaktivierte Optionen nicht mitnehmen -- sie waren beim Quelltermin
    // bewusst aus dem Angebot genommen.
    const { data: optionen, error } = await supabase
      .from("seminartermin_optionen")
      .select("*, seminartermin_options_features(*), preisstaffeln(*)")
      .eq("seminartermin_id", quelle.id)
      .is("deaktiviert_am", null)
      .order("sortierung");
    if (error) ergebnis.fehler.push(`Optionen: ${error.message}`);

    for (const opt of (optionen as any[]) || []) {
      const { data: neu, error: optErr } = await supabase
        .from("seminartermin_optionen")
        .insert({
          seminartermin_id: ziel.id,
          titel: opt.titel,
          beschreibung: opt.beschreibung,
          badge: opt.badge,
          sortierung: opt.sortierung,
          zusatz_teilnehmer_hinweis: opt.zusatz_teilnehmer_hinweis,
          zimmerupgrade_zusatznaechte: opt.zimmerupgrade_zusatznaechte,
          ratenzahlung_aktiv: opt.ratenzahlung_aktiv || false,
          ratenzahlung_anzahl_raten: opt.ratenzahlung_anzahl_raten,
          ratenzahlung_aufschlag_prozent: opt.ratenzahlung_aufschlag_prozent,
          vorspann_text: opt.vorspann_text,
          vorspann_anzeigen: opt.vorspann_anzeigen || false,
        })
        .select("id")
        .single();
      if (optErr || !neu) {
        ergebnis.fehler.push(`Option „${opt.titel}“: ${optErr?.message}`);
        continue;
      }
      ergebnis.optionen += 1;

      if (opt.seminartermin_options_features?.length) {
        const { error: fErr } = await supabase.from("seminartermin_options_features").insert(
          opt.seminartermin_options_features.map((f: any) => ({
            seminartermin_option_id: neu.id,
            text: f.text,
            label: f.label,
            hervorgehoben: f.hervorgehoben || false,
            sortierung: f.sortierung,
          }))
        );
        if (fErr) ergebnis.fehler.push(`Features „${opt.titel}“: ${fErr.message}`);
      }

      if (bereiche.preisstaffeln && opt.preisstaffeln?.length) {
        const { staffeln, weggelassen } = uebertrageStaffelnAufTermin(opt.preisstaffeln, quelle.datum_start, ziel.datum_start, heuteISO);
        ergebnis.weggelasseneStaffeln.push(...weggelassen.map((n) => `${opt.titel}: ${n}`));
        if (staffeln.length) {
          const { error: pErr } = await supabase
            .from("preisstaffeln")
            .insert(staffeln.map((s) => ({ ...s, seminartermin_option_id: neu.id })));
          if (pErr) ergebnis.fehler.push(`Preisstaffeln „${opt.titel}“: ${pErr.message}`);
          else ergebnis.staffeln += staffeln.length;
        }
      }
    }
  }

  if (bereiche.urgency) {
    const { data: stufen } = await supabase.from("urgency_stufen").select("*").eq("seminartermin_id", quelle.id);
    if (stufen?.length) {
      const { error } = await supabase.from("urgency_stufen").insert(
        stufen.map((u: any) => ({
          seminartermin_id: ziel.id,
          schwellenwert_typ: u.schwellenwert_typ,
          schwellenwert_prozent: u.schwellenwert_prozent,
          schwellenwert_anzahl: u.schwellenwert_anzahl,
          text_vorlage: u.text_vorlage,
          sortierung: u.sortierung,
        }))
      );
      if (error) ergebnis.fehler.push(`Urgency-Stufen: ${error.message}`);
      else ergebnis.urgency = stufen.length;
    }
  }

  if (bereiche.mitarbeiter) {
    const { data: zuordnungen } = await supabase.from("seminartermin_mitarbeiter").select("*").eq("seminartermin_id", quelle.id);
    if (zuordnungen?.length) {
      const { error } = await supabase.from("seminartermin_mitarbeiter").insert(
        zuordnungen.map((m: any) => ({ seminartermin_id: ziel.id, mitarbeiter_id: m.mitarbeiter_id, rolle: m.rolle }))
      );
      if (error) ergebnis.fehler.push(`Mitarbeiter: ${error.message}`);
      else ergebnis.mitarbeiter = zuordnungen.length;
    }
  }

  if (bereiche.unterlagen) {
    // Hochgeladene Dateien werden physisch kopiert, nicht nur verlinkt:
    // loescheSeminarUnterlage entfernt die Datei aus dem Storage -- ein
    // geteilter Pfad wuerde die Unterlage sonst beim anderen Termin mitloeschen.
    const { data: unterlagen } = await supabase.from("seminar_unterlagen").select("*").eq("seminartermin_id", quelle.id).order("position");
    for (const u of (unterlagen as any[]) || []) {
      let dateiUrl = String(u.datei_url);
      if (dateiUrl.startsWith("storage:")) {
        const alterPfad = dateiUrl.slice(8);
        const neuerPfad = `${ziel.id}/${Date.now()}-${alterPfad.split("/").pop()}`;
        const { error } = await supabase.storage.from("seminar-unterlagen").copy(alterPfad, neuerPfad);
        if (error) {
          ergebnis.fehler.push(`Unterlage „${u.titel}“: ${error.message}`);
          continue;
        }
        dateiUrl = `storage:${neuerPfad}`;
      }
      const { error } = await supabase
        .from("seminar_unterlagen")
        .insert({ seminartermin_id: ziel.id, titel: u.titel, datei_url: dateiUrl, position: u.position });
      if (error) ergebnis.fehler.push(`Unterlage „${u.titel}“: ${error.message}`);
      else ergebnis.unterlagen += 1;
    }
  }

  return ergebnis;
}

export function uebernahmeZusammenfassung(e: UebernahmeErgebnis, einstellungen: boolean): string {
  const teile: string[] = [];
  if (einstellungen) teile.push("Termin-Einstellungen");
  if (e.optionen) teile.push(`${e.optionen} Option(en)`);
  if (e.staffeln) teile.push(`${e.staffeln} Preisstufe(n)`);
  if (e.urgency) teile.push(`${e.urgency} Urgency-Stufe(n)`);
  if (e.mitarbeiter) teile.push(`${e.mitarbeiter} Mitarbeiter`);
  if (e.unterlagen) teile.push(`${e.unterlagen} Unterlage(n)`);
  let text = teile.length ? `Übernommen: ${teile.join(", ")}.` : "Leerer Termin angelegt.";
  if (e.weggelasseneStaffeln.length) text += ` Weggelassen (Stichtag schon vorbei): ${e.weggelasseneStaffeln.join("; ")}.`;
  if (e.fehler.length) text += ` Probleme: ${e.fehler.join("; ")}`;
  return text;
}
