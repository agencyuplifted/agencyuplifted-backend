import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { berlinHeute } from "@/lib/events";
import { INBOX_STATUS_GESCHLOSSEN } from "@/lib/inbox";
import { ladeFaelligkeiten } from "@/lib/wiedervorlage";
import FaelligZeile from "./FaelligZeile";

// Dashboard-Widget "Heute faellig / diese Woche". Fehler hier sollen das
// restliche Dashboard nicht mitreissen -- deshalb eigener try/catch.
export default async function FaelligWidget() {
  const heute = berlinHeute();
  let punkte;
  let unsortiert = 0;
  try {
    const [p, { count }] = await Promise.all([
      ladeFaelligkeiten({ bisTage: 6 }),
      getSupabaseAdmin()
        .from("inbox_eintraege")
        .select("id", { count: "exact", head: true })
        .is("typ", null)
        .not("status", "in", `(${INBOX_STATUS_GESCHLOSSEN.join(",")})`),
    ]);
    punkte = p;
    unsortiert = count || 0;
  } catch (e: any) {
    return <div className="au-card au-banner-error">Wiedervorlage konnte nicht geladen werden: {e.message}</div>;
  }

  const heuteOderFrueher = punkte.filter((p) => p.datum <= heute);
  const woche = punkte.filter((p) => p.datum > heute);

  return (
    <div className="au-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Heute fällig / diese Woche</h2>
        <span className="au-klein">
          <Link href="/wiedervorlage">Alle Wiedervorlagen →</Link>
          {unsortiert > 0 && <> · <Link href="/inbox?typ=unsortiert">{unsortiert} unsortierte Ideen</Link></>}
        </span>
      </div>
      {heuteOderFrueher.length > 0 && (
        <>
          <h4 className="au-event-h4" style={{ marginTop: "0.75rem" }}>Heute & überfällig</h4>
          {heuteOderFrueher.map((p) => <FaelligZeile key={p.art + p.id} p={p} heute={heute} />)}
        </>
      )}
      {woche.length > 0 && (
        <>
          <h4 className="au-event-h4" style={{ marginTop: "0.75rem" }}>Diese Woche</h4>
          {woche.map((p) => <FaelligZeile key={p.art + p.id} p={p} heute={heute} />)}
        </>
      )}
      {!punkte.length && <p className="au-leer" style={{ marginTop: "0.5rem" }}>Diese Woche ist nichts fällig.</p>}
    </div>
  );
}
