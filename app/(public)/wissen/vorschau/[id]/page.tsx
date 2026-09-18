import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArtikelSeite, artikelMetadata, ladeEintragPerId } from "../../artikel";

// Entwurfs-Vorschau aus dem Backstage-Editor: immer frisch (nicht
// zwischengespeichert), zeigt auch unveroeffentlichte Eintraege und ist per
// artikelMetadata bei Entwuerfen noindex.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const eintrag = /^[0-9a-f-]{36}$/i.test(id) ? await ladeEintragPerId(id) : null;
  return eintrag ? { ...(await artikelMetadata(eintrag)), robots: { index: false, follow: false } } : {};
}

export default async function WissenVorschau({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eintrag = /^[0-9a-f-]{36}$/i.test(id) ? await ladeEintragPerId(id) : null;
  if (!eintrag) notFound();
  return <ArtikelSeite eintrag={eintrag} />;
}
