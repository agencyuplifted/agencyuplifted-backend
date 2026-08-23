import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// llms.txt (siehe https://llmstxt.org/) -- ein an KI-Crawler gerichtetes
// Gegenstueck zu robots.txt: statt nur zu erlauben/verbieten, beschreibt es
// kurz, worum es auf der Seite geht, und verlinkt gezielt die wichtigsten
// Inhalte, damit ein KI-System die Kernthemen schneller findet und zitieren
// kann. Nur auf PUBLIC_HOST ausgeliefert, exakt wie robots.txt/middleware.ts
// -- siehe Konzeptdokument Abschnitt 14.5.
const PUBLIC_HOSTS = (process.env.PUBLIC_HOST || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() || "";

  if (!PUBLIC_HOSTS.includes(host)) {
    return new Response("", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const supabase = getSupabaseAdmin();
  const { data: artikel } = await supabase
    .from("insights_eintraege")
    .select("titel, slug, kurzfassung")
    .eq("status", "veroeffentlicht")
    .order("aktualisiert_am", { ascending: false })
    .limit(50);

  const zeilen = (artikel || [])
    .map((a) => `- [${a.titel}](https://${host}/wissen/${a.slug})${a.kurzfassung ? `: ${a.kurzfassung}` : ""}`)
    .join("\n");

  const body = `# AgencyUplifted

> Wissen für Agenturinhaber:innen zu wertorientierter Preisfindung, Kundengesprächen, Führung und Agenturaufbau -- geschrieben von Markus Hartmann, Gründer von AgencyUplifted, auf Basis eigener Praxiserfahrung als Agenturberater.

Kernthese: Preise sollten sich am Wert für den Kunden orientieren, nicht am Zeitaufwand. Die größte Hebelwirkung für Agenturinhaber:innen liegt im nächsten Kundengespräch und in der Reflexion darüber.

## Wissen

${zeilen || "(aktuell keine veröffentlichten Artikel)"}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
