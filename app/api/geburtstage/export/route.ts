export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { ladeAnstehendeGeburtstage, ladeAlleGeburtstage, gruppiereNachMonat, QUARTALE } from "@/lib/geburtstage";
import { formatDatum } from "@/lib/format";

// CSV-Export fuer den postalischen Geburtstagsversand (Serienbrief/Etiketten)
// -- deckt sich mit den Filtern der /geburtstage-Seite (Vorlauf-Fenster oder
// Monat/Quartal aus der Kalenderansicht), damit "was ich auf dem Bildschirm
// sehe" auch "was ich exportiere" ist. Steht wie alle anderen Backstage-Seiten
// hinter der Login-Middleware (siehe middleware.ts).
function zuCsvZeile(werte: (string | null)[]) {
  return werte
    .map((w) => `"${(w || "").replace(/"/g, '""')}"`)
    .join(";");
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ansicht = params.get("ansicht") === "kalender" ? "kalender" : "vorlauf";

  let eintraege;
  let dateiname = "geburtstage.csv";

  if (ansicht === "kalender") {
    const alle = await ladeAlleGeburtstage();
    const monatParam = params.get("monat");
    const quartalParam = params.get("quartal");
    if (monatParam) {
      const monat = Number(monatParam);
      eintraege = alle.filter((e) => e.geburtsMonat === monat);
      dateiname = `geburtstage-monat-${monat}.csv`;
    } else if (quartalParam) {
      const quartal = QUARTALE.find((q) => q.key === Number(quartalParam));
      eintraege = alle.filter((e) => quartal?.monate.includes(e.geburtsMonat));
      dateiname = `geburtstage-q${quartalParam}.csv`;
    } else {
      eintraege = alle;
    }
  } else {
    const tage = Number(params.get("tage") || 30);
    eintraege = await ladeAnstehendeGeburtstage(tage);
    dateiname = `geburtstage-naechste-${tage}-tage.csv`;
  }

  const kopf = zuCsvZeile(["Name", "Firma", "Straße", "PLZ", "Ort", "Land", "Geburtstag", "Quelle", "E-Mail"]);
  const zeilen = eintraege.map((e) =>
    zuCsvZeile([
      e.name,
      e.firma,
      e.strasse,
      e.plz,
      e.ort,
      e.land,
      formatDatum(e.geburtsdatum),
      e.quelle === "teilnehmer" ? "Teilnehmer" : "Buch-Kontakt",
      e.email,
    ])
  );

  // BOM, damit Excel unter Windows Umlaute korrekt als UTF-8 erkennt.
  const csv = "﻿" + [kopf, ...zeilen].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dateiname}"`,
    },
  });
}
