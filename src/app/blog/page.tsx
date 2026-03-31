import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { FadeUp, FadeIn } from "@/components/Animations";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";
import { format } from "date-fns";
import type { BlogPostRow } from "@/lib/blog/types";

export const metadata: Metadata = {
  title: "Blog | 704 Collective",
  description:
    "Stories, insights, and updates from Charlotte's premier social club and business membership association.",
  openGraph: {
    title: "Blog | 704 Collective",
    description:
      "Stories, insights, and updates from Charlotte's premier community.",
    url: "https://704collective.com/blog",
    siteName: "704 Collective",
    images: [
      { url: "https://704collective.com/og-image.png", width: 1200, height: 630, alt: "704 Collective" },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | 704 Collective",
    description:
      "Stories, insights, and updates from Charlotte's premier community.",
    images: ["https://704collective.com/og-image.png"],
  },
  alternates: { canonical: "https://704collective.com/blog" },
};

export const dynamic = "force-static";
export const revalidate = 60;

async function getPublishedPosts(): Promise<BlogPostRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as BlogPostRow[];
}

export default async function BlogPage() {
  const posts = await getPublishedPosts();

  return (
    <>
      <Nav />
      <main id="main-content" style={{ paddingTop: "64px" }}>
        <MarketingPageRoot>
          <section
            style={{
              backgroundColor: "#000000",
              padding: "80px 24px 48px",
            }}
          >
            <div
              style={{
                maxWidth: "800px",
                margin: "0 auto",
                textAlign: "center",
              }}
            >
              <FadeIn delay={0.1}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "rgba(255, 255, 255, 0.35)",
                    marginBottom: "16px",
                  }}
                >
                  Blog
                </span>
              </FadeIn>

              <FadeUp delay={0.15}>
                <h1
                  style={{
                    fontSize: "clamp(2rem, 5vw, 3rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.1,
                    color: "#FFFFFF",
                    marginBottom: "16px",
                  }}
                >
                  Stories & Insights
                </h1>
              </FadeUp>

              <FadeUp delay={0.25}>
                <p
                  style={{
                    fontSize: "1.0625rem",
                    color: "rgba(255, 255, 255, 0.5)",
                    lineHeight: 1.65,
                    maxWidth: "500px",
                    margin: "0 auto",
                  }}
                >
                  Ideas on community, business, and what it means to build
                  something real in Charlotte.
                </p>
              </FadeUp>
            </div>
          </section>

          <section
            style={{
              backgroundColor: "#1A1A1A",
              padding: "80px 24px 120px",
            }}
          >
            {posts.length === 0 ? (
              <div
                style={{
                  maxWidth: "560px",
                  margin: "0 auto",
                  textAlign: "center",
                }}
              >
                <FadeUp delay={0.1}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: "32px",
                    }}
                  >
                    <Image
                      src="/logo-nav.png"
                      alt="704 Collective"
                      width={120}
                      height={120}
                      priority
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                </FadeUp>

                <FadeUp delay={0.2}>
                  <h2
                    style={{
                      fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: "#FAF6F0",
                      marginBottom: "16px",
                    }}
                  >
                    Coming Soon
                  </h2>
                </FadeUp>

                <FadeUp delay={0.3}>
                  <p
                    style={{
                      fontSize: "1.0625rem",
                      color: "rgba(255, 255, 255, 0.5)",
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    Our blog is on its way. Check back soon for stories, insights,
                    and updates from the 704 Collective community.
                  </p>
                </FadeUp>
              </div>
            ) : (
              <div
                style={{
                  maxWidth: "960px",
                  margin: "0 auto",
                  display: "grid",
                  gap: "28px",
                }}
              >
                {posts.map((post, i) => (
                  <FadeUp key={post.id} delay={0.05 * Math.min(i, 8)}>
                    <Link
                      href={`/blog/${post.slug}`}
                      style={{
                        display: "block",
                        textDecoration: "none",
                        color: "inherit",
                        borderRadius: "16px",
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.03)",
                        transition: "border-color 0.2s, background 0.2s",
                      }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
                        <div className="relative aspect-[1200/630] sm:aspect-auto sm:min-h-[180px] w-full bg-black/40">
                          {post.cover_image_url ? (
                            <Image
                              src={post.cover_image_url}
                              alt={post.title ? `Cover: ${post.title}` : "Blog post cover"}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 100vw, 200px"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Image
                                src="/logo-nav.png"
                                alt=""
                                width={64}
                                height={64}
                                loading="lazy"
                                style={{ opacity: 0.25, objectFit: "contain" }}
                              />
                            </div>
                          )}
                        </div>
                        <div style={{ padding: "24px" }}>
                          <h2
                            style={{
                              fontSize: "1.35rem",
                              fontWeight: 700,
                              color: "#FAF6F0",
                              marginBottom: "10px",
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {post.title}
                          </h2>
                          {post.excerpt ? (
                            <p
                              style={{
                                fontSize: "0.9375rem",
                                color: "rgba(255,255,255,0.5)",
                                lineHeight: 1.6,
                                marginBottom: "14px",
                              }}
                            >
                              {post.excerpt}
                            </p>
                          ) : null}
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px 16px",
                              fontSize: "0.8125rem",
                              color: "rgba(255,255,255,0.4)",
                              marginBottom: "12px",
                            }}
                          >
                            {post.author ? <span>{post.author}</span> : null}
                            {post.published_at ? (
                              <span>
                                {format(new Date(post.published_at), "MMMM d, yyyy")}
                              </span>
                            ) : null}
                          </div>
                          {(post.tags?.length ?? 0) > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {post.tags!.map((t) => (
                                <span
                                  key={t}
                                  style={{
                                    fontSize: "0.6875rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    padding: "4px 10px",
                                    borderRadius: "999px",
                                    border: "1px solid rgba(198, 166, 100, 0.35)",
                                    color: "rgba(198, 166, 100, 0.9)",
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </FadeUp>
                ))}
              </div>
            )}
          </section>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
