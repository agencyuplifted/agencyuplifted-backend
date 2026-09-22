export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MWST_SATZ } from "@/lib/format";
import { laufzeitMonate, type ProgrammOption } from "@/lib/programm-buchung";

// Lesender Endpunkt fuer die Onepage-Programmseite (/uplift): Programm +
// aktive Optionen mit Preisen aus programm_optionen -- Quelle fuer den
// Onepage-Sync-Job (Live-Fetching auf Onepage ist unzuverlaessig, siehe
// CLAUDE.md), damit Preise nie im Seitencode hart stehen.

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

const brutto = (n: number | null) => (n === null ? null : Math.round(n * (1 + MWST_SATZ) * 100) / 100);
const zahl = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function GET(_req: Request, { params }: { params: Promise<{ schluessel: string }> }) {
  const { schluessel } = await params;
  const supabase = getSupabaseAdmin();
  const { data: programm } = await supabase
    .from("programme")
    .select("id, name, schluessel, kurzbeschreibung, aktiv, programm_optionen(*)")
    .eq("schluessel", schluessel)
    .maybeSingle();
  if (!programm || !programm.aktiv) return withCors(NextResponse.json({ error: "programm_not_found" }, { status: 404 }));

  const optionen = ((programm as any).programm_optionen || [])
    .filter((o: any) => !o.deaktiviert_am)
    .sort((a: any, b: any) => (a.sortierung ?? 0) - (b.sortierung ?? 0))
    .map((o: ProgrammOption & Record<string, any>) => ({
      id: o.id,
      titel: o.titel,
      beschreibung: o.beschreibung,
      badge: o.badge,
      waehrung: o.waehrung,
      preis_monatlich_netto: zahl(o.preis_monatlich),
      preis_monatlich_brutto: brutto(zahl(o.preis_monatlich)),
      preis_jaehrlich_netto: zahl(o.preis_jaehrlich),
      preis_jaehrlich_brutto: brutto(zahl(o.preis_jaehrlich)),
      monatlich_moeglich: !!o.ratenzahlung_aktiv,
      laufzeit_monate: laufzeitMonate(o),
      zusatzteilnehmer_preis_monatlich_netto: zahl(o.zusatzteilnehmer_preis_monatlich),
      zusatzteilnehmer_preis_jaehrlich_netto: zahl(o.zusatzteilnehmer_preis_jaehrlich),
      zusatz_teilnehmer_hinweis: o.zusatz_teilnehmer_hinweis,
    }));

  return withCors(
    NextResponse.json({
      id: programm.id,
      name: programm.name,
      schluessel: programm.schluessel,
      kurzbeschreibung: programm.kurzbeschreibung,
      optionen,
    })
  );
}
