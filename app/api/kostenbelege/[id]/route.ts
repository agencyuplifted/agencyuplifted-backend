import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAktuellerBenutzer } from "@/lib/auth";

// Download eines Kostenbelegs (Hotelrechnung). Liegt nicht unter /api/public,
// die Middleware verlangt also schon eine Backstage-Session; zusaetzlich hier
// geprueft, weil die Belege Gaestenamen enthalten. Kurzlebige signierte URL
// statt Datei durchreichen.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const benutzer = await getAktuellerBenutzer();
  if (!benutzer) return NextResponse.json({ fehler: "nicht angemeldet" }, { status: 401 });
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data: beleg } = await supabase.from("termin_kostenbelege").select("datei_pfad, dateiname").eq("id", id).maybeSingle();
  if (!beleg?.datei_pfad) return NextResponse.json({ fehler: "keine Datei" }, { status: 404 });
  const { data, error } = await supabase.storage.from("kostenbelege").createSignedUrl(beleg.datei_pfad, 60, { download: beleg.dateiname || true });
  if (error || !data) return NextResponse.json({ fehler: error?.message || "Download fehlgeschlagen" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
