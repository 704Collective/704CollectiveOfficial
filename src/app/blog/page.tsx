import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import Link from "next/link";
import {
  FadeUp,
  FadeIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/Animations";

export const metadata: Metadata = {
  title: "Blog | 704 Collective",
  description:
    "Stories, insights, and updates from Charlotte's premier social club and business membership association.",
  openGraph: {
    title: "Blog | 704 Collective",
    description:
      "Stories, insights, and updates from Charlotte's premier community.",
    url: "https://704collective.com/blog",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const posts = [
  {
    slug: "why-we-built-704-collective",
    title: "Why We Built 704 Collective",
    excerpt:
      "Charlotte is full of ambitious, talented people who don't have a real place to connect. That's why we created something different.",
    category: "Community",
    date: "Coming Soon",
    readTime: "5 min read",
  },
  {
    slug: "social-vs-business-membership",
    title: "Social vs. Business: Which Membership Is Right for You?",
    excerpt:
      "Not sure which tier fits? Here's a breakdown of what each membership includes and who it's built for.",
    category: "Membership",
    date: "Coming Soon",
    readTime: "4 min read",
  },
  {
    slug: "networking-that-doesnt-suck",
    title: "Networking That Doesn't Suck",
    excerpt:
      "We've all been to the awkward mixer with 200 strangers and name tags. Here's how 704 Business does it differently.",
    category: "Business",
    date: "Coming Soon",
    readTime: "6 min read",
  },
  {
    slug: "building-community-in-charlotte",
    title: "Building Real Community in Charlotte",
    excerpt:
      "What it actually takes to build a social circle in a fast-growing city — and why most people struggle with it.",
    category: "Community",
    date: "Coming Soon",
    readTime: "5 min read",
  },
  {
    slug: "events-that-matter",
    title: "Why We Cap Every Event at 40 People",
    excerpt:
      "Bigger isn't better. Here's the philosophy behind our intentionally small, curated events.",
    category: "Events",
    date: "Coming Soon",
    readTime: "3 min read",
  },
  {
    slug: "charlotte-business-landscape",
    title: "Charlotte's Business Landscape: Why Now Matters",
    excerpt:
      "Charlotte is one of the fastest-growing cities in the country. Here's why that creates opportunity for the people who show up.",
    category: "Business",
    date: "Coming Soon",
    readTime: "7 min read",
  },
];

const categories = ["All", "Community", "Business", "Membership", "Events"];

export default function BlogPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: "64px" }}>
        {/* Hero */}
        <section
          style={{
            backgroundColor: "#000000",
            padding: "80px 24px 64px",
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

        {/* Categories */}
        <section
          style={{
            backgroundColor: "#000000",
            padding: "0 24px 48px",
          }}
        >
          <div
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              display: "flex",
              gap: "8px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {categories.map((cat, i) => (
              <FadeIn key={cat} delay={0.1 + i * 0.05}>
                <button
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    backgroundColor:
                      cat === "All"
                        ? "rgba(255, 255, 255, 0.06)"
                        : "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color:
                      cat === "All"
                        ? "#FFFFFF"
                        : "rgba(255, 255, 255, 0.4)",
                    fontSize: "0.8125rem",
                    fontWeight: cat === "All" ? 600 : 400,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 150ms ease",
                  }}
                >
                  {cat}
                </button>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* Posts Grid */}
        <section
          style={{
            backgroundColor: "#1A1A1A",
            padding: "64px 24px 96px",
          }}
        >
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <StaggerContainer
              staggerDelay={0.08}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "20px",
              }}
              className="blog-grid"
            >
              {posts.map((post, i) => (
                <StaggerItem
                  key={post.slug}
                  className="card-hover"
                  style={{
                    backgroundColor: "#2E2E2E",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "12px",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Placeholder image area */}
                  <div
                    style={{
                      height: "180px",
                      backgroundColor: "#1A1A1A",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{
                        color: "rgba(255, 255, 255, 0.08)",
                        fontSize: "2rem",
                        fontWeight: 700,
                      }}
                    >
                      704
                    </span>
                  </div>

                  <div
                    style={{
                      padding: "24px",
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                    }}
                  >
                    {/* Category + Date */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "12px",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(198, 166, 100, 0.08)",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          color: "#C6A664",
                        }}
                      >
                        {post.category}
                      </span>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          color: "rgba(255, 255, 255, 0.25)",
                        }}
                      >
                        {post.date}
                      </span>
                    </div>

                    <h2
                      style={{
                        fontSize: "1.0625rem",
                        fontWeight: 700,
                        color: "#FAF6F0",
                        lineHeight: 1.35,
                        marginBottom: "8px",
                      }}
                    >
                      {post.title}
                    </h2>

                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "rgba(255, 255, 255, 0.45)",
                        lineHeight: 1.6,
                        marginBottom: "16px",
                        flex: 1,
                      }}
                    >
                      {post.excerpt}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          color: "rgba(255, 255, 255, 0.2)",
                        }}
                      >
                        {post.readTime}
                      </span>
                      <span
                        style={{
                          fontSize: "0.8125rem",
                          color: "#C6A664",
                          fontWeight: 600,
                        }}
                      >
                        Coming Soon →
                      </span>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Newsletter CTA */}
        <section
          style={{
            backgroundColor: "#000000",
            padding: "80px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <h2
                style={{
                  fontSize: "clamp(1.5rem, 3vw, 2rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "#FFFFFF",
                  marginBottom: "12px",
                }}
              >
                Stay in the loop
              </h2>
            </FadeUp>

            <FadeUp delay={0.1}>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.45)",
                  fontSize: "0.9375rem",
                  marginBottom: "32px",
                }}
              >
                New posts, event recaps, and community updates. No spam.
              </p>
            </FadeUp>

            <FadeUp delay={0.2}>
              <div
                style={{
                  backgroundColor: "#1A1A1A",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "12px",
                  padding: "32px 24px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    color: "rgba(255, 255, 255, 0.2)",
                    fontSize: "0.8125rem",
                    marginBottom: "4px",
                  }}
                >
                  [Email signup form coming soon]
                </p>
                <p
                  style={{
                    color: "rgba(255, 255, 255, 0.12)",
                    fontSize: "0.75rem",
                  }}
                >
                  Will connect to your email platform
                </p>
              </div>
            </FadeUp>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}