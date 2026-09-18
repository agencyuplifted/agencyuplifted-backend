// Modul "Ideen & Wiedervorlage" -- Phase 1: Inbox (Tabellen inbox_eintraege,
// themencluster, inbox_eintrag_cluster). Die Werte hier muessen zu den
// CHECK-Constraints der Migration inbox_phase1 passen.

export const INBOX_TYPEN = ["idee", "thema", "event", "lead", "aufgabe"] as const;
export type InboxTyp = (typeof INBOX_TYPEN)[number];
export const INBOX_TYP_LABEL: Record<InboxTyp, string> = {
  idee: "Idee",
  thema: "Thema",
  event: "Event",
  lead: "Lead",
  aufgabe: "Aufgabe",
};

export const INBOX_BEREICHE = ["website", "seminare", "marketing", "vertrieb", "sonstiges"] as const;
export type InboxBereich = (typeof INBOX_BEREICHE)[number];
export const INBOX_BEREICH_LABEL: Record<InboxBereich, string> = {
  website: "Website",
  seminare: "Seminare",
  marketing: "Marketing",
  vertrieb: "Vertrieb",
  sonstiges: "Sonstiges",
};

export const INBOX_FORMATE = ["seminar", "workshop", "linkedin_post", "newsletter", "webinar", "talk_abstract", "lead_magnet"] as const;
export type InboxFormat = (typeof INBOX_FORMATE)[number];
export const INBOX_FORMAT_LABEL: Record<InboxFormat, string> = {
  seminar: "Seminar",
  workshop: "Workshop",
  linkedin_post: "LinkedIn-Post",
  newsletter: "Newsletter",
  webinar: "Webinar",
  talk_abstract: "Talk-Abstract",
  lead_magnet: "Lead-Magnet",
};

export const INBOX_STATUS = ["neu", "geprueft", "geplant", "in_arbeit", "erledigt", "verworfen", "archiviert"] as const;
export type InboxStatus = (typeof INBOX_STATUS)[number];
export const INBOX_STATUS_LABEL: Record<InboxStatus, string> = {
  neu: "Neu",
  geprueft: "Geprüft",
  geplant: "Geplant",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
  verworfen: "Verworfen",
  archiviert: "Archiviert",
};
// Standardansicht blendet diese aus -- "nichts loeschen" heisst, dass sie
// ueber den Status-Filter jederzeit wieder sichtbar sind.
export const INBOX_STATUS_GESCHLOSSEN: InboxStatus[] = ["erledigt", "verworfen", "archiviert"];

export const INBOX_QUELLEN = ["watch", "iphone", "chat", "backstage", "import"] as const;
export type InboxQuelle = (typeof INBOX_QUELLEN)[number];
export const INBOX_QUELLE_LABEL: Record<InboxQuelle, string> = {
  watch: "Apple Watch",
  iphone: "iPhone",
  chat: "Chat",
  backstage: "Backstage",
  import: "Import",
};

export const INBOX_TEXT_MAX = 5000;

export type Themencluster = { id: string; name: string; beschreibung: string | null; sortierung: number; archiviert_am: string | null };

export type InboxEintrag = {
  id: string;
  text: string;
  titel: string | null;
  typ: InboxTyp | null;
  bereiche: InboxBereich[];
  formate: InboxFormat[];
  status: InboxStatus;
  ist_fokus: boolean;
  wiedervorlage_am: string | null;
  quelle: InboxQuelle;
  via_api: boolean;
  notizen: string | null;
  themen_radar_idee_id: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
  cluster_ids: string[];
};

// Nur bekannte Werte durchlassen -- schuetzt vor CHECK-Verletzungen durch
// manipulierte Formulare und haelt Fehlermeldungen verstaendlich.
export function nurErlaubte<T extends string>(werte: unknown[], erlaubt: readonly T[]): T[] {
  return Array.from(new Set(werte.map(String).filter((w): w is T => (erlaubt as readonly string[]).includes(w))));
}
