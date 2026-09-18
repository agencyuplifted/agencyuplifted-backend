"use client";

import { useState } from "react";
import type { VorlagenAktionsErgebnis } from "@/lib/actions";
import type { Erinnerung } from "@/lib/erinnerungen";
import AktionsFormular from "../../AktionsFormular";

const FREQUENZ_OPTIONEN: [Erinnerung["frequenz"], string][] = [
  ["taeglich", "täglich"],
  ["werktags", "werktags (Mo–Fr)"],
  ["woechentlich", "wöchentlich"],
  ["monatlich", "monatlich"],
];
const WOCHENTAGE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

function Haken({ name, label, an }: { name: string; label: string; an: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.9rem", marginBottom: "0.35rem" }}>
      <input type="checkbox" name={name} defaultChecked={an} /> {label}
    </label>
  );
}

// Formular fuer eine Erinnerung; Wochentag/Monatstag nur sichtbar, wenn die
// Frequenz sie braucht.
export default function ErinnerungFormular({
  e,
  speichernAction,
}: {
  e: Partial<Erinnerung>;
  speichernAction: (fd: FormData) => Promise<VorlagenAktionsErgebnis>;
}) {
  const [frequenz, setFrequenz] = useState<Erinnerung["frequenz"]>(e.frequenz || "taeglich");
  return (
    <AktionsFormular action={speichernAction} zuruecksetzen={!e.id} className="au-formgrid">
      {e.id && <input type="hidden" name="id" value={e.id} />}
      <div><label className="au-label">Name</label><input className="au-input" name="name" defaultValue={e.name || ""} required placeholder="z. B. Freitags-Check" /></div>
      <div style={{ gridColumn: "span 2" }}>
        <label className="au-label">Empfänger (mehrere mit Komma)</label>
        <input className="au-input" name="empfaenger" defaultValue={(e.empfaenger || []).join(", ")} placeholder="markus@agencyuplifted.de" />
      </div>
      <div>
        <label className="au-label">Wie oft</label>
        <select className="au-select" name="frequenz" value={frequenz} onChange={(ev) => setFrequenz(ev.target.value as Erinnerung["frequenz"])}>
          {FREQUENZ_OPTIONEN.map(([w, l]) => <option key={w} value={w}>{l}</option>)}
        </select>
      </div>
      {frequenz === "woechentlich" && (
        <div>
          <label className="au-label">Wochentag</label>
          <select className="au-select" name="wochentag" defaultValue={e.wochentag || 1}>
            {WOCHENTAGE.map((t, i) => <option key={t} value={i + 1}>{t}</option>)}
          </select>
        </div>
      )}
      {frequenz === "monatlich" && (
        <div>
          <label className="au-label">Am Monatstag</label>
          <select className="au-select" name="monatstag" defaultValue={e.monatstag || 1}>
            {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}.</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="au-label">Vorschau (Tage)</label>
        <input className="au-input" name="vorschau_tage" type="number" min={0} max={60} defaultValue={e.vorschau_tage ?? 0} title="0 = nur heute und Überfälliges" />
      </div>
      <div>
        <label className="au-label">CfP-Vorschau (Tage)</label>
        <input className="au-input" name="cfp_vorschau_tage" type="number" min={0} max={365} defaultValue={e.cfp_vorschau_tage ?? 90} />
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: "0 1.5rem", marginBottom: "0.5rem" }}>
        <Haken name="mit_aufgaben" label="Aufgaben" an={e.mit_aufgaben ?? true} />
        <Haken name="mit_wiedervorlagen" label="Inbox-Wiedervorlagen" an={e.mit_wiedervorlagen ?? true} />
        <Haken name="mit_events" label="Events" an={e.mit_events ?? true} />
        <Haken name="mit_cfp" label="CfP-Deadlines" an={e.mit_cfp ?? true} />
        <Haken name="mit_unsortiert" label="Unsortierte Ideen" an={e.mit_unsortiert ?? false} />
        <Haken name="nur_wenn_inhalt" label="Nur senden, wenn etwas ansteht" an={e.nur_wenn_inhalt ?? true} />
        <Haken name="aktiv" label="Aktiv" an={e.aktiv ?? false} />
      </div>
      <div><button type="submit" className="au-btn au-btn-primary au-btn-sm">{e.id ? "Speichern" : "Anlegen"}</button></div>
    </AktionsFormular>
  );
}
