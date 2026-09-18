import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { INBOX_QUELLEN, INBOX_TEXT_MAX, type InboxQuelle } from "@/lib/inbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Schnellerfassung fuer die Ideen-Inbox per Apple-Kurzbefehl (Siri, iPhone,
// Watch). Bewusst NICHT unter /api/public: das ist CORS-offen fuer die
// Onepage-Seiten gedacht. Hier gibt es keinen Browser-Aufrufer, nur den
// Kurzbefehl -- daher Token statt Session (Ausnahme in middleware.ts).
//
// Antwort ist absichtlich nur Klartext ("Gespeichert"), weil der Kurzbefehl
// sie 1:1 als Bestaetigung anzeigt bzw. Siri sie vorliest.

function getInboxToken(): string {
  const token = process.env.INBOX_API_TOKEN;
  if (!token || token.length < 24) {
    throw new Error("INBOX_API_TOKEN ist nicht gesetzt (oder kuerzer als 24 Zeichen). Bitte in Vercel unter Project Settings -> Environment Variables hinterlegen.");
  }
  return token;
}

function tokenPasst(gesendet: string | null, erwartet: string): boolean {
  if (!gesendet) return false;
  const a = Buffer.from(gesendet);
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Zweistufiges Rate Limit: der In-Memory-Zaehler faengt Bursts innerhalb
// einer warmen Serverless-Instanz ab, die DB-Zaehlung gilt instanzuebergreifend
// (Vercel startet parallel mehrere Instanzen ohne gemeinsamen Speicher). Das
// Limit ist grosszuegig fuer einen einzelnen Menschen mit Diktierfunktion,
// bremst aber ein Script mit geleaktem Token sofort aus.
const BURST_FENSTER_MS = 60_000;
const BURST_MAX = 10;
const DB_FENSTER_MIN = 10;
const DB_MAX = 30;
const burst = new Map<string, number[]>();

function burstUeberschritten(schluessel: string): boolean {
  const jetzt = Date.now();
  const liste = (burst.get(schluessel) || []).filter((t) => jetzt - t < BURST_FENSTER_MS);
  liste.push(jetzt);
  burst.set(schluessel, liste);
  return liste.length > BURST_MAX;
}

function antwort(text: string, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders } });
}

export async function POST(request: NextRequest) {
  let erwartet: string;
  try {
    erwartet = getInboxToken();
  } catch (e: any) {
    console.error(e.message);
    return antwort("Inbox ist nicht konfiguriert.", 500);
  }

  const auth = request.headers.get("authorization") || "";
  const gesendet = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!tokenPasst(gesendet, erwartet)) return antwort("Nicht autorisiert.", 401);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unbekannt";
  if (burstUeberschritten(ip)) return antwort("Zu viele Einträge – bitte kurz warten.", 429, { "Retry-After": "60" });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return antwort("Ungültige Anfrage (JSON erwartet).", 400);
  }

  const text = String(body?.text ?? "").trim();
  if (!text) return antwort("Kein Text übermittelt.", 400);
  if (text.length > INBOX_TEXT_MAX) return antwort(`Text zu lang (max. ${INBOX_TEXT_MAX} Zeichen).`, 400);

  const quelleRoh = String(body?.source ?? body?.quelle ?? "iphone").toLowerCase().trim();
  // Der Kurzbefehl schickt einfach "Gerätedetails -> Gerätemodell" mit
  // ("iPhone", "Apple Watch", "iPad" ...), statt je Geraet einen eigenen
  // Kurzbefehl pflegen zu muessen.
  const quelle: InboxQuelle = (INBOX_QUELLEN as readonly string[]).includes(quelleRoh)
    ? (quelleRoh as InboxQuelle)
    : quelleRoh.includes("watch")
      ? "watch"
      : "iphone";

  const supabase = getSupabaseAdmin();
  const seit = new Date(Date.now() - DB_FENSTER_MIN * 60_000).toISOString();
  const { count, error: zaehlFehler } = await supabase
    .from("inbox_eintraege")
    .select("id", { count: "exact", head: true })
    .eq("via_api", true)
    .gte("erstellt_am", seit);
  if (zaehlFehler) {
    console.error("Inbox-Rate-Limit:", zaehlFehler.message);
    return antwort("Speichern fehlgeschlagen.", 500);
  }
  if ((count || 0) >= DB_MAX) return antwort("Zu viele Einträge – bitte in ein paar Minuten erneut versuchen.", 429, { "Retry-After": "600" });

  const { error } = await supabase.from("inbox_eintraege").insert({ text, quelle, via_api: true, status: "neu" });
  if (error) {
    console.error("Inbox-Insert:", error.message);
    return antwort("Speichern fehlgeschlagen.", 500);
  }

  return antwort("Gespeichert", 201);
}
