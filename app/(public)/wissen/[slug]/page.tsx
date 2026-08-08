export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Block } from "@/lib/insights";
import { formatDatum } from "@/lib/format";
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

// Der Wissen-Autor ist aktuell bewusst fest an eine Person gebunden (siehe
// mitarbeiter.ist_wissen_autor), unabhaengig davon, wer den Beitrag im
// Editor angelegt hat -- Bio/Foto/LinkedIn sind im Backstage unter
// /mitarbeiter aenderbar, ohne dass Code angefasst werden muss.
async function ladeWissenAutor() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("mitarbeiter")
    .select("name, bio_rolle, bio_text, bio_foto_url, bio_linkedin_url")
    .eq("ist_wissen_autor", true)
    .maybeSingle();
  return data;
}

async function basisUrl() {
  const h = await headers();
  const host = h.get("host") || "backstage.agencyuplifted.com";
  return `https://${host}`;
}

// "Aehnliche Beitraege": haelt Leser auf der Seite (Dwell Time/Engagement)
// und verteilt internen Link-Equity zwischen Artikeln -- beides fuer
// klassisches SEO wie fuer GEO relevant (Themencluster/Kontext fuer LLMs).
// Sortiert aktuell nach Veroeffentlichungsdatum, nicht nach Kategorie, weil
// die importierten Contao-Artikel noch keiner insights_kategorien-Zeile
// zugeordnet sind (0 Zuordnungen aktuell) -- sobald kategorisiert wird,
// kann hier auf "gleiche Kategorie zuerst" umgestellt werden.
async function ladeAehnlicheEintraege(aktuelleId: string, typ: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("insights_eintraege")
    .select("slug, titel, kurzfassung, veroeffentlicht_am")
    .eq("status", "veroeffentlicht")
    .eq("typ", typ)
    .neq("id", aktuelleId)
    .order("veroeffentlicht_am", { ascending: false, nullsFirst: false })
    .limit(3);
  return data || [];
}

function berechneLesezeit(bloecke: Block[]): number {
  const woerter = bloecke
    .map((b) => {
      if (b.typ === "absatz" || b.typ === "zitat") return b.text;
      if (b.typ === "ueberschrift") return b.text;
      if (b.typ === "liste") return b.punkte.join(" ");
      if (b.typ === "faq") return `${b.frage} ${b.antwort}`;
      return "";
    })
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(woerter / 200));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const eintrag = await ladeVeroeffentlichtenEintrag(slug);
  if (!eintrag) return {};
  const [basis, autor] = await Promise.all([basisUrl(), ladeWissenAutor()]);
  return {
    title: `${eintrag.titel} – AgencyUplifted`,
    description: eintrag.kurzfassung || undefined,
    alternates: { canonical: `${basis}/wissen/${eintrag.slug}` },
    authors: autor ? [{ name: autor.name }] : undefined,
    openGraph: {
      type: "article",
      title: eintrag.titel,
      description: eintrag.kurzfassung || undefined,
      images: eintrag.titelbild_url ? [eintrag.titelbild_url] : undefined,
      publishedTime: eintrag.veroeffentlicht_am || eintrag.erstellt_am,
      modifiedTime: eintrag.aktualisiert_am,
    },
    twitter: {
      card: eintrag.titelbild_url ? "summary_large_image" : "summary",
      title: eintrag.titel,
      description: eintrag.kurzfassung || undefined,
      images: eintrag.titelbild_url ? [eintrag.titelbild_url] : undefined,
    },
  };
}

function baueJsonLd(
  eintrag: any,
  autor: { name: string; bio_linkedin_url: string | null } | null,
  basisUrl: string
) {
  const basis = {
    "@context": "https://schema.org",
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wissen", item: `${basisUrl}/wissen` },
      { "@type": "ListItem", position: 2, name: eintrag.titel, item: `${basisUrl}/wissen/${eintrag.slug}` },
    ],
  };
  // Eingebettete faq-Bausteine (auch in normalen Artikeln moeglich) zaehlen
  // fuer Google/KI-Assistenten als eigenstaendige FAQPage-Struktur, zusaetzlich
  // zum Article-Schema -- mehrere @type-Bloecke auf einer Seite sind zulaessig.
  const faqBausteine = (eintrag.bloecke as Block[]).filter((b) => b.typ === "faq") as Extract<Block, { typ: "faq" }>[];
  const eingebettetesFaqSchema =
    eintrag.typ !== "faq" && faqBausteine.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqBausteine.map((f) => ({
            "@type": "Question",
            name: f.frage,
            acceptedAnswer: { "@type": "Answer", text: f.antwort },
          })),
        }
      : null;
  const autorSchema = autor
    ? {
        "@type": "Person",
        name: autor.name,
        ...(autor.bio_linkedin_url ? { sameAs: [autor.bio_linkedin_url] } : {}),
      }
    : undefined;
  const publisherSchema = {
    "@type": "Organization",
    name: "AgencyUplifted",
    url: "https://www.agencyuplifted.de",
  };
  if (eintrag.typ === "faq") {
    const faqBloecke = (eintrag.bloecke as Block[]).filter((b) => b.typ === "faq") as Extract<Block, { typ: "faq" }>[];
    return {
      artikel: {
        ...basis,
        "@type": "FAQPage",
        mainEntity: faqBloecke.map((f) => ({
          "@type": "Question",
          name: f.frage,
          acceptedAnswer: { "@type": "Answer", text: f.antwort },
        })),
      },
      breadcrumb: breadcrumbSchema,
      faq: null,
    };
  }
  if (eintrag.typ === "glossar") {
    return {
      artikel: {
        ...basis,
        "@type": "DefinedTerm",
        name: eintrag.titel,
        description: eintrag.kurzfassung || "",
      },
      breadcrumb: breadcrumbSchema,
      faq: null,
    };
  }
  return {
    artikel: {
      ...basis,
      "@type": "Article",
      headline: eintrag.titel,
      description: eintrag.kurzfassung || undefined,
      image: eintrag.titelbild_url || undefined,
      datePublished: eintrag.veroeffentlicht_am || eintrag.erstellt_am,
      dateModified: eintrag.aktualisiert_am,
      ...(autorSchema ? { author: autorSchema } : {}),
      publisher: publisherSchema,
    },
    breadcrumb: breadcrumbSchema,
    faq: eingebettetesFaqSchema,
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
      return (
        <p key={i} style={{ margin: "0 0 1.25em", lineHeight: 1.7, color: "var(--color-text)" }}>
          {renderInline(block.text)}
        </p>
      );
    case "ueberschrift": {
      const Tag = (`h${block.ebene}` as unknown) as "h2" | "h3" | "h4";
      return (
        <Tag key={i} style={{ margin: "1.75em 0 0.75em" }}>
          {block.text}
        </Tag>
      );
    }
    case "liste": {
      const ListTag = block.stil === "geordnet" ? "ol" : "ul";
      return (
        <ListTag key={i} style={{ margin: "0 0 1.25em", paddingLeft: "1.4em", lineHeight: 1.7 }}>
          {block.punkte.filter(Boolean).map((p, j) => (
            <li key={j} style={{ marginBottom: "0.4em" }}>
              {renderInline(p)}
            </li>
          ))}
        </ListTag>
      );
    }
    case "zitat":
      return (
        <blockquote
          key={i}
          style={{ margin: "0 0 1.25em", padding: "0.25em 0 0.25em 1.25em", borderLeft: "3px solid var(--color-border-strong)" }}
        >
          <p style={{ margin: 0, lineHeight: 1.7, fontStyle: "italic", color: "var(--color-text)" }}>{renderInline(block.text)}</p>
          {block.quelle && <cite style={{ display: "block", marginTop: "0.5em", fontSize: "0.9em" }}>— {block.quelle}</cite>}
        </blockquote>
      );
    case "bild":
      return (
        <figure key={i} style={{ margin: "0 0 1.25em" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.url} alt={block.alt} style={{ width: "100%", height: "auto", display: "block" }} />
          {block.bildunterschrift && (
            <figcaption style={{ fontSize: "0.85em", color: "var(--color-text-faint)", marginTop: "0.5em" }}>
              {block.bildunterschrift}
            </figcaption>
          )}
        </figure>
      );
    case "faq":
      return (
        <details key={i} style={{ margin: "0 0 1em" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>{block.frage}</summary>
          <p style={{ margin: "0.5em 0 0", lineHeight: 1.7 }}>{block.antwort}</p>
        </details>
      );
    default:
      return null;
  }
}

function AutorBox({ autor }: { autor: { name: string; bio_rolle: string | null; bio_text: string | null; bio_foto_url: string | null; bio_linkedin_url: string | null } }) {
  const initialen = autor.name
    .split(" ")
    .map((teil) => teil[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="wp-author">
      {autor.bio_foto_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={autor.bio_foto_url} alt={autor.name} className="wp-author-foto" />
      ) : (
        <div className="wp-author-foto wp-author-foto-platzhalter" aria-hidden="true">
          {initialen}
        </div>
      )}
      <div className="wp-author-info">
        <div className="wp-author-name">{autor.name}</div>
        {autor.bio_rolle && <div className="wp-author-rolle">{autor.bio_rolle}</div>}
        {autor.bio_text && <p className="wp-author-bio">{autor.bio_text}</p>}
        {autor.bio_linkedin_url && (
          <a href={autor.bio_linkedin_url} target="_blank" rel="noopener noreferrer nofollow" className="wp-author-link">
            LinkedIn-Profil ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default async function WissenDetailSeite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const eintrag = await ladeVeroeffentlichtenEintrag(slug);
  if (!eintrag) notFound();

  const basis = await basisUrl();
  const [autor, aehnliche] = await Promise.all([
    ladeWissenAutor(),
    ladeAehnlicheEintraege(eintrag.id, eintrag.typ),
  ]);
  const jsonLd = baueJsonLd(eintrag, autor, basis);
  const lesezeit = berechneLesezeit(eintrag.bloecke as Block[]);
  const zuletztAktualisiert =
    eintrag.aktualisiert_am &&
    eintrag.veroeffentlicht_am &&
    new Date(eintrag.aktualisiert_am).getTime() - new Date(eintrag.veroeffentlicht_am).getTime() > 1000 * 60 * 60 * 24
      ? eintrag.aktualisiert_am
      : null;

  return (
    <div className="wp-container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.artikel) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.breadcrumb) }} />
      {jsonLd.faq && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd.faq) }} />
      )}
      <nav className="wp-breadcrumbs" aria-label="Breadcrumb">
        <Link href="/wissen">Wissen</Link>
        <span aria-hidden="true"> / </span>
        <span>{eintrag.titel}</span>
      </nav>
      <article className="wp-article">
        <div className="wp-article-meta">
          {formatDatum(eintrag.veroeffentlicht_am || eintrag.erstellt_am)}
          {autor && <> · von {autor.name}</>}
          <> · {lesezeit} Min. Lesezeit</>
          {zuletztAktualisiert && <> · aktualisiert am {formatDatum(zuletztAktualisiert)}</>}
        </div>
        <h1>{eintrag.titel}</h1>
        {eintrag.kurzfassung && <p className="wp-article-kurzfassung">{eintrag.kurzfassung}</p>}
        {eintrag.titelbild_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={eintrag.titelbild_url}
            alt={eintrag.titelbild_alt || ""}
            className="wp-article-image"
          />
        )}
        {(eintrag.bloecke as Block[]).map((b, i) => (
          <Baustein key={i} block={b} i={i} />
        ))}
      </article>
      {autor && <AutorBox autor={autor} />}
      {aehnliche.length > 0 && (
        <section className="wp-related" aria-labelledby="wp-related-heading">
          <h2 id="wp-related-heading" className="wp-related-heading">Ähnliche Beiträge</h2>
          <ul className="wp-related-list">
            {aehnliche.map((a) => (
              <li key={a.slug}>
                <Link href={`/wissen/${a.slug}`} className="wp-related-link">
                  <span className="wp-related-title">{a.titel}</span>
                  {a.kurzfassung && <span className="wp-related-excerpt">{a.kurzfassung}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
