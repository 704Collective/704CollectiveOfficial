import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Clock } from "lucide-react";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";
import { BlogSocialEmbeds } from "@/components/blog/BlogSocialEmbeds";
import { format } from "date-fns";
import { sanitizeBlogHtml } from "@/lib/blog/sanitizePostHtml";
import { injectHeadingAnchorsAndBuildToc } from "@/lib/blog/blogToc";
import { readingTimeMinutesFromContent } from "@/lib/blog/readingTime";
import { fetchInstagramOembedHtml, fetchTikTokOembedHtml } from "@/lib/blog/fetchSocialOembed";
import type { BlogPostRow } from "@/lib/blog/types";
import type { BlogSchemaType } from "@/lib/blog/schemaTypes";

const CANONICAL = "https://704collective.com";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;

async function getPublishedPost(slug: string): Promise<BlogPostRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .not("published_at", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as BlogPostRow;
}

async function getRelatedPublishedPosts(
  ids: string[] | null | undefined
): Promise<BlogPostRow[]> {
  if (!ids?.length) return [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .in("id", ids)
    .eq("status", "published")
    .not("published_at", "is", null);
  if (error || !data?.length) return [];
  const rows = data as BlogPostRow[];
  const order = new Map(ids.map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).slice(0, 3);
}

function absoluteOgImage(url: string | null | undefined): string[] {
  if (!url) return [`${CANONICAL}/og-image.png`];
  if (url.startsWith("http://") || url.startsWith("https://")) return [url];
  if (url.startsWith("/")) return [`${CANONICAL}${url}`];
  return [url];
}

function resolveCanonical(post: BlogPostRow): string {
  const c = post.canonical_url?.trim();
  if (c && (c.startsWith("http://") || c.startsWith("https://"))) return c;
  return `${CANONICAL}/blog/${post.slug}`;
}

function buildKeywordMeta(post: BlogPostRow): string[] {
  const out: string[] = [];
  const fk = post.focus_keyword?.trim();
  if (fk) out.push(fk);
  for (const t of post.tags ?? []) {
    if (t?.trim()) out.push(t.trim());
  }
  return [...new Set(out)];
}

function jsonLdSchemaType(schema: BlogSchemaType | string | null | undefined): string {
  if (schema === "Article" || schema === "NewsArticle" || schema === "BlogPosting") return schema;
  return "BlogPosting";
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) {
    return {
      title: "Post Not Found | 704 Collective Blog",
      description: "This blog post does not exist or has not been published yet.",
      robots: { index: false, follow: true },
    };
  }
  const title = (post.meta_title?.trim() || post.title) + " | 704 Collective Blog";
  const description =
    post.meta_description?.trim() || post.excerpt?.trim() || `Read ${post.title} on 704 Collective.`;
  const keywords = buildKeywordMeta(post);
  const canonical = resolveCanonical(post);
  return {
    title,
    description,
    keywords: keywords.length ? keywords : undefined,
    robots: { index: true, follow: true },
    openGraph: {
      title: post.meta_title?.trim() || post.title,
      description,
      url: canonical,
      siteName: "704 Collective",
      type: "article",
      publishedTime: post.published_at ?? undefined,
      images: absoluteOgImage(post.cover_image_url).map((u) => ({ url: u, width: 1200, height: 630 })),
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta_title?.trim() || post.title,
      description,
      images: absoluteOgImage(post.cover_image_url),
    },
    alternates: { canonical },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const safeHtmlBase = await sanitizeBlogHtml(post.content);
  const { html: bodyHtml, toc } = injectHeadingAnchorsAndBuildToc(safeHtmlBase);
  const showToc = post.show_table_of_contents === true && toc.length > 0;

  const coverAlt = post.cover_image_alt?.trim() || post.title;
  const displayTitle = post.title;
  const publishedLabel = post.published_at
    ? format(new Date(post.published_at), "MMMM d, yyyy")
    : "";

  const readMins =
    post.reading_time_minutes != null && post.reading_time_minutes > 0
      ? post.reading_time_minutes
      : Math.max(1, readingTimeMinutesFromContent(post.content));

  const schemaT = jsonLdSchemaType(post.schema_type);
  const pageCanonical = resolveCanonical(post);
  const imageUrl = absoluteOgImage(post.cover_image_url)[0];
  const keywordList = buildKeywordMeta(post);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": schemaT,
    headline: post.title,
    description: post.excerpt?.trim() || post.meta_description?.trim() || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at ?? undefined,
    author: post.author
      ? {
          "@type": "Person",
          name: post.author,
        }
      : undefined,
    keywords: keywordList.length ? keywordList.join(", ") : undefined,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageCanonical,
    },
  };

  const [instagramHtml, tiktokHtml, relatedPosts] = await Promise.all([
    post.instagram_embed_url?.trim()
      ? fetchInstagramOembedHtml(post.instagram_embed_url)
      : Promise.resolve(null),
    post.tiktok_embed_url?.trim()
      ? fetchTikTokOembedHtml(post.tiktok_embed_url)
      : Promise.resolve(null),
    getRelatedPublishedPosts(post.related_post_ids ?? []),
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main id="main-content" style={{ paddingTop: "64px", minHeight: "60vh" }}>
        <MarketingPageRoot>
          <article
            style={{
              backgroundColor: "#1A1A1A",
              paddingBottom: "120px",
            }}
          >
            {post.cover_image_url ? (
              <div className="relative w-full aspect-[1200/630] max-h-[min(56vh,520px)] bg-black/50">
                <Image
                  src={post.cover_image_url}
                  alt={coverAlt}
                  fill
                  className="object-cover"
                  priority
                  sizes="100vw"
                />
              </div>
            ) : null}

            <div
              style={{
                maxWidth: "720px",
                margin: "0 auto",
                padding: "48px 24px 0",
              }}
            >
              <p
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(198, 166, 100, 0.85)",
                  marginBottom: "16px",
                }}
              >
                Blog
              </p>
              <h1
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                  color: "#FAF6F0",
                  marginBottom: "20px",
                }}
              >
                {displayTitle}
              </h1>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px 20px",
                  fontSize: "0.875rem",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: "28px",
                }}
              >
                {post.author ? <span>{post.author}</span> : null}
                {publishedLabel ? <time dateTime={post.published_at ?? undefined}>{publishedLabel}</time> : null}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#C6A664]/80" aria-hidden />
                  <span>{readMins} min read</span>
                </span>
              </div>
              {(post.tags?.length ?? 0) > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "36px" }}>
                  {post.tags!.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: "0.6875rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        padding: "6px 12px",
                        borderRadius: "999px",
                        border: "1px solid rgba(198, 166, 100, 0.35)",
                        color: "rgba(198, 166, 100, 0.95)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              {showToc ? (
                <nav
                  aria-label="Table of contents"
                  className="mb-10 rounded-lg border border-y border-r border-white/10 border-l-4 border-l-[#C6A664] bg-black/25 px-4 py-4"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[#C6A664] mb-3">
                    On this page
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {toc.map((item) => (
                      <li key={item.id} className={item.level === 3 ? "pl-4" : ""}>
                        <a
                          href={`#${item.id}`}
                          className="text-[#e8e4dc] hover:text-[#C6A664] underline-offset-2 hover:underline"
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}

              <div
                className="blog-post-body text-[#e8e4dc] text-base leading-relaxed [&_a]:text-[#C6A664] [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:scroll-mt-24 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto [&_blockquote]:border-l-2 [&_blockquote]:border-[#C6A664]/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-white/70"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />

              <BlogSocialEmbeds instagramHtml={instagramHtml} tiktokHtml={tiktokHtml} />

              {relatedPosts.length > 0 ? (
                <section className="mt-14 pt-10 border-t border-white/10">
                  <h2 className="text-lg font-semibold text-[#FAF6F0] mb-6 tracking-tight">
                    Related posts
                  </h2>
                  <div className="grid gap-6 sm:grid-cols-1">
                    {relatedPosts.map((rp) => (
                      <Link
                        key={rp.id}
                        href={`/blog/${rp.slug}`}
                        className="group flex flex-col sm:flex-row gap-4 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden hover:border-[#C6A664]/35 transition-colors"
                      >
                        <div className="relative w-full sm:w-40 aspect-[1200/630] sm:aspect-auto sm:min-h-[120px] shrink-0 bg-black/40">
                          {rp.cover_image_url ? (
                            <Image
                              src={rp.cover_image_url}
                              alt={rp.cover_image_alt?.trim() || rp.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 100vw, 160px"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center opacity-30">
                              <Image src="/logo-nav.png" alt="" width={48} height={48} />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex flex-col justify-center min-w-0">
                          <h3 className="font-semibold text-[#FAF6F0] group-hover:text-[#C6A664] transition-colors line-clamp-2">
                            {rp.title}
                          </h3>
                          {rp.excerpt ? (
                            <p className="text-sm text-white/50 mt-2 line-clamp-2">{rp.excerpt}</p>
                          ) : null}
                          <span className="text-sm font-medium text-[#C6A664] mt-3">Read more →</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              <div style={{ marginTop: "56px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <Link
                  href="/blog"
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: 600,
                    color: "#C6A664",
                    textDecoration: "none",
                  }}
                >
                  ← Back to Blog
                </Link>
              </div>
            </div>
          </article>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
