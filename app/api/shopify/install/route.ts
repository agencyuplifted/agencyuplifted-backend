import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Startet die einmalige OAuth-Verbindung zu Shopify. Aufruf ueber den Button
// "Mit Shopify verbinden" auf /buch-versand. Nach Bestaetigung im
// Shopify-Adminbereich landet der Merchant automatisch bei /api/shopify/callback.
export async function GET(req: NextRequest) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(req.url).origin;

  const fehlend: string[] = [];
  if (!clientId) fehlend.push("SHOPIFY_CLIENT_ID");
  if (!shopDomain) fehlend.push("SHOPIFY_STORE_DOMAIN");

  if (fehlend.length || !clientId || !shopDomain) {
    return NextResponse.json(
      {
        fehler: `Diese Vercel-Umgebungsvariable(n) fehlen oder sind leer: ${fehlend.join(", ")}`,
        hinweis: "Geprueft wurde die Production-Umgebung dieses laufenden Deployments.",
      },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = `${appUrl}/api/shopify/callback`;
  const scope = "write_draft_orders,read_products";

  const authorizeUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set("shopify_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/" });
  return res;
}
