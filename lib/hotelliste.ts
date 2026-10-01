import { splitName } from "./format";

// Gemeinsame Quelle fuer Hotel-Liste (/termine/[id]/teilnehmerliste) und die
// Zimmer-Kennzahl auf der Terminseite -- vorher rechneten beide getrennt und
// zaehlten unterschiedlich (Terminseite ohne Mitarbeiter, Hotel-Liste ohne
// Referent, und Teilnehmer mit Zimmer-Upgrade-Position standen doppelt drin).

export type HotelZeile = {
  schluessel: string;
  teilnehmerId: string | null;
  vorname: string;
  nachname: string;
  typ: "Referent" | "Mitarbeiter" | "Teilnehmer";
  info: string;
  zimmerpartner: string | null;
};

export type Hotelliste = {
  zeilen: HotelZeile[];
  zimmerBenoetigt: number;
  geteilteZimmer: number;
  zimmerReserviert: number | null;
};

// Dieselbe Person kann mehrfach auftauchen (Markus ist Referent und
// Mitarbeiter, Mitarbeiter buchen auch mal selbst) -- im Hotel zaehlt sie
// einmal. Abgleich per E-Mail, sonst per Name.
function personSchluessel(email: string | null | undefined, vorname: string, nachname: string) {
  return (email || `${vorname} ${nachname}`).trim().toLowerCase();
}

export async function ladeHotelliste(supabase: any, terminId: string): Promise<Hotelliste> {
  const [{ data: termin }, { data: referenten }, { data: terminMitarbeiter }, { data: positionen }, { data: zimmerpartner }] = await Promise.all([
    supabase.from("seminartermine").select("zimmer_reserviert").eq("id", terminId).single(),
    supabase.from("seminartermin_referenten").select("trainer(name, email)").eq("seminartermin_id", terminId),
    supabase
      .from("seminartermin_mitarbeiter")
      .select("rolle, mitarbeiter(name, email, teilnehmer(id, vorname, nachname))")
      .eq("seminartermin_id", terminId),
    supabase
      .from("buchungspositionen")
      .select("seminartermin_option_id, teilnehmer(id, vorname, nachname, email), buchungen(status), seminartermin_optionen(titel)")
      .eq("seminartermin_id", terminId),
    supabase
      .from("seminartermin_zimmerpartner")
      .select("teilnehmer_a:teilnehmer_id_a(id, vorname, nachname), teilnehmer_b:teilnehmer_id_b(id, vorname, nachname)")
      .eq("seminartermin_id", terminId),
  ]);

  const map = new Map<string, HotelZeile>();
  const hinzu = (z: HotelZeile) => {
    if (!map.has(z.schluessel)) map.set(z.schluessel, z);
  };

  (referenten || []).forEach((r: any) => {
    if (!r.trainer?.name) return;
    const { vorname, nachname } = splitName(r.trainer.name);
    hinzu({ schluessel: personSchluessel(r.trainer.email, vorname, nachname), teilnehmerId: null, vorname, nachname, typ: "Referent", info: "", zimmerpartner: null });
  });

  (terminMitarbeiter || []).forEach((tm: any) => {
    const m = tm.mitarbeiter;
    if (!m?.name) return;
    // Verknuepfter Teilnehmer-Datensatz hat den vollstaendigen Namen (Login hiess z. B. nur "Anton").
    const { vorname, nachname } = m.teilnehmer ? { vorname: m.teilnehmer.vorname, nachname: m.teilnehmer.nachname } : splitName(m.name);
    const schluessel = personSchluessel(m.email, vorname, nachname);
    const bestehend = map.get(schluessel);
    if (bestehend) {
      if (!bestehend.teilnehmerId && m.teilnehmer) bestehend.teilnehmerId = m.teilnehmer.id;
      return;
    }
    hinzu({ schluessel, teilnehmerId: m.teilnehmer?.id || null, vorname, nachname, typ: "Mitarbeiter", info: tm.rolle || "", zimmerpartner: null });
  });

  (positionen || []).forEach((p: any) => {
    if (p.buchungen?.status === "storniert" || !p.teilnehmer) return;
    const t = p.teilnehmer;
    const schluessel = personSchluessel(t.email, t.vorname, t.nachname);
    const bestehend = map.get(schluessel);
    if (bestehend) {
      if (!bestehend.teilnehmerId) bestehend.teilnehmerId = t.id;
      // Zimmer-Upgrade-Position hat keine Option -- die Seminar-Option gewinnt.
      if (bestehend.typ === "Teilnehmer" && !bestehend.info && p.seminartermin_optionen?.titel) bestehend.info = p.seminartermin_optionen.titel;
      return;
    }
    hinzu({ schluessel, teilnehmerId: t.id, vorname: t.vorname, nachname: t.nachname, typ: "Teilnehmer", info: p.seminartermin_optionen?.titel || "", zimmerpartner: null });
  });

  const zeilen = [...map.values()];
  const anwesend = new Set(zeilen.map((z) => z.teilnehmerId).filter(Boolean));
  const partnerName = new Map<string, string>();
  let geteilteZimmer = 0;
  (zimmerpartner || []).forEach((z: any) => {
    if (!z.teilnehmer_a || !z.teilnehmer_b) return;
    // Nur Paare, die beide wirklich auf der Liste stehen, sparen ein Zimmer.
    if (!anwesend.has(z.teilnehmer_a.id) || !anwesend.has(z.teilnehmer_b.id)) return;
    geteilteZimmer++;
    partnerName.set(z.teilnehmer_a.id, `${z.teilnehmer_b.vorname} ${z.teilnehmer_b.nachname}`);
    partnerName.set(z.teilnehmer_b.id, `${z.teilnehmer_a.vorname} ${z.teilnehmer_a.nachname}`);
  });
  zeilen.forEach((z) => {
    if (z.teilnehmerId && partnerName.has(z.teilnehmerId)) z.zimmerpartner = partnerName.get(z.teilnehmerId)!;
  });

  const typReihenfolge = { Referent: 0, Mitarbeiter: 1, Teilnehmer: 2 };
  zeilen.sort(
    (a, b) =>
      typReihenfolge[a.typ] - typReihenfolge[b.typ] ||
      a.nachname.localeCompare(b.nachname, "de") ||
      a.vorname.localeCompare(b.vorname, "de")
  );

  return {
    zeilen,
    zimmerBenoetigt: zeilen.length - geteilteZimmer,
    geteilteZimmer,
    zimmerReserviert: termin?.zimmer_reserviert ?? null,
  };
}
