import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";
import { format } from "date-fns";
import { sanitizeBlogHtml } from "@/lib/blog/sanitizePostHtml";
import type { BlogPostRow } from "@/lib/blog/types";

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

function absoluteOgImage(url: string | null | undefined): string[] {
  if (!url) return [`${CANONICAL}/og-image.png`];
  if (url.startsWith("http://") || url.startsWith("https://")) return [url];
  if (url.startsWith("/")) return [`${CANONICAL}${url}`];
  return [url];
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
  return {
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: {
      title: post.meta_title?.trim() || post.title,
      description,
      url: `${CANONICAL}/blog/${post.slug}`,
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
    alternates: { canonical: `${CANONICAL}/blog/${post.slug}` },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const safeHtml = sanitizeBlogHtml(post.content);
  const displayTitle = post.title;
  const publishedLabel = post.published_at
    ? format(new Date(post.published_at), "MMMM d, yyyy")
    : "";

  return (
    <>
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
                  alt=""
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
                  gap: "8px 20px",
                  fontSize: "0.875rem",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: "28px",
                }}
              >
                {post.author ? <span>{post.author}</span> : null}
                {publishedLabel ? <time dateTime={post.published_at ?? undefined}>{publishedLabel}</time> : null}
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

              <div
                className="blog-post-body text-[#e8e4dc] text-base leading-relaxed [&_a]:text-[#C6A664] [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_img]:rounded-lg [&_img]:max-w-full [&_img]:h-auto [&_blockquote]:border-l-2 [&_blockquote]:border-[#C6A664]/50 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-white/70"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />

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
