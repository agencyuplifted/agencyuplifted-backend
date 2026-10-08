import { getSupabaseAdmin } from "./supabase";
import { ladeOeffentlicheTerminListe, ladeOeffentlichenTermin } from "./public-seminartermine";

// Taeglicher Abzug der oeffentlichen Termin-API in onepage_fallback_snapshot.
//
// Warum: Die Onepage-Sektionen holen ihre Daten erst client-seitig und erst,
// wenn die Sektion in den Sichtbereich scrollt. Kommt der Abruf nicht durch,
// bleiben die im Editor gespeicherten Werte stehen -- und die waren in der
// Vergangenheit wochenlang veraltet (geloeschte Termine im Katalog, Preise
// eines fremden Seminars auf einer duplizierten Seite). Der Snapshot ist die
// Quelle, aus der diese statischen Werte kuenftig befuellt werden: eine
// Momentaufnahme dessen, was die API genau jetzt liefert.
//
// Geschrieben wird mit dem Service-Role-Client: auf onepage_fallback_snapshot
// ist RLS aktiv und es gibt keine Policies.

export type SnapshotErgebnis = {
  seminartypen: number;
  geschrieben: number;
  katalog_termine: number | null;
  fehler: string[];
};

/**
 * Ungefilterte Gesamtliste in onepage_katalog_snapshot (genau eine Zeile,
 * id = 1). Das ist die Quelle fuer den Seminar-Katalog auf /seminare, der
 * alle Kategorien zusammen zeigt -- derselbe Inhalt, den
 * GET /api/public/seminartermine ohne seminartyp_id-Filter liefert.
 */
export async function schreibeKatalogSnapshot(quelle: string): Promise<{ anzahl: number | null; fehler: string | null }> {
  const supabase = getSupabaseAdmin();
  const liste = await ladeOeffentlicheTerminListe(supabase, null);
  if ("fehler" in liste) return { anzahl: null, fehler: `katalog: ${liste.fehler}` };

  const { error } = await supabase
    .from("onepage_katalog_snapshot")
    .upsert({ id: 1, liste, erzeugt_am: new Date().toISOString(), quelle }, { onConflict: "id" });
  return { anzahl: error ? null : liste.termine.length, fehler: error ? `katalog: ${error.message}` : null };
}

/**
 * Schreibt den Snapshot fuer einen Seminartyp. Liefert eine Fehlermeldung
 * zurueck statt zu werfen -- die Aufrufer sind teils fire-and-forget.
 */
export async function schreibeFallbackSnapshot(seminartypId: string, quelle: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const liste = await ladeOeffentlicheTerminListe(supabase, [seminartypId]);
  if ("fehler" in liste) return `${seminartypId}: ${liste.fehler}`;

  // Der erste Eintrag ist der chronologisch naechste Termin -- genau der, den
  // eine Seite ohne ?termin=-Parameter anzeigt. Bewusst NICHT der naechste
  // buchbare: Der Snapshot bildet die API ab, nicht die Auswahl-Logik der
  // Sektionen. Welcher Termin vorausgewaehlt wird, entscheidet weiterhin der
  // termin-resolver auf Onepage anhand von buchbar.
  const ersterTermin = liste.termine[0] || null;
  const detail = ersterTermin ? await ladeOeffentlichenTermin(supabase, ersterTermin.id) : null;

  const { error } = await supabase.from("onepage_fallback_snapshot").upsert(
    {
      seminartyp_id: seminartypId,
      liste,
      naechster_termin: detail,
      erzeugt_am: new Date().toISOString(),
      quelle,
    },
    { onConflict: "seminartyp_id" }
  );
  return error ? `${seminartypId}: ${error.message}` : null;
}

/** Snapshot fuer alle Seminartypen -- der Cron-Lauf. */
export async function schreibeAlleFallbackSnapshots(quelle = "backend-cron"): Promise<SnapshotErgebnis> {
  const supabase = getSupabaseAdmin();
  const { data: typen, error } = await supabase.from("seminartypen").select("id");
  if (error) return { seminartypen: 0, geschrieben: 0, katalog_termine: null, fehler: [error.message] };

  const fehler: string[] = [];
  let geschrieben = 0;
  for (const typ of typen || []) {
    const problem = await schreibeFallbackSnapshot(typ.id, quelle);
    if (problem) fehler.push(problem);
    else geschrieben += 1;
  }
  const katalog = await schreibeKatalogSnapshot(quelle);
  if (katalog.fehler) fehler.push(katalog.fehler);
  return { seminartypen: (typen || []).length, geschrieben, katalog_termine: katalog.anzahl, fehler };
}

/**
 * Nach einer Aenderung in Backstage den betroffenen Snapshot nachziehen,
 * damit er tagsueber nicht veraltet. Bewusst ohne await aufrufbar: Die
 * Backstage-Aktion soll nicht langsamer werden oder gar fehlschlagen, nur
 * weil der Snapshot klemmt -- der naechtliche Cron holt es ohnehin nach.
 */
export async function aktualisiereSnapshotNachAenderung(
  seminartypId: string | null | undefined,
  quelle = "backstage"
): Promise<void> {
  if (!seminartypId) return;
  // Bewusst awaited statt echtem fire-and-forget: Nach dem redirect() einer
  // Server Action friert die Serverless-Funktion ein, nicht abgewartete
  // Promises laufen dann nicht zu Ende und der Snapshot bliebe still stehen.
  // Fehler werden hier geschluckt -- eine klemmende Momentaufnahme darf die
  // Speichern-Aktion in Backstage nie scheitern lassen, der naechtliche Cron
  // holt es nach.
  try {
    const problem = await schreibeFallbackSnapshot(seminartypId, quelle);
    if (problem) console.error("Fallback-Snapshot nicht aktualisiert:", problem);
    const katalog = await schreibeKatalogSnapshot(quelle);
    if (katalog.fehler) console.error("Katalog-Snapshot nicht aktualisiert:", katalog.fehler);
  } catch (e: any) {
    console.error("Snapshot nicht aktualisiert:", e?.message);
  }
}

/** Seminartyp eines Termins -- fuer Aktionen, die nur die Termin-ID kennen. */
export async function seminartypIdZuTermin(seminarterminId: string | null | undefined): Promise<string | null> {
  if (!seminarterminId) return null;
  const { data } = await getSupabaseAdmin()
    .from("seminartermine")
    .select("seminartyp_id")
    .eq("id", seminarterminId)
    .maybeSingle();
  return data?.seminartyp_id || null;
}

/** Seminartyp einer Option -- fuer Options-/Preisstaffel-Aktionen. */
export async function seminartypIdZuOption(optionId: string | null | undefined): Promise<string | null> {
  if (!optionId) return null;
  const { data } = await getSupabaseAdmin()
    .from("seminartermin_optionen")
    .select("seminartermine(seminartyp_id)")
    .eq("id", optionId)
    .maybeSingle();
  return (data as any)?.seminartermine?.seminartyp_id || null;
}
