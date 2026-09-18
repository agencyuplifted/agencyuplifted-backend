// Regel-Baukasten fuer Kampagnen-Empfaenger (ohne Server-Abhaengigkeiten,
// wird auch im Browser vom RegelBuilder benutzt). Aufbau: Gruppen, die
// untereinander mit und/oder verknuepft sind; in jeder Gruppe Bedingungen,
// ebenfalls mit und/oder. Jede Bedingung kann mehrere Werte haben
// ("hat alle von", "mindestens eins", "keins", "fehlt mindestens eins").
// Zusammen mit "ist/ist nicht" laesst sich damit jede Und-/Oder-/Nicht-
// Kombination ausdruecken, z. B. (Preisfindung + #X) oder (Fokussierung ohne #Y).

export type RegelFeld =
  | "seminar_besucht"
  | "seminar_gebucht"
  | "seminar_termin"
  | "letztes_seminar_monate"
  | "tag"
  | "kampagne_bekommen"
  | "kampagne_geoeffnet"
  | "kampagne_geklickt"
  | "anzahl_seminare"
  | "teilnahme_stand"
  | "unternehmer_status"
  | "anrede"
  | "rolle"
  | "netzwerk";

export type RegelOperator = "alle" | "eine" | "keine" | "nicht_alle" | "ist" | "ist_nicht" | "min" | "max";

export type Verknuepfung = "und" | "oder";
export type Bedingung = { feld: RegelFeld; operator: RegelOperator; werte: string[] };
export type RegelGruppe = { verknuepfung: Verknuepfung; bedingungen: Bedingung[] };
export type Regeln = { verknuepfung: Verknuepfung; gruppen: RegelGruppe[] };

export type FeldDefinition = {
  label: string;
  art: "menge" | "merkmal" | "zahl" | "ja_nein";
  operatoren: { key: RegelOperator; label: string }[];
  /** feste Werte; dynamische (Seminarkategorien, Tags) kommen von der Seite */
  werte?: { key: string; label: string }[];
  quelle?: "seminartypen" | "tags" | "termine" | "kampagnen";
};

const MENGE_OPS: FeldDefinition["operatoren"] = [
  { key: "alle", label: "hat alle von" },
  { key: "eine", label: "hat mindestens eins von" },
  { key: "keine", label: "hat keins von" },
  { key: "nicht_alle", label: "fehlt mindestens eins von" },
];
const MERKMAL_OPS: FeldDefinition["operatoren"] = [
  { key: "ist", label: "ist" },
  { key: "ist_nicht", label: "ist nicht" },
];

export const FELDER: Record<RegelFeld, FeldDefinition> = {
  seminar_besucht: { label: "Seminar besucht", art: "menge", operatoren: MENGE_OPS, quelle: "seminartypen" },
  seminar_gebucht: { label: "Seminar gebucht (kommt noch)", art: "menge", operatoren: MENGE_OPS, quelle: "seminartypen" },
  seminar_termin: { label: "Seminartermin (gebucht/dabei)", art: "menge", operatoren: MENGE_OPS, quelle: "termine" },
  letztes_seminar_monate: {
    label: "Letztes Seminar",
    art: "zahl",
    operatoren: [
      { key: "min", label: "vor mindestens … Monaten" },
      { key: "max", label: "vor höchstens … Monaten" },
    ],
  },
  tag: { label: "Tag", art: "menge", operatoren: MENGE_OPS, quelle: "tags" },
  kampagne_bekommen: { label: "Kampagne bekommen", art: "menge", operatoren: MENGE_OPS, quelle: "kampagnen" },
  kampagne_geoeffnet: { label: "Kampagne geöffnet", art: "menge", operatoren: MENGE_OPS, quelle: "kampagnen" },
  kampagne_geklickt: { label: "Kampagne geklickt", art: "menge", operatoren: MENGE_OPS, quelle: "kampagnen" },
  anzahl_seminare: {
    label: "Anzahl besuchter Seminare",
    art: "zahl",
    operatoren: [
      { key: "min", label: "mindestens" },
      { key: "max", label: "höchstens" },
    ],
  },
  teilnahme_stand: {
    label: "Teilnahme-Stand",
    art: "merkmal",
    operatoren: MERKMAL_OPS,
    werte: [
      { key: "erstteilnehmer", label: "Erstteilnehmer" },
      { key: "wiederholer", label: "Wiederholer" },
      { key: "kein_seminar_besucht", label: "Kein Seminar besucht" },
    ],
  },
  unternehmer_status: {
    label: "Position",
    art: "merkmal",
    operatoren: MERKMAL_OPS,
    werte: [
      { key: "unternehmer", label: "Unternehmer:in" },
      { key: "mitarbeiter", label: "Mitarbeiter:in" },
      { key: "unbekannt", label: "Ohne Angabe" },
    ],
  },
  anrede: {
    label: "Geschlecht",
    art: "merkmal",
    operatoren: MERKMAL_OPS,
    werte: [
      { key: "Frau", label: "Frauen" },
      { key: "Herr", label: "Männer" },
      { key: "Divers", label: "Divers" },
      { key: "keine_angabe", label: "Ohne Angabe" },
    ],
  },
  rolle: {
    label: "Rolle beim Seminar",
    art: "merkmal",
    operatoren: MERKMAL_OPS,
    werte: [
      { key: "teilnehmer", label: "Teilnehmer" },
      { key: "mitarbeiter", label: "Mitarbeiter" },
      { key: "gastreferent", label: "Gastreferent" },
      { key: "organisator", label: "Organisator" },
    ],
  },
  netzwerk: {
    label: "Netzwerk-Mitglied",
    art: "ja_nein",
    operatoren: [{ key: "ist", label: "ist" }],
    werte: [
      { key: "ja", label: "ja" },
      { key: "nein", label: "nein" },
    ],
  },
};

export const LEERE_GRUPPE: RegelGruppe = { verknuepfung: "und", bedingungen: [] };
export const LEERE_REGELN: Regeln = { verknuepfung: "oder", gruppen: [LEERE_GRUPPE] };

export function standardBedingung(feld: RegelFeld): Bedingung {
  const def = FELDER[feld];
  return {
    feld,
    operator: def.operatoren[0].key,
    werte: def.art === "zahl" ? [feld === "letztes_seminar_monate" ? "12" : "2"] : def.art === "ja_nein" ? ["ja"] : [],
  };
}

/** Bedingungen ohne Werte zaehlen nicht (z. B. frisch hinzugefuegte Zeile) */
export function wirksameBedingungen(gruppe: RegelGruppe | undefined | null): Bedingung[] {
  return (gruppe?.bedingungen || []).filter((b) => FELDER[b.feld] && b.werte.some((w) => w !== ""));
}

/** Nur Gruppen mit mindestens einer wirksamen Bedingung, ohne leere Zeilen */
export function wirksameRegeln(regeln: Regeln | null | undefined): Regeln {
  const gruppen = (regeln?.gruppen || [])
    .map((g) => ({ verknuepfung: g.verknuepfung, bedingungen: wirksameBedingungen(g) }))
    .filter((g) => g.bedingungen.length);
  return { verknuepfung: regeln?.verknuepfung || "oder", gruppen };
}

/** Wertet die Regeln fuer eine Person aus; `pruefe` beantwortet eine einzelne Bedingung. */
export function regelnErfuellt(regeln: Regeln, pruefe: (b: Bedingung) => boolean): boolean {
  const w = wirksameRegeln(regeln);
  if (!w.gruppen.length) return true;
  const gruppeOk = (g: RegelGruppe) => (g.verknuepfung === "oder" ? g.bedingungen.some(pruefe) : g.bedingungen.every(pruefe));
  return w.verknuepfung === "oder" ? w.gruppen.some(gruppeOk) : w.gruppen.every(gruppeOk);
}

function parseBedingungen(liste: unknown): Bedingung[] {
  if (!Array.isArray(liste)) return [];
  return liste
    .filter((b: any) => b && FELDER[b.feld as RegelFeld])
    .slice(0, 20)
    .map((b: any) => ({
      feld: b.feld,
      operator: FELDER[b.feld as RegelFeld].operatoren.some((o) => o.key === b.operator) ? b.operator : FELDER[b.feld as RegelFeld].operatoren[0].key,
      werte: Array.isArray(b.werte) ? b.werte.map(String).slice(0, 50) : [],
    }));
}

export function parseRegeln(wert: unknown): Regeln | null {
  try {
    const r: any = typeof wert === "string" ? JSON.parse(wert) : wert;
    if (!r) return null;
    const verkn = (v: any): Verknuepfung => (v === "oder" ? "oder" : "und");
    // Flache Fassung (nur bedingungen) = eine Gruppe
    if (Array.isArray(r.bedingungen)) {
      return { verknuepfung: "oder", gruppen: [{ verknuepfung: verkn(r.verknuepfung), bedingungen: parseBedingungen(r.bedingungen) }] };
    }
    if (!Array.isArray(r.gruppen)) return null;
    return {
      verknuepfung: verkn(r.verknuepfung),
      gruppen: r.gruppen.slice(0, 10).map((g: any) => ({ verknuepfung: verkn(g?.verknuepfung), bedingungen: parseBedingungen(g?.bedingungen) })),
    };
  } catch {
    return null;
  }
}

/** Kurztext einer Bedingung, z. B. "Seminar besucht: Preisfindung + Fokussierung" */
export function beschreibeBedingung(b: Bedingung, wertLabel: (feld: RegelFeld, wert: string) => string): string {
  const def = FELDER[b.feld];
  const werte = b.werte.map((w) => wertLabel(b.feld, w));
  if (b.feld === "letztes_seminar_monate") return `Letztes Seminar vor ${b.operator === "min" ? "≥" : "≤"} ${werte[0]} Mon.`;
  if (def.art === "zahl") return `${def.label} ${b.operator === "min" ? "≥" : "≤"} ${werte[0]}`;
  if (def.art === "ja_nein") return b.werte[0] === "ja" ? `${def.label}` : `kein ${def.label}`;
  const praefix = b.feld === "tag" ? "#" : "";
  const liste = werte.map((w) => praefix + w);
  switch (b.operator) {
    case "alle":
      return `${def.label}: ${liste.join(" + ")}`;
    case "eine":
      return `${def.label}: ${liste.join(" oder ")}`;
    case "keine":
      return `${def.label}: nicht ${liste.join(", nicht ")}`;
    case "nicht_alle":
      return `${def.label}: nicht ${liste.join(" oder nicht ")}`;
    case "ist_nicht":
      return `${def.label} nicht ${liste.join("/")}`;
    default:
      return liste.join("/");
  }
}
