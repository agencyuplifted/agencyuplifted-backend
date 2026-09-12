// Server-seitiger Client fuer die FastBill-API (https://apidocs.fastbill.com/).
// Nur lesend genutzt (invoice.get, item.get) -- niemals invoice.create/update/delete/cancel/setpaid.
// Zugangsdaten liegen ausschliesslich in Vercel unter FASTBILL_EMAIL/FASTBILL_APIKEY,
// erreichen nie den Client. Aktueller Umfang bewusst schmal gehalten: nur Ausgangsrechnungen
// eines Kalenderjahrs abrufen, roh speichern, dann manuell in der Backstage-UI abgleichen
// (siehe app/(backstage)/buchungen/fastbill/page.tsx) -- keine automatische Rechnungserstellung.

const FASTBILL_URL = "https://my.fastbill.com/api/1.0/api.php";

function getAuth(): { email: string; apiKey: string } {
  const email = process.env.FASTBILL_EMAIL;
  const apiKey = process.env.FASTBILL_APIKEY;
  if (!email || !apiKey) {
    throw new Error(
      "FASTBILL_EMAIL/FASTBILL_APIKEY sind nicht gesetzt. Bitte in Vercel unter Project Settings -> Environment Variables hinterlegen."
    );
  }
  return { email, apiKey };
}

// FastBill spiegelt seine XML-Struktur auch im JSON-Modus: bei genau einem
// Treffer liefert es ein einzelnes Objekt statt eines Arrays mit einem
// Element. Diese Hilfsfunktion normalisiert beide Faelle (und null/undefined)
// immer auf ein Array.
function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

async function callFastbill(
  service: string,
  body: Record<string, unknown>,
  debugLog?: string[]
): Promise<any> {
  const { email, apiKey } = getAuth();
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");
  const res = await fetch(FASTBILL_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ SERVICE: service, ...body }),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    const msg = `FastBill-Antwort (${service}) war kein gueltiges JSON (Status ${res.status}): ${text.slice(0, 500)}`;
    debugLog?.push(msg);
    throw new Error(msg);
  }
  if (!res.ok) {
    const msg = `FastBill-API-Fehler (${service}, Status ${res.status}): ${text.slice(0, 500)}`;
    debugLog?.push(msg);
    throw new Error(msg);
  }
  const errors = json?.RESPONSE?.ERRORS;
  if (errors) {
    const msg = `FastBill-API meldet Fehler bei ${service}: ${JSON.stringify(errors)}`;
    debugLog?.push(msg);
    throw new Error(msg);
  }
  // Diagnose-Log der obersten Schluessel + Rohantwort (gekuerzt) -- wird bei
  // Bedarf im Import-Report angezeigt, um bei einer FastBill-API-Antwort mit
  // unerwarteter Struktur (z.B. andere Gross-/Kleinschreibung als in der
  // offiziellen Doku) sofort sichtbar zu machen, statt still 0 Treffer zu
  // liefern. Nur die ersten paar Aufrufe pro Import loggen (Aufrufer steuert
  // das ueber debugLog?.length < N), sonst wird der Report zu lang.
  debugLog?.push(
    `${service} ${JSON.stringify(body.FILTER || {})}: RESPONSE-Schluessel=[${Object.keys(json?.RESPONSE || {}).join(", ")}] Rohantwort=${text.slice(0, 400)}`
  );
  return json?.RESPONSE ?? {};
}

export type FastbillInvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  completeNet: number;
  completeGross: number;
};

export type FastbillInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  type: string; // 'outgoing' | 'draft' | 'credit'
  invoiceDate: string | null;
  isCanceled: boolean;
  organization: string | null;
  firstName: string | null;
  lastName: string | null;
  subTotal: number;
  total: number;
  items: FastbillInvoiceItem[];
  raw: any;
};

// Holt alle Ausgangsrechnungen (TYPE outgoing) und Stornorechnungen (TYPE
// credit) eines Datumsbereichs inkl. ihrer Positionen. Zwei getrennte
// invoice.get-Aufrufe pro Typ, da FastBills FILTER.TYPE nur einen einzelnen
// Wert akzeptiert. Paginiert in 100er-Schritten (API-Maximum pro Abruf).
export async function fetchFastbillInvoices(params: {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  debugLog?: string[];
}): Promise<FastbillInvoice[]> {
  const alle: FastbillInvoice[] = [];

  for (const type of ["outgoing", "credit"] as const) {
    let offset = 0;
    const limit = 100;
    for (;;) {
      const response = await callFastbill(
        "invoice.get",
        {
          LIMIT: limit,
          OFFSET: offset,
          FILTER: {
            START_DATE: params.startDate,
            END_DATE: params.endDate,
            TYPE: type,
          },
        },
        params.debugLog
      );
      const invoices = asArray<any>(response?.INVOICES?.INVOICE ?? response?.INVOICES);
      if (invoices.length === 0) break;

      for (const inv of invoices) {
        const invoiceId = String(inv.INVOICE_ID);
        let items: FastbillInvoiceItem[] = [];
        try {
          const itemResponse = await callFastbill("item.get", { FILTER: { INVOICE_ID: invoiceId } });
          const rawItems = asArray<any>(itemResponse?.ITEMS?.ITEM ?? itemResponse?.ITEMS);
          items = rawItems.map((it) => ({
            description: String(it.DESCRIPTION ?? ""),
            quantity: Number(it.QUANTITY ?? 0),
            unitPrice: Number(it.UNIT_PRICE ?? 0),
            completeNet: Number(it.COMPLETE_NET ?? 0),
            completeGross: Number(it.COMPLETE_GROSS ?? 0),
          }));
        } catch (err) {
          // Positionen konnten nicht geladen werden -- Rechnung trotzdem roh
          // uebernehmen (Betraege aus dem Rechnungskopf sind noch vorhanden),
          // Fehler landet sichtbar im Import-Report statt den ganzen Import
          // abzubrechen.
          items = [];
          console.error(`FastBill item.get fehlgeschlagen fuer Rechnung ${invoiceId}:`, err);
        }

        alle.push({
          invoiceId,
          invoiceNumber: String(inv.INVOICE_NUMBER ?? ""),
          type,
          invoiceDate: inv.INVOICE_DATE ?? null,
          isCanceled: String(inv.IS_CANCELED) === "1",
          organization: inv.ORGANIZATION ?? null,
          firstName: inv.FIRST_NAME ?? null,
          lastName: inv.LAST_NAME ?? null,
          subTotal: Number(inv.SUB_TOTAL ?? 0),
          total: Number(inv.TOTAL ?? 0),
          items,
          raw: inv,
        });
      }

      if (invoices.length < limit) break;
      offset += limit;
    }
  }

  return alle;
}

// Grobe Matching-Heuristik: vergleicht den Rechnungs-Nettobetrag gegen JEDE
// jemals hinterlegte Preisstaffel jeder Option ueber ALLE Seminartermine
// (nicht nur ein Jahr -- eine 2026er Rechnung kann durchaus einen 2027er
// Termin bezahlen, und der Rechnungsbetrag kann einem laengst abgelaufenen
// Fruehbucherpreis entsprechen, nicht dem heute "aktuellen" Preis). Liefert
// nur dann einen Vorschlag, wenn GENAU EINE Options-Preisstaffel exakt auf
// den Betrag passt; bei Mehrdeutigkeit oder keinem Treffer bleibt der
// Vorschlag leer und die Zeile muss manuell zugeordnet werden -- bei dem
// hier zu erwartenden kleinen Volumen unproblematisch und sicherer als ein
// unsicherer Text-Match.
export function findePreisMatch(
  nettobetrag: number,
  preisKandidaten: { seminartermin_id: string; option_id: string; preis_netto: number }[]
): { seminartermin_id: string; option_id: string } | null {
  const treffer = preisKandidaten.filter((k) => Math.abs(k.preis_netto - nettobetrag) < 0.01);
  const eindeutigeOptionen = new Set(treffer.map((t) => t.option_id));
  if (eindeutigeOptionen.size === 1) {
    return { seminartermin_id: treffer[0].seminartermin_id, option_id: treffer[0].option_id };
  }
  return null;
}
