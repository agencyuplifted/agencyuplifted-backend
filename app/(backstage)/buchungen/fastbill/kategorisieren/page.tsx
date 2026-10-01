export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase";
import { kategorisiereFastbillRechnung } from "@/lib/actions";
import KategorisierenListe from "./KategorisierenListe";

// Manuelle Kategorisierung der FastBill-Rechnungen, die noch "unklar" sind.
// Bewusst KEIN Stichwort-Matching: "buch" traf z. B. "Frühbucherpreis".
export default async function FastbillKategorisierenPage() {
  const supabase = getSupabaseAdmin();
  const [{ data: kategorien }, { data: rechnungen }] = await Promise.all([
    supabase.from("fastbill_kategorien").select("id, name").order("reihenfolge").order("name"),
    supabase
      .from("fastbill_rechnungen")
      .select("id, fastbill_invoice_number, rechnungsdatum, kunde_firma, kunde_vorname, kunde_nachname, betrag_netto, ist_storno, status, positionen")
      .or("kategorie.eq.unklar,kategorie.is.null")
      .order("betrag_netto", { ascending: false }),
  ]);

  const zeilen = (rechnungen || []).map((r: any) => {
    const text = String((Array.isArray(r.positionen) && r.positionen[0]?.description) || "").replace(/\s+/g, " ").trim();
    return {
      id: r.id as string,
      nummer: r.fastbill_invoice_number as string,
      datum: r.rechnungsdatum as string,
      kunde: (r.kunde_firma || `${r.kunde_vorname || ""} ${r.kunde_nachname || ""}`).trim() || "—",
      betrag: Number(r.betrag_netto || 0),
      text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      storno: !!r.ist_storno,
      ignoriert: r.status === "ignoriert",
    };
  });

  return (
    <main>
      <p><Link href="/buchungen/fastbill">← FastBill-Abgleich</Link> · <Link href="/buchungen/fastbill/kategorien">Kategorien verwalten →</Link></p>
      <h1>FastBill kategorisieren</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: "-0.75rem" }}>
        Alle noch unklaren Rechnungen, größter Betrag zuerst. Klick auf eine Kategorie ordnet die Rechnung zu – sie verschwindet dann aus der Liste.
      </p>
      <KategorisierenListe zeilen={zeilen} kategorien={(kategorien || []).map((k: any) => k.name)} action={kategorisiereFastbillRechnung} />
    </main>
  );
}
