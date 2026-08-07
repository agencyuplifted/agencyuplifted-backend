export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Block } from "@/lib/insights";
import type { Metadata } from "next";

async function ladeVeroeffentlichtenEintrag(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("insights_eintraege")
    .select("*")
    .eq("slug", slug)
    .eq("status", "veroeffentlicht")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const eintrag = await ladeVeroeffentlichtenEintrag(slug);
  if (!eintrag) return {};
  return {
    title: eintrag.titel,
    description: eintrag.kurzfassung || undefined,
    alternates: { canonical: `https://backstage.agencyuplifted.com/oeffentlich/${eintrag.slug}` },
    openGraph: {
      title: eintrag.titel,
      description: eintrag.kurzfassung || undefined,
      images: eintrag.titelbild_url ? [eintrag.titelbild_url] : undefined,
    },
  };
}

function baueJsonLd(eintrag: any) {
  const basis = {
    "@context": "https://schema.org",
  };
  if (eintrag.typ === "faq") {
    const faqBloecke = (eintrag.bloecke as Block[]).filter((b) => b.typ === "faq") as Extract<Block, { typ: "faq" }>[];
    return {
      ...basis,
      "@type": "FAQPage",
      mainEntity: faqBloecke.map((f) => ({
        "@type": "Question",
        name: f.frage,
        acceptedAnswer: { "@type": "Answer", text: f.antwort },
      })),
    };
  }
  if (eintrag.typ === "glossar") {
    return {
      ...basis,
      "@type": "DefinedTerm",
      name: eintrag.titel,
      description: eintrag.kurzfassung || "",
    };
  }
  return {
    ...basis,
    "@type": "Article",
    headline: eintrag.titel,
    description: eintrag.kurzfassung || undefined,
    image: eintrag.titelbild_url || undefined,
    datePublished: eintrag.veroeffentlicht_am || eintrag.erstellt_am,
    dateModified: eintrag.aktualisiert_am,
  };
}

function renderInline(text: string) {
  const teile = text.split(/(\*\*.+?\*\*)/g);
  return teile.map((teil, idx) =>
    teil.startsWith("**") && teil.endsWith("**") && teil.length > 4 ? (
      <strong key={idx}>{teil.slice(2, -2)}</strong>
    ) : (
      <span key={idx}>{teil}</span>
    )
  );
}

function Baustein({ block, i }: { block: Block; i: number }) {
  switch (block.typ) {
    case "absatz":
      return <p key={i}>{renderInline(block.text)}</p>;
    case "ueberschrift": {
      const Tag = (`h${block.ebene}` as unknown) as "h2" | "h3" | "h4";
      return <Tag key={i}>{block.text}</Tag>;
    }
    case "liste": {
      const ListTag = block.stil === "geordnet" ? "ol" : "ul";
      return (
        <ListTag key={i}>
          {block.punkte.filter(Boolean).map((p, j) => (
            <li key={j}>{renderInline(p)}</li>
          ))}
        </ListTag>
      );
    }
    case "zitat":
      return (
        <blockquote key={i}>
          <p>{renderInline(block.text)}</p>
          {block.quelle && <cite>{block.quelle}</cite>}
        </blockquote>
      );
    case "bild":
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <figure key={i}>
          <img src={block.url} alt={block.alt} />
          {block.bildunterschrift && <figcaption>{block.bildunterschrift}</figcaption>}
        </figure>
      );
    case "faq":
      return (
        <details key={i}>
          <summary>{block.frage}</summary>
          <p>{block.antwort}</p>
        </details>
      );
    default:
      return null;
  }
}

export default async function OeffentlicheInsightsSeite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const eintrag = await ladeVeroeffentlichtenEintrag(slug);
  if (!eintrag) notFound();

  const jsonLd = baueJsonLd(eintrag);

  return (
    <article style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{eintrag.titel}</h1>
      {eintrag.kurzfassung && <p style={{ color: "#5f5e5a" }}>{eintrag.kurzfassung}</p>}
      {eintrag.titelbild_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={eintrag.titelbild_url} alt={eintrag.titelbild_alt || ""} style={{ width: "100%", height: "auto" }} />
      )}
      {(eintrag.bloecke as Block[]).map((b, i) => (
        <Baustein key={i} block={b} i={i} />
      ))}
    </article>
  );
}
