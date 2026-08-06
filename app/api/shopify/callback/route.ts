import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Schliesst die einmalige OAuth-Verbindung ab: tauscht den Code gegen ein
// Access Token und speichert es in der Tabelle shopify_verbindung. Ab dann
// laeuft alles automatisch - lib/shopify.ts liest das Token von dort.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("shopify_oauth_state")?.value;

  if (!code || !shop) {
    return NextResponse.json({ fehler: "code oder shop fehlt im Callback." }, { status: 400 });
  }
  if (!state || state !== cookieState) {
    return NextResponse.json({ fehler: "State stimmt nicht überein (möglicher CSRF-Versuch)." }, { status: 400 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ fehler: "SHOPIFY_CLIENT_ID/SECRET fehlt als Vercel-Umgebungsvariable." }, { status: 500 });
  }

  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return NextResponse.json({ fehler: "Token-Austausch fehlgeschlagen.", details: tokenJson }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("shopify_verbindung").insert({
    shop_domain: shop,
    access_token: tokenJson.access_token,
    scope: tokenJson.scope,
  });

  const res = NextResponse.redirect(`${url.origin}/buch-versand?shopify=verbunden`);
  res.cookies.delete("shopify_oauth_state");
  return res;
}
