import { NextRequest, NextResponse } from "next/server";
import { fuehreAbmeldungDurch } from "@/lib/abmelden";

export const dynamic = "force-dynamic";

// RFC 8058 One-Click: Gmail/Apple Mail schicken beim "Abmelden"-Knopf im
// Postfach ein POST an die List-Unsubscribe-Adresse. Nur POST meldet ab --
// ein GET (z. B. Link-Scanner) leitet nur auf die Bestaetigungsseite.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const ok = await fuehreAbmeldungDurch(token, "one_click");
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/abmelden/${token}`, req.url));
}
