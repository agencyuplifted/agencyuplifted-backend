import { notFound, permanentRedirect, redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Metadata } from "next";
import { ArtikelSeite, artikelMetadata, ladeVeroeffentlichtenEintrag } from "../artikel";

// Zwischengespeichert (ISR): jede Artikelseite wird beim ersten Aufruf einmal
// erzeugt und danach aus dem Vercel-CDN ausgeliefert -- keine Rechenzeit und
// keine DB-Abfrage pro Besuch, auch nicht bei vielen Bots/KI-Crawlern.
// Aktualisiert wird gezielt beim Speichern/Veroeffentlichen in der Backstage
// (revalidiereWissen() in lib/actions.ts); revalidate ist nur das Sicherheitsnetz.
// Entwurfs-Vorschau laeuft deshalb ueber /wissen/vorschau/[id] (dynamisch).
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const eintrag = await ladeVeroeffentlichtenEintrag(slug);
  return eintrag ? artikelMetadata(eintrag) : {};
}

export default async function WissenDetailSeite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const eintrag = await ladeVeroeffentlichtenEintrag(slug);
  if (!eintrag) {
    // Die Middleware prueft /wissen/* nicht mehr auf Weiterleitungen (Kosten
    // pro Aufruf) -- deshalb hier, nur wenn der Artikel fehlt, z. B. nach
    // einer Slug-Umbenennung mit manuell angelegter Weiterleitung.
    const { data: weiter } = await getSupabaseAdmin()
      .from("insights_redirects")
      .select("neue_url, status_code")
      .eq("alte_url", `/wissen/${slug}`)
      .eq("aktiv", true)
      .maybeSingle();
    if (weiter?.neue_url) {
      if (weiter.status_code === 302 || weiter.status_code === 307) redirect(weiter.neue_url);
      permanentRedirect(weiter.neue_url);
    }
    notFound();
  }
  return <ArtikelSeite eintrag={eintrag} />;
}
