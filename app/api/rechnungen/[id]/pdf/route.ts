import { NextResponse } from "next/server";
import { getAktuellerBenutzer } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rechnungsPdf } from "@/lib/rechnungen";

export const dynamic = "force-dynamic";

// PDF-Vorschau einer Seminar-Rechnung (auch Entwurf) direkt aus FastBill.
// Nicht unter /api/public: die Middleware verlangt die Backstage-Session,
// hier zusaetzlich geprueft.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const benutzer = await getAktuellerBenutzer();
  if (!benutzer) return NextResponse.json({ fehler: "nicht angemeldet" }, { status: 401 });
  const { id } = await params;
  try {
    const pdf = await rechnungsPdf(getSupabaseAdmin(), id);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return new Response(`<p style="font-family:sans-serif;color:#6e6e73">${String(e?.message || "PDF nicht verfügbar.").replace(/</g, "&lt;")}</p>`, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
