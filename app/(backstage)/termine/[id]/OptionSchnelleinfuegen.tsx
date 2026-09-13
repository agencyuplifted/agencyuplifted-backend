"use client";

import { useState } from "react";
import { parseSchnelleinfuegenText, GeparsteOption } from "@/lib/schnelleinfuegen";
import KopierePromptLink from "./KopierePromptLink";

// "Schnelleinfuegen" beim BEARBEITEN einer bestehenden Option. Anders als
// beim Neuanlegen (siehe NeueOptionSchnelleinfuegen.tsx) existieren Features
// hier schon als eigene, einzeln gespeicherte Zeilen -- es gibt kein
// "entwurfsweise befuellt, aber noch nicht gespeichert"-Feld dafuer. Deshalb
// ruft "Uebernehmen" die Server Action direkt auf (nicht ueber ein
// verschachteltes <form>, das waere ungueltiges HTML innerhalb des
// umgebenden "Option bearbeiten"-Formulars) und ersetzt Titel, Beschreibung
// und alle Features atomar; danach laedt die Seite (revalidatePath in der
// Action) automatisch mit dem neuen Inhalt in Titel-Feld, Beschreibungsfeld
// und Features-Liste neu -- ganz normal weiter editierbar.
export default function OptionSchnelleinfuegen({
  seminarterminOptionId,
  seminarterminId,
  titelAktuell,
  beschreibungAktuell,
  featuresAnzahlAktuell,
  uebernehmenAction,
}: {
  seminarterminOptionId: string;
  seminarterminId: string;
  titelAktuell: string;
  beschreibungAktuell: string;
  featuresAnzahlAktuell: number;
  uebernehmenAction: (formData: FormData) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [laedt, setLaedt] = useState(false);
  // Ausstehende Ersetzung, die noch bestaetigt werden muss (siehe
  // starteUebernahme) -- statt window.confirm(), das manche Browser (v.a.
  // Chrome) nach ein paar Dialogen auf derselben Seite stillschweigend
  // unterdruecken: der Aufruf gibt dann sofort "false" zurueck, OHNE
  // ueberhaupt einen Dialog zu zeigen. Fuer Markus sah das so aus, als wuerde
  // "Uebernehmen" bei einer bereits befuellten Option einfach gar nichts tun.
  // Eine im Seitenlayout sichtbare Bestaetigung kann so nicht unterdrueckt
  // werden.
  const [ausstehend, setAusstehend] = useState<GeparsteOption | null>(null);

  function starteUebernahme() {
    const geparst = parseSchnelleinfuegenText(text);
    if (!geparst) {
      window.alert(
        'Der eingefügte Text entspricht nicht dem erwarteten Format: erste Zeile = Titel, danach ein Beschreibungsabsatz, danach mindestens eine Zeile mit "-" als Feature.'
      );
      return;
    }

    const hatBestehendenInhalt = !!(titelAktuell.trim() || beschreibungAktuell.trim() || featuresAnzahlAktuell > 0);
    if (hatBestehendenInhalt) {
      setAusstehend(geparst);
      return;
    }
    fuehreUebernahmeAus(geparst);
  }

  async function fuehreUebernahmeAus(geparst: GeparsteOption) {
    const formData = new FormData();
    formData.set("seminartermin_option_id", seminarterminOptionId);
    formData.set("seminartermin_id", seminarterminId);
    formData.set("titel", geparst.titel);
    formData.set("beschreibung", geparst.beschreibung);
    formData.set("features_text", JSON.stringify(geparst.features));
    if (geparst.introLabel) formData.set("intro_label", geparst.introLabel);

    setLaedt(true);
    try {
      await uebernehmenAction(formData);
      setText("");
      setAusstehend(null);
    } catch (e: any) {
      window.alert(`Übernehmen fehlgeschlagen: ${e?.message || "unbekannter Fehler"}`);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div style={{ background: "#f7f7f7", borderRadius: "var(--radius-sm)", padding: "0.6rem", marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
        <label className="au-label" style={{ margin: 0 }}>Schnelleinfügen (ersetzt Titel/Beschreibung/Features)</label>
        <KopierePromptLink />
      </div>
      <textarea
        className="au-textarea"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"Business\nDer gewinnwirksame Weg zu wert- und gewinnorientierter Preisfindung ...\n- Seminar inklusive drei **Übernachtungen** im Einzelzimmer mit Frühstück\n- ..."}
      />
      {ausstehend ? (
        <div style={{ background: "#fdf3e2", border: "1px solid #f2ddb0", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.65rem" }}>
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
            Bestehender Inhalt („{titelAktuell || "ohne Titel"}“{featuresAnzahlAktuell ? `, ${featuresAnzahlAktuell} Feature(s)` : ""}) wird durch „{ausstehend.titel}“ ({ausstehend.features.length} Feature(s)) ersetzt.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="au-btn au-btn-primary au-btn-sm" onClick={() => fuehreUebernahmeAus(ausstehend)} disabled={laedt}>
              {laedt ? "Wird übernommen …" : "Ja, ersetzen"}
            </button>
            <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={() => setAusstehend(null)} disabled={laedt}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="au-btn au-btn-secondary au-btn-sm" onClick={starteUebernahme} disabled={laedt}>
          {laedt ? "Wird übernommen …" : "Übernehmen"}
        </button>
      )}
    </div>
  );
}
