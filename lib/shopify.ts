// Direkter Zugriff auf die Shopify Admin GraphQL API - unabhaengig von jeder
// Chat-Sitzung. Braucht SHOPIFY_ADMIN_API_TOKEN und SHOPIFY_STORE_DOMAIN
// (z.B. "hartmann-verlag.myshopify.com") als Vercel-Umgebungsvariablen.

const API_VERSION = "2025-01";

// Taschenbuch-Variante "Preisfindung in Agenturen" (29,90 EUR, aktiver Bestand).
export const BUCH_VARIANT_ID = "gid://shopify/ProductVariant/51929230672138";

const LAND_ZU_COUNTRY_CODE: Record<string, string> = {
  Deutschland: "DE",
  Österreich: "AT",
  Schweiz: "CH",
};

function shopifyKonfiguriert() {
  return Boolean(process.env.SHOPIFY_ADMIN_API_TOKEN && process.env.SHOPIFY_STORE_DOMAIN);
}

async function adminGraphql(query: string, variables: Record<string, unknown>) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!domain || !token) throw new Error("Shopify ist noch nicht konfiguriert (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN fehlen).");

  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e: any) => e.message).join("; "));
  return json.data;
}

export type BuchVersandEintrag = {
  id: string;
  name: string;
  email: string | null;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  grund: string;
};

// Legt eine Draft Order mit 100%-Rabatt an (kein Rabattcode - der Nachlass
// wird direkt in der Bestellung angewandt) und schliesst sie sofort ab, damit
// der normale Fulfillment-/Versandprozess in Shopify greift.
export async function versendeAlsShopifyBestellung(eintrag: BuchVersandEintrag) {
  if (!shopifyKonfiguriert()) {
    throw new Error("Shopify ist noch nicht verbunden (Umgebungsvariablen fehlen). Eintrag bleibt als Entwurf.");
  }

  const [vorname, ...restName] = eintrag.name.trim().split(" ");
  const nachname = restName.join(" ") || vorname;

  const address = {
    firstName: vorname,
    lastName: restName.length ? nachname : "",
    address1: eintrag.strasse,
    city: eintrag.ort,
    zip: eintrag.plz,
    countryCode: LAND_ZU_COUNTRY_CODE[eintrag.land] || "DE",
  };

  const createResult = await adminGraphql(
    `mutation draftOrderCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email: eintrag.email || undefined,
        lineItems: [{ variantId: BUCH_VARIANT_ID, quantity: 1 }],
        shippingAddress: address,
        billingAddress: address,
        appliedDiscount: {
          value: 100,
          valueType: "PERCENTAGE",
          title: eintrag.grund === "rezension" ? "Rezensionsexemplar" : "Gratisexemplar",
        },
        shippingLine: { title: "Kostenloser Versand (Autorenexemplar)", price: "0.00" },
        note: `Automatisch angelegt über Buch-Versand-Backend – ${eintrag.grund === "rezension" ? "Rezensionsexemplar" : "Gratisexemplar"}.`,
        tags: ["autorenexemplar", eintrag.grund],
      },
    }
  );

  const draftErrors = createResult.draftOrderCreate.userErrors;
  if (draftErrors?.length) throw new Error(draftErrors.map((e: any) => e.message).join("; "));

  const draftOrderId = createResult.draftOrderCreate.draftOrder.id;

  const completeResult = await adminGraphql(
    `mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { id order { id name } }
        userErrors { field message }
      }
    }`,
    { id: draftOrderId }
  );

  const completeErrors = completeResult.draftOrderComplete.userErrors;
  if (completeErrors?.length) throw new Error(completeErrors.map((e: any) => e.message).join("; "));

  const order = completeResult.draftOrderComplete.draftOrder.order;
  return { shopifyOrderId: order.id, shopifyOrderName: order.name };
}
