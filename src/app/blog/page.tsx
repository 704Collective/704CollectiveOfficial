import type { Metadata } from "next";
import Image from "next/image";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { FadeUp, FadeIn } from "@/components/Animations";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";

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

export default function BlogPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: "64px" }}>
        <MarketingPageRoot>
        {/* Hero */}
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

        {/* Coming soon */}
        <section
          style={{
            backgroundColor: "#1A1A1A",
            padding: "80px 24px 120px",
          }}
        >
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
        </section>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
