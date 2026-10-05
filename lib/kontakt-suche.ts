// Gemeinsame "gibt es diesen Kontakt schon?"-Abfragen. Vorher hatte jeder
// Pfad (oeffentliche Buchungsstrecken, Teilnehmer-Formular, Termin-Teilnehmer,
// FastBill-Zuordnung) seine eigene Variante -- und jede Variante, die den
// Abgleich vergass oder falsch machte, hat Dubletten erzeugt: Ronny Ullrich
// (12.09.2026, FastBill-Zuordnung ohne Abgleich) und markus@agencyuplifted.de
// (03.08.2026, Teilnehmer-Formular ohne Abgleich).

// % und _ muessen im ilike-Muster maskiert werden, sonst ist die Eingabe ein
// Suchmuster und nicht der gesuchte Wert: "max_m@x.de" traf vorher auch
// "maxXm@x.de". Leerzeichen am Rand fallen weg, die entstehen beim Tippen
// bzw. Kopieren und stehen so nicht in der Spalte.
export function ilikeExakt(wert: string): string {
  return wert.trim().replace(/[\\%_]/g, (zeichen) => "\\" + zeichen);
}

// Immer der aelteste Treffer: Frueher stand hier .maybeSingle() ohne Limit --
// gab es (wie bei den beiden Faellen oben) schon zwei Datensaetze mit derselben
// E-Mail, lieferte das einen Fehler statt eines Treffers, und der Aufrufer legte
// einen weiteren an. Die Sortierung macht die Auswahl ausserdem
// nachvollziehbar: es gewinnt immer der zuerst angelegte Datensatz, an dem in
// der Regel Login, Verknuepfungen und Historie haengen.
export async function findeTeilnehmerPerEmail(
  supabase: any,
  email: string,
  spalten = "id, vorname, nachname"
): Promise<any | null> {
  const wert = email.trim();
  if (!wert) return null;
  const { data } = await supabase
    .from("teilnehmer")
    .select(spalten)
    .ilike("email", ilikeExakt(wert))
    .order("erstellt_am", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Organisationen haben bewusst keinen Unique-Index auf dem Namen -- zwei
// verschiedene Firmen koennen legitim gleich heissen. Hier zaehlt nur, dass
// die Buchungsstrecke bei mehreren Gleichnamigen nicht noch eine anlegt.
export async function findeOrganisationPerName(
  supabase: any,
  name: string,
  spalten = "id, name"
): Promise<any | null> {
  const wert = name.trim();
  if (!wert) return null;
  const { data } = await supabase
    .from("organisationen")
    .select(spalten)
    .ilike("name", ilikeExakt(wert))
    .order("erstellt_am", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Postgres-Code fuer "unique constraint verletzt". Greift beim Anlegen eines
// Teilnehmers, sobald der Unique-Index auf lower(trim(email)) steht
// (teilnehmer_email_eindeutig): dann faengt die Datenbank ab, dass zwischen
// Abgleich und Insert ein zweiter Vorgang dieselbe E-Mail angelegt hat -- zwei
// parallele Buchungen derselben Person. Ohne den Index ist dieser Zweig nie
// aktiv, der Abgleich oben bleibt also die erste Instanz.
export const UNIQUE_VERSTOSS = "23505";
