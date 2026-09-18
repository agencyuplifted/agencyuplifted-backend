import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "./supabase";
import { getResend } from "./email";

// "Uplifted Agencies" -- Mitgliedernetzwerk unter /netzwerk.
//
// Bewusst getrennt von der Backstage: eigene Supabase-Auth-Session (Cookie
// nur fuer den Pfad /netzwerk, kein Bezug zum au_session-Cookie), und alle
// Lesezugriffe der Mitglieder laufen mit IHRER Session gegen die Datenbank --
// was sie sehen duerfen, regeln RLS + Spalten-Rechte (Migration
// netzwerk_uplifted_agencies), nicht nur der Code hier. Den Service-Role-
// Client nutzen nur Einladung, Login-Link und die Aktivierung.

export const NETZWERK_NAME = "Uplifted Agencies";
export const NETZWERK_COOKIE_PFAD = "/netzwerk";
export const NETZWERK_BASIS_URL = `${process.env.BACKSTAGE_URL || "https://backstage.agencyuplifted.com"}/netzwerk`;

export function getNetzwerkAuthKonfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY ist nicht gesetzt. Bitte den Publishable Key aus Supabase in Vercel unter Project Settings -> Environment Variables hinterlegen."
    );
  }
  return { url, key };
}

export async function createNetzwerkClient() {
  const { url, key } = getNetzwerkAuthKonfig();
  const store = await cookies();
  return createServerClient(url, key, {
    cookieOptions: { path: NETZWERK_COOKIE_PFAD, sameSite: "lax", secure: true },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (liste) => {
        // In Server Components nicht erlaubt -- dort frischt die Middleware
        // die Session auf, hier darf es still scheitern.
        try {
          liste.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {}
      },
    },
  });
}

export type NetzwerkMitglied = { teilnehmerId: string; authUserId: string; email: string };

// Fuer alle Mitglieder-Seiten: eingeloggt UND aktives Mitglied, sonst weiter
// zum Login bzw. zur Willkommens-/Zuordnungsseite.
export async function requireMitglied(): Promise<NetzwerkMitglied & { client: Awaited<ReturnType<typeof createNetzwerkClient>> }> {
  const client = await createNetzwerkClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/netzwerk/login");
  const { data: teilnehmerId } = await client.rpc("netzwerk_mein_teilnehmer_id");
  if (!teilnehmerId) redirect("/netzwerk/willkommen");
  return { client, teilnehmerId: teilnehmerId as string, authUserId: data.user.id, email: data.user.email || "" };
}

export function normalisiereEmail(email: string | null | undefined): string {
  return String(email || "").trim().toLowerCase();
}

export async function getNetzwerkGruppen(): Promise<{ pilot: string; vormerkliste: string }> {
  const { data, error } = await getSupabaseAdmin().from("community_gruppen").select("id, typ").in("typ", ["netzwerk_pilot", "netzwerk_vormerkliste"]);
  if (error) throw new Error(error.message);
  const pilot = data?.find((g) => g.typ === "netzwerk_pilot")?.id;
  const vormerkliste = data?.find((g) => g.typ === "netzwerk_vormerkliste")?.id;
  if (!pilot || !vormerkliste) throw new Error("Netzwerk-Gruppen fehlen (Migration netzwerk_uplifted_agencies).");
  return { pilot, vormerkliste };
}

// Erzeugt einen Einmal-Link (Token-Hash) und verschickt ihn als eigene Mail
// ueber Resend -- NICHT die Standard-Supabase-Mail. Der Link zeigt auf eine
// Bestaetigungsseite mit Button statt direkt einzuloggen: Mail-Scanner (z. B.
// Outlook Safe Links) rufen Links vorab auf und wuerden den Einmal-Token sonst
// verbrauchen, bevor der Mensch klickt.
export async function sendeNetzwerkLink({
  email,
  vorname,
  anrede,
  art,
}: {
  email: string;
  vorname: string | null;
  anrede: string | null;
  art: "einladung" | "login";
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const adresse = normalisiereEmail(email);

  let typ: "invite" | "magiclink" = "invite";
  let ergebnis = await admin.auth.admin.generateLink({ type: "invite", email: adresse });
  if (ergebnis.error) {
    // Auth-User existiert schon (frueher eingeladen/eingeloggt) -> normaler Login-Link
    typ = "magiclink";
    ergebnis = await admin.auth.admin.generateLink({ type: "magiclink", email: adresse });
  }
  if (ergebnis.error || !ergebnis.data?.properties?.hashed_token) {
    throw new Error(`Link konnte nicht erzeugt werden: ${ergebnis.error?.message || "unbekannter Fehler"}`);
  }
  const link = `${NETZWERK_BASIS_URL}/auth/bestaetigen?token_hash=${encodeURIComponent(ergebnis.data.properties.hashed_token)}&type=${typ}`;

  const gruss = anrede === "Frau" ? `Liebe ${vorname}` : anrede === "Herr" ? `Lieber ${vorname}` : `Hallo ${vorname || ""}`.trim();
  const betreff = art === "einladung" ? `Deine persönliche Einladung zu ${NETZWERK_NAME}` : `Dein Login-Link für ${NETZWERK_NAME}`;
  const text =
    art === "einladung"
      ? `<p>${gruss},</p>
<p>ich baue gerade ein kleines, privates Netzwerk für Agenturunternehmerinnen und -unternehmer auf, die bei mir im Seminar waren: <strong>${NETZWERK_NAME}</strong>. Bevor es offiziell losgeht, teste ich es mit einer Handvoll Menschen, die ich persönlich ausgewählt habe – und du bist einer davon.</p>
<p>Im Netzwerk findest du die anderen Mitglieder mit ihren Agenturen, siehst, mit wem du schon gemeinsam im Seminar warst, und kannst Gesuche und Angebote teilen.</p>
<p>Mit dem Button meldest du dich an – ein Passwort brauchst du nicht:</p>`
      : `<p>${gruss},</p><p>hier ist dein Link, um dich bei ${NETZWERK_NAME} anzumelden:</p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f;max-width:560px;font-size:15px;line-height:1.55">
${text}
<p style="margin:24px 0"><a href="${link}" style="background:#0b1b33;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${art === "einladung" ? "Zum Netzwerk" : "Jetzt anmelden"}</a></p>
<p style="font-size:13px;color:#6e6e73">Der Link ist aus Sicherheitsgründen nur begrenzt gültig und funktioniert einmal. Falls er abgelaufen ist, kannst du dir auf ${NETZWERK_BASIS_URL.replace(/^https?:\/\//, "")}/login jederzeit einen neuen schicken lassen.</p>
${art === "einladung" ? `<p>Ich freue mich auf dein Feedback!<br>Markus</p>` : ""}
<p style="font-size:12px;color:#a1a1a6;margin-top:28px">${NETZWERK_NAME} – ein Angebot von Agency Uplifted</p>
</div>`;

  const { error } = await getResend().emails.send({
    from: process.env.NETZWERK_ABSENDER || "Markus Hartmann <hallo@agencyuplifted.de>",
    to: [adresse],
    subject: betreff,
    html,
  });
  if (error) throw new Error(`Mail konnte nicht gesendet werden: ${error.message}`);
}

export type Zuordnung =
  | { fall: "aktiv" }
  | { fall: "abgelehnt" }
  | { fall: "bestaetigen"; teilnehmer: { id: string; vorname: string; nachname: string; agenturen: string[] } }
  | { fall: "pruefen"; grund: "kein_treffer" | "mehrere_treffer" | "nicht_eingeladen" | "bereits_verknuepft" };

// Dubletten-sichere Zuordnung eines eingeloggten Auth-Users zu genau einem
// teilnehmer (per E-Mail, case-insensitive). Legt NIE selbst einen
// Teilnehmer an -- alles Unklare landet in netzwerk_anmeldungen_pruefen.
export async function ermittleZuordnung(authUserId: string, email: string): Promise<Zuordnung> {
  const admin = getSupabaseAdmin();
  const { pilot } = await getNetzwerkGruppen();

  const { data: verknuepft } = await admin.from("teilnehmer").select("id").eq("auth_user_id", authUserId).maybeSingle();
  const adresse = normalisiereEmail(email);
  const { data: treffer, error } = await admin
    .from("teilnehmer")
    .select("id, vorname, nachname, email, auth_user_id, deaktiviert_am, teilnehmer_community_status(status, community_gruppe_id), teilnehmer_organisationen(organisationen(name))")
    .ilike("email", adresse.replace(/[%_\\]/g, "\\$&"))
    .is("deaktiviert_am", null);
  if (error) throw new Error(error.message);
  const kandidaten = (treffer || []).filter((t: any) => normalisiereEmail(t.email) === adresse);

  const pilotStatus = (t: any) => (t.teilnehmer_community_status || []).find((s: any) => s.community_gruppe_id === pilot)?.status as string | undefined;

  if (verknuepft) {
    const t: any = kandidaten.find((k: any) => k.id === verknuepft.id) ||
      (await admin.from("teilnehmer").select("id, teilnehmer_community_status(status, community_gruppe_id)").eq("id", verknuepft.id).single()).data;
    const status = pilotStatus(t);
    if (status === "aktiv") return { fall: "aktiv" };
    if (status === "abgelehnt") return { fall: "abgelehnt" };
    return { fall: "pruefen", grund: "nicht_eingeladen" };
  }

  let ergebnis: Zuordnung;
  if (kandidaten.length === 0) ergebnis = { fall: "pruefen", grund: "kein_treffer" };
  else if (kandidaten.length > 1) ergebnis = { fall: "pruefen", grund: "mehrere_treffer" };
  else {
    const t: any = kandidaten[0];
    const status = pilotStatus(t);
    if (t.auth_user_id) ergebnis = { fall: "pruefen", grund: "bereits_verknuepft" };
    else if (status === "abgelehnt") ergebnis = { fall: "abgelehnt" };
    else if (status !== "eingeladen" && status !== "aktiv") ergebnis = { fall: "pruefen", grund: "nicht_eingeladen" };
    else
      ergebnis = {
        fall: "bestaetigen",
        teilnehmer: {
          id: t.id,
          vorname: t.vorname,
          nachname: t.nachname,
          agenturen: (t.teilnehmer_organisationen || []).map((z: any) => z.organisationen?.name).filter(Boolean),
        },
      };
  }

  if (ergebnis.fall === "pruefen") await meldeZurPruefung(authUserId, adresse, ergebnis.grund, kandidaten.map((k: any) => k.id));
  return ergebnis;
}

export async function meldeZurPruefung(authUserId: string, email: string, grund: string, kandidaten: string[] = []) {
  const admin = getSupabaseAdmin();
  const { data: offen } = await admin
    .from("netzwerk_anmeldungen_pruefen")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("grund", grund)
    .is("erledigt_am", null)
    .limit(1);
  if (offen?.length) return;
  await admin.from("netzwerk_anmeldungen_pruefen").insert({ auth_user_id: authUserId, email, grund, kandidaten });
}
