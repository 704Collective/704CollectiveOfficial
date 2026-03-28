import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await params;
  return {
    title: "Post Not Found | 704 Collective Blog",
    description: "This blog post does not exist or has not been published yet.",
    robots: { index: false, follow: true },
  };
}

export default async function BlogPostPage({ params }: Props) {
  await params;

  return (
    <>
      <Nav />
      <main style={{ paddingTop: "64px", minHeight: "60vh" }}>
        <MarketingPageRoot>
        <section
          style={{
            backgroundColor: "#1A1A1A",
            padding: "80px 24px 120px",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "28px",
              }}
            >
              <Image
                src="/logo-nav.png"
                alt="704 Collective"
                width={96}
                height={96}
                style={{ objectFit: "contain" }}
              />
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "rgba(255, 255, 255, 0.35)",
                marginBottom: "12px",
              }}
            >
              404
            </p>
            <h1
              style={{
                fontSize: "clamp(1.5rem, 4vw, 2rem)",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#FAF6F0",
                marginBottom: "12px",
              }}
            >
              This post isn&apos;t available
            </h1>
            <p
              style={{
                fontSize: "1rem",
                color: "rgba(255, 255, 255, 0.45)",
                lineHeight: 1.6,
                marginBottom: "28px",
              }}
            >
              We couldn&apos;t find a blog post at this address. It may have
              been moved or isn&apos;t published yet.
            </p>
            <Link
              href="/blog"
              style={{
                display: "inline-block",
                fontSize: "0.9375rem",
                fontWeight: 600,
                color: "#C6A664",
                textDecoration: "none",
              }}
            >
              ← Back to Blog
            </Link>
          </div>
        </section>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
