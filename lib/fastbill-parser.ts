// Vorschlag fuer den FastBill-Abgleich aus dem Rechnungstext. Vorher gab es
// nur einen exakten Preis-Treffer beim Import (findePreisMatch) -- der greift
// weder bei Gruppen ("Zwei Teilnehmer") noch bei alten Preisstufen, und man
// musste fuer jede Rechnung in FastBill nachlesen. Die Texte sind recht
// einheitlich ("Seminar Preisfindung in Agenturen 7. bis 9. Oktober 2026 …
// Zwei Teilnehmer", "AgencyUplifted Konferenz // Premium 14. und 15. April
// 2027"), daraus lassen sich Termin, Personenzahl und Option ableiten.
//
// Rein funktional (keine DB), damit es serverseitig pro Seitenaufruf laufen
// kann und nichts gespeichert werden muss.

export type ParserTermin = {
  id: string;
  kennung: string | null;
  titel: string | null;
  typ: string | null;
  datum_start: string;
  datum_ende: string | null;
  optionen: { id: string; titel: string; preise: number[] }[];
};

export type ParserTeilnehmer = { id: string; vorname: string; nachname: string };

export type RechnungsVorschlag = {
  art: "seminar" | "konferenz" | "projekt" | "buch" | "unbekannt";
  terminId: string | null;
  terminText: string | null;
  optionId: string | null;
  optionTitel: string | null;
  anzahl: number;
  preisProPerson: number | null;
  teilnehmerId: string | null;
  gruende: string[];
  warnungen: string[];
};

const MONATE = ["januar", "februar", "märz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];
const ZAHLWOERTER: Record<string, number> = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6 };
// Schluesselwort im Rechnungstext -> Bestandteil des Seminartyp-Namens
const TYP_STICHWORTE: [RegExp, string][] = [
  [/konferenz/i, "konferenz"],
  [/preisfindung/i, "preisfindung"],
  [/führung/i, "führung"],
  [/fokussierung|kundengewinnung/i, "fokussierung"],
  [/organisation und zusammenarbeit/i, "organisation"],
];

const iso = (j: number, m: number, t: number) => `${j}-${String(m + 1).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
const deDatum = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;

function findeDatum(text: string): { start: string; monat: number; jahr: number } | null {
  const monat = MONATE.join("|");
  const spanne = new RegExp(`(\\d{1,2})\\.\\s*(?:bis|und|–|-)\\s*\\d{1,2}\\.\\s*(${monat})\\s+(\\d{4})`, "i").exec(text);
  const einzel = spanne ? null : new RegExp(`(\\d{1,2})\\.\\s*(${monat})\\s+(\\d{4})`, "i").exec(text);
  const m = spanne || einzel;
  if (!m) return null;
  const mi = MONATE.indexOf(m[2].toLowerCase());
  const jahr = Number(m[3]);
  return { start: iso(jahr, mi, Number(m[1])), monat: mi, jahr };
}

export function parseRechnung(
  rechnung: { positionen: any; betrag_netto: number | string; kunde_vorname?: string | null; kunde_nachname?: string | null },
  termine: ParserTermin[],
  teilnehmer: ParserTeilnehmer[]
): RechnungsVorschlag {
  const positionen: any[] = Array.isArray(rechnung.positionen) ? rechnung.positionen : [];
  const text = positionen.map((p) => String(p.description || "")).join("\n").replace(/[ \t]+/g, " ");
  const netto = Number(rechnung.betrag_netto || 0);
  const v: RechnungsVorschlag = {
    art: "unbekannt", terminId: null, terminText: null, optionId: null, optionTitel: null,
    anzahl: 1, preisProPerson: null, teilnehmerId: null, gruende: [], warnungen: [],
  };

  // Art der Rechnung
  if (/ISBN|\[Buch\]|Softcover/i.test(text)) {
    v.art = "buch";
    v.gruende.push("Buchverkauf (ISBN/Softcover) – keine Seminarbuchung");
    return v;
  }
  const istKonferenz = /konferenz/i.test(text);
  const istSeminar = /\bseminar\b/i.test(text);
  if (!istKonferenz && !istSeminar) {
    if (/begleitung|coaching|sparring|beratung|accelerate|uplift|option [abc]\b/i.test(text)) {
      v.art = "projekt";
      v.gruende.push("Beratung/Begleitung – eher Kategorie „Projekt“");
    }
    return v;
  }
  v.art = istKonferenz ? "konferenz" : "seminar";

  // Personenzahl: "Zwei Teilnehmer" im Text, sonst Menge der Positionen
  const zahlwort = /\b(zwei|drei|vier|fünf|sechs|[2-6])\s+teilnehmer/i.exec(text);
  const menge = positionen.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
  if (zahlwort) {
    v.anzahl = ZAHLWOERTER[zahlwort[1].toLowerCase()] || 1;
    v.gruende.push(`„${zahlwort[0]}“ im Text`);
  } else if (Number.isInteger(menge) && menge > 1) {
    v.anzahl = menge;
    v.gruende.push(`Menge ${menge}`);
  }
  v.preisProPerson = v.anzahl ? Math.round((netto / v.anzahl) * 100) / 100 : null;

  // Termin: Seminartyp + Datum. Exakter Starttag zuerst; alte Seminare stehen
  // im System teils nur als Platzhalter am Monatsersten, daher Fallback Monat.
  const stichwort = TYP_STICHWORTE.find(([re]) => re.test(text))?.[1] || null;
  const datum = findeDatum(text);
  const passendeArt = termine.filter((t) => {
    if (!stichwort) return true;
    return `${t.typ || ""} ${t.titel || ""}`.toLowerCase().includes(stichwort);
  });
  if (!datum) {
    v.warnungen.push("Kein Datum im Text gefunden");
  } else {
    const exakt = passendeArt.filter((t) => t.datum_start === datum.start);
    const monat = passendeArt.filter((t) => {
      const d = new Date(t.datum_start);
      return d.getUTCFullYear() === datum.jahr && d.getUTCMonth() === datum.monat;
    });
    const treffer = exakt.length === 1 ? exakt[0] : monat.length === 1 ? monat[0] : null;
    if (treffer) {
      v.terminId = treffer.id;
      v.terminText = `${treffer.kennung || treffer.titel} (${deDatum(treffer.datum_start)})`;
      v.gruende.push(`${stichwort ? `${stichwort[0].toUpperCase()}${stichwort.slice(1)}, ` : ""}${deDatum(datum.start)}`);
      if (exakt.length !== 1) v.warnungen.push(`Im System steht ${treffer.kennung || "der Termin"} am ${deDatum(treffer.datum_start)}, laut Rechnung ab ${deDatum(datum.start)}`);
    } else if (exakt.length > 1 || monat.length > 1) {
      v.warnungen.push(`Mehrere Termine im ${MONATE[datum.monat]} ${datum.jahr} möglich – bitte wählen`);
    } else {
      const art = stichwort ? `${stichwort[0].toUpperCase()}${stichwort.slice(1)}` : "Seminar";
      v.warnungen.push(`Kein Termin „${art}“ im ${MONATE[datum.monat][0].toUpperCase()}${MONATE[datum.monat].slice(1)} ${datum.jahr} im System – ggf. erst anlegen`);
    }
  }

  // Option: erst Name aus dem Text ("Option: Shift", "Konferenz // Premium"),
  // dann Preis pro Person gegen alle Preisstufen der Optionen des Termins.
  const termin = termine.find((t) => t.id === v.terminId);
  if (termin && termin.optionen.length) {
    const lower = text.toLowerCase();
    const perName = termin.optionen.filter((o) => {
      const kern = o.titel.toLowerCase().replace(/^agencyuplifted\s+/, "");
      return kern.length > 2 && new RegExp(`\\b${kern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower);
    });
    const perPreis = v.preisProPerson
      ? termin.optionen.filter((o) => o.preise.some((p) => Math.abs(p - v.preisProPerson!) < 1))
      : [];
    // Gruppen- und Sonderpreise treffen keine Preisstufe exakt (7.440 € fuer
    // zwei = 3.720 € p. P.) -- dann die Option, in deren Preisspanne er liegt.
    const perSpanne = v.preisProPerson
      ? termin.optionen.filter((o) => o.preise.length && v.preisProPerson! >= Math.min(...o.preise) * 0.85 && v.preisProPerson! <= Math.max(...o.preise) * 1.05)
      : [];
    const option =
      perName.length === 1 ? perName[0] : perPreis.length === 1 ? perPreis[0] : perSpanne.length === 1 ? perSpanne[0] : null;
    if (option) {
      v.optionId = option.id;
      v.optionTitel = option.titel;
      v.gruende.push(
        perName.length === 1
          ? `Option „${option.titel}“ im Text`
          : perPreis.length === 1
            ? `${v.preisProPerson} € pro Person = Preisstufe von „${option.titel}“`
            : `${v.preisProPerson} € pro Person liegt im Preisbereich von „${option.titel}“ (ungefähr)`
      );
    } else if (v.preisProPerson) {
      v.warnungen.push(`Keine Option eindeutig (${v.preisProPerson} € pro Person)`);
    }
  }

  // Erste Person = Rechnungsempfaenger, wenn exakt so im System
  const vn = (rechnung.kunde_vorname || "").trim().toLowerCase();
  const nn = (rechnung.kunde_nachname || "").trim().toLowerCase();
  if (vn && nn) {
    const tn = teilnehmer.filter((t) => t.vorname.trim().toLowerCase() === vn && t.nachname.trim().toLowerCase() === nn);
    if (tn.length === 1) v.teilnehmerId = tn[0].id;
  }
  if (v.anzahl > 1) v.warnungen.push(`${v.anzahl - 1} weitere Person${v.anzahl > 2 ? "en" : ""} nicht namentlich auf der Rechnung – bitte ergänzen`);

  return v;
}
