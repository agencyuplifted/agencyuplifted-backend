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

  // Zusaetzliche Absicherung: der Shop im Callback muss exakt dem
  // konfigurierten Store entsprechen -- sonst koennte (theoretisch, mit
  // gestohlenem State-Cookie) ein Access-Token fuer einen fremden Shop in
  // shopify_verbindung landen und von lib/shopify.ts verwendet werden.
  const erwarteterShop = process.env.SHOPIFY_STORE_DOMAIN;
  if (!erwarteterShop || shop !== erwarteterShop) {
    return NextResponse.json({ fehler: "Shop-Domain stimmt nicht mit der konfigurierten Domain überein." }, { status: 400 });
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const fehlend: string[] = [];
    if (!clientId) fehlend.push("SHOPIFY_CLIENT_ID");
    if (!clientSecret) fehlend.push("SHOPIFY_CLIENT_SECRET");
    return NextResponse.json(
      { fehler: `Diese Vercel-Umgebungsvariable(n) fehlen oder sind leer: ${fehlend.join(", ")}` },
      { status: 500 }
    );
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
