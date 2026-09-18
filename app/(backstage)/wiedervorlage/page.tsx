export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { speichereAufgabe } from "@/lib/actions";
import { berlinHeute, tagPlus } from "@/lib/events";
import { ladeFaelligkeiten, type FaelligerPunkt } from "@/lib/wiedervorlage";
import AktionsFormular from "../AktionsFormular";
import AufgabeZeile from "./AufgabeZeile";
import FaelligZeile from "./FaelligZeile";

function Gruppe({ titel, punkte, heute }: { titel: string; punkte: FaelligerPunkt[]; heute: string }) {
  if (!punkte.length) return null;
  return (
    <div className="au-card">
      <h3 style={{ marginTop: 0 }}>{titel} <span className="au-badge au-badge-neutral">{punkte.length}</span></h3>
      {punkte.map((p) => (
        <FaelligZeile key={p.art + p.id} p={p} heute={heute} />
      ))}
    </div>
  );
}

export default async function WiedervorlagePage() {
  const heute = berlinHeute();
  const wochenende = tagPlus(heute, 6);
  const supabase = getSupabaseAdmin();
  const [punkte, { data: ohneTermin }] = await Promise.all([
    ladeFaelligkeiten({ bisTage: 30, cfpTage: 90 }),
    supabase
      .from("aufgaben")
      .select("id, titel, faellig_am, erledigt_am, notizen, event_ausgaben(id, jahr, event_reihen(id, name)), kontakte(name)")
      .is("erledigt_am", null)
      .is("archiviert_am", null)
      .is("faellig_am", null)
      .order("erstellt_am"),
  ]);

  const ueberfaellig = punkte.filter((p) => p.ueberfaellig);
  const heuteFaellig = punkte.filter((p) => !p.ueberfaellig && p.datum === heute);
  const woche = punkte.filter((p) => p.datum > heute && p.datum <= wochenende);
  const spaeter = punkte.filter((p) => p.datum > wochenende && (p.art !== "cfp" || p.datum <= tagPlus(heute, 30)));
  const cfpSpaeter = punkte.filter((p) => p.art === "cfp" && p.datum > tagPlus(heute, 30));

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
        <h1>Wiedervorlage</h1>
        <Link href="/wiedervorlage/einstellungen" className="au-btn au-btn-secondary au-btn-sm">⚙︎ Erinnerungen &amp; Kalender</Link>
      </div>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Fällige Aufgaben, Inbox-Wiedervorlagen, Events und CfP-Deadlines (CfP 90 Tage im Voraus).
      </p>

      <Gruppe titel="Überfällig" punkte={ueberfaellig} heute={heute} />
      <Gruppe titel="Heute" punkte={heuteFaellig} heute={heute} />
      <Gruppe titel="Diese Woche" punkte={woche} heute={heute} />
      <Gruppe titel="Nächste 30 Tage" punkte={spaeter} heute={heute} />
      <Gruppe titel="CfP-Deadlines (nächste 90 Tage)" punkte={cfpSpaeter} heute={heute} />
      {!punkte.length && <div className="au-card au-leer">Nichts fällig in den nächsten 30 Tagen. 🎉</div>}

      <div className="au-card">
        <h3 style={{ marginTop: 0 }}>Aufgaben ohne Termin <span className="au-badge au-badge-neutral">{ohneTermin?.length || 0}</span></h3>
        {(ohneTermin || []).map((a: any) => (
          <AufgabeZeile
            key={a.id}
            aufgabe={a}
            heute={heute}
            reiheId={a.event_ausgaben?.event_reihen?.id}
            kontext={a.event_ausgaben ? <Link href={`/events/${a.event_ausgaben.event_reihen.id}#ausgabe-${a.event_ausgaben.id}`}>{a.event_ausgaben.event_reihen.name} {a.event_ausgaben.jahr}</Link> : a.kontakte?.name}
          />
        ))}
        {!ohneTermin?.length && <p className="au-leer">Keine.</p>}
        <AktionsFormular action={speichereAufgabe} zuruecksetzen className="au-inline-form" style={{ marginTop: "0.75rem" }}>
          <input className="au-input" name="titel" placeholder="Neue Aufgabe (ohne Bezug)" required />
          <input className="au-input" name="faellig_am" type="date" aria-label="fällig am" />
          <button type="submit" className="au-btn au-btn-secondary au-btn-sm">+ Aufgabe</button>
        </AktionsFormular>
      </div>
    </main>
  );
}
