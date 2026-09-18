// Reiner HTML-Aufbau der Mails (ohne Node-Abhaengigkeiten), damit die
// Backstage-Vorschau im Browser exakt dasselbe zeigt, was verschickt wird.
// Token/Abmeldelinks liegen in lib/mail-bausteine.ts (server-only).

export type MailBausteine = {
  signatur: string;
  firmenangaben: string;
  impressum_url: string;
  datenschutz_url: string;
  abmelde_text: string;
};

export type BausteinSchalter = { signatur: boolean; rechtliches: boolean; abmelden: boolean };

export const STANDARD_BAUSTEINE: MailBausteine = {
  signatur: "Viele Grüße\nMarkus\nAgencyUplifted",
  firmenangaben: "",
  impressum_url: "https://agencyuplifted.com/impressum",
  datenschutz_url: "https://www.agencyuplifted.de/datenschutz",
  abmelde_text: "Du möchtest diese Mails nicht mehr bekommen?",
};

export function schalterAus(mail: { baustein_signatur?: boolean | null; baustein_rechtliches?: boolean | null; baustein_abmelden?: boolean | null }): BausteinSchalter {
  return {
    signatur: mail.baustein_signatur !== false,
    rechtliches: mail.baustein_rechtliches !== false,
    abmelden: mail.baustein_abmelden !== false,
  };
}


// Beispielwerte fuer Vorschauen im Backstage (Import, Editor, Bausteine)
export const BEISPIEL_WERTE: Record<string, string> = {
  vorname: "Anna",
  nachname: "Beispiel",
  firma: "Beispiel Agentur GmbH",
  option: "Shift",
  seminartitel: "Wertorientierte Preisfindung in Agenturen",
  seminardatum: "07.10.2026",
  datum_start: "Mittwoch, 7. Oktober 2026",
  zeit_start: "09:00",
  ort: "Weißes Ross, Illschwang",
  veranstaltungsort: "Illschwang",
  teilnehmerliste: "Anna Beispiel\nMax Muster",
  teilnehmerliste_link: "https://backstage.agencyuplifted.com/seminar/…/teilnehmer",
  unterlagen_link: "https://backstage.agencyuplifted.com/seminar/…/unterlagen",
  freigabe_link: "https://backstage.agencyuplifted.com/seminar/…/freigabe",
};

// ---------- HTML ----------

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const zeilen = (text: string) => escape(text).replace(/\n/g, "<br/>");

/**
 * Baut das komplette Mail-HTML: Inhalt (wie bisher, Zeilenumbrueche → <br/>),
 * darunter die eingeschalteten Bausteine. `abmeldeLink` null = kein Abmeldelink
 * moeglich (z. B. Vorschau ohne Empfaenger) -- dann ein Platzhalter-Link.
 */
export function baueMailHtml(
  inhaltText: string,
  bausteine: MailBausteine,
  schalter: BausteinSchalter,
  abmeldeLink: string | null
): string {
  const teile: string[] = [`<div>${inhaltText.replace(/\n/g, "<br/>")}</div>`];
  if (schalter.signatur && bausteine.signatur.trim()) {
    teile.push(`<div style="margin-top:20px">${zeilen(bausteine.signatur.trim())}</div>`);
  }
  const fuss: string[] = [];
  if (schalter.rechtliches) {
    if (bausteine.firmenangaben.trim()) fuss.push(`<div>${zeilen(bausteine.firmenangaben.trim())}</div>`);
    const links = [
      bausteine.impressum_url && `<a href="${escape(bausteine.impressum_url)}" style="color:#6e6e73">Impressum</a>`,
      bausteine.datenschutz_url && `<a href="${escape(bausteine.datenschutz_url)}" style="color:#6e6e73">Datenschutz</a>`,
    ].filter(Boolean);
    if (links.length) fuss.push(`<div style="margin-top:6px">${links.join(" · ")}</div>`);
  }
  if (schalter.abmelden) {
    fuss.push(
      `<div style="margin-top:6px">${escape(bausteine.abmelde_text || "")} <a href="${escape(abmeldeLink || "#")}" style="color:#6e6e73">Hier abmelden</a></div>`
    );
  }
  if (fuss.length) {
    teile.push(
      `<div style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e5ea;font-size:12px;line-height:1.5;color:#6e6e73">${fuss.join("")}</div>`
    );
  }
  return teile.join("");
}
