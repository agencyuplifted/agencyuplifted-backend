// Direkter Zugriff auf die Shopify Admin GraphQL API - unabhaengig von jeder
// Chat-Sitzung.
//
// Seit 1.1.2026 vergibt Shopify keine einfachen statischen Tokens mehr ueber
// "Apps entwickeln" im Store-Admin. Neue Apps laufen nur noch ueber das Dev
// Dashboard + OAuth. Deshalb holt sich diese Datei das Access Token entweder
// aus einer Umgebungsvariable (falls doch mal ein statisches Token existiert)
// oder aus der Tabelle "shopify_verbindung", die von /api/shopify/callback
// nach dem einmaligen OAuth-Connect befuellt wird. Fuer eine private App auf
// einem einzelnen Store ist dieses Token dauerhaft gueltig (bis zur
// Deinstallation) - der OAuth-Tanz ist also ein einmaliger Vorgang, kein
// wiederkehrender Login.

import { getSupabaseAdmin } from "./supabase";

const API_VERSION = "2025-01";

// Taschenbuch-Variante "Preisfindung in Agenturen" (29,90 EUR, aktiver Bestand).
export const BUCH_VARIANT_ID = "gid://shopify/ProductVariant/51929230672138";

const LAND_ZU_COUNTRY_CODE: Record<string, string> = {
  Deutschland: "DE",
  Österreich: "AT",
  Schweiz: "CH",
};

async function holeZugriff(): Promise<{ domain: string; token: string } | null> {
  if (process.env.SHOPIFY_ADMIN_API_TOKEN && process.env.SHOPIFY_STORE_DOMAIN) {
    return { domain: process.env.SHOPIFY_STORE_DOMAIN, token: process.env.SHOPIFY_ADMIN_API_TOKEN };
  }
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("shopify_verbindung")
    .select("shop_domain, access_token")
    .order("verbunden_am", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { domain: data.shop_domain, token: data.access_token };
}

export async function shopifyKonfiguriert() {
  return (await holeZugriff()) !== null;
}

async function adminGraphql(query: string, variables: Record<string, unknown>) {
  const zugriff = await holeZugriff();
  if (!zugriff) {
    throw new Error(
      "Shopify ist noch nicht verbunden. Unter /buch-versand auf 'Mit Shopify verbinden' klicken."
    );
  }

  const res = await fetch(`https://${zugriff.domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": zugriff.token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  // Shopify kann bei Feld-Berechtigungsfehlern (z.B. fehlendes read_orders)
  // trotzdem brauchbare Teil-Daten zurueckgeben (die Mutation selbst lief
  // durch, nur ein Unterfeld fehlt). Deshalb hier nicht hart abbrechen,
  // sondern beides zurueckgeben und den Aufrufer entscheiden lassen.
  if (json.errors?.length && !json.data) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }
  return { data: json.data, errors: json.errors as { message: string }[] | undefined };
}

export type BuchVersandEintrag = {
  id: string;
  name: string;
  firma?: string | null;
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
  const [vorname, ...restName] = eintrag.name.trim().split(" ");
  const nachname = restName.join(" ") || vorname;

  const address = {
    firstName: vorname,
    lastName: restName.length ? nachname : "",
    company: eintrag.firma || undefined,
    address1: eintrag.strasse,
    city: eintrag.ort,
    zip: eintrag.plz,
    countryCode: LAND_ZU_COUNTRY_CODE[eintrag.land] || "DE",
  };

  const { data: createData, errors: createErrors } = await adminGraphql(
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

  if (!createData?.draftOrderCreate?.draftOrder) {
    const msg = createErrors?.map((e) => e.message).join("; ") || "Draft Order konnte nicht angelegt werden.";
    throw new Error(msg);
  }
  const draftErrors = createData.draftOrderCreate.userErrors;
  if (draftErrors?.length) throw new Error(draftErrors.map((e: any) => e.message).join("; "));

  const draftOrderId = createData.draftOrderCreate.draftOrder.id;

  // WICHTIG: Ab hier ist die Bestellung in Shopify real angelegt. Alles was
  // danach noch schiefgeht (z.B. fehlende Leserechte fuer "order") darf NICHT
  // mehr als Fehlschlag gewertet werden - sonst denkt das Backend, der Versand
  // sei fehlgeschlagen, obwohl in Shopify schon eine echte Bestellung + Mail
  // rausgegangen ist, und ein erneuter Klick wuerde ein Duplikat anlegen.
  const { data: completeData, errors: completeErrors } = await adminGraphql(
    `mutation draftOrderComplete($id: ID!) {
      draftOrderComplete(id: $id) {
        draftOrder { id order { id name } }
        userErrors { field message }
      }
    }`,
    { id: draftOrderId }
  );

  const draftOrderResult = completeData?.draftOrderComplete?.draftOrder;
  const userErrors = completeData?.draftOrderComplete?.userErrors;
  if (userErrors?.length) throw new Error(userErrors.map((e: any) => e.message).join("; "));

  if (!draftOrderResult) {
    // draftOrderComplete selbst ist fehlgeschlagen (nicht nur das order-Unterfeld).
    const msg = completeErrors?.map((e) => e.message).join("; ") || "Draft Order konnte nicht abgeschlossen werden.";
    throw new Error(msg);
  }

  const order = draftOrderResult.order;
  return {
    shopifyOrderId: order?.id || draftOrderId,
    shopifyOrderName: order?.name || "siehe Shopify (Bestellnummer nicht lesbar – read_orders-Scope fehlt)",
  };
}
