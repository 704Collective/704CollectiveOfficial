import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import Link from "next/link";
import {
  FadeUp,
  FadeIn,
  StaggerContainer,
  StaggerItem,
  ScaleUp,
  WordReveal,
} from "@/components/Animations";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";
import JsonLd from "@/components/JsonLd";
import { businessServiceSchema704 } from "@/lib/jsonLdSchemas";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "704 Business | Charlotte's Premier Business Community",
  description:
    "Strategic networking for Charlotte's ambitious professionals. Monthly business meetings, exclusive workshops, and real connections that drive growth.",
  openGraph: {
    title: "704 Business | Charlotte's Premier Business Community",
    description: "Strategic networking for Charlotte's ambitious professionals.",
    url: "https://704collective.com/business",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const pillars = [
  {
    num: "01",
    title: "Curated - Not Open Door",
    body: "Every member is reviewed. You're not joining a room full of strangers - you're joining a room where everyone belongs there.",
  },
  {
    num: "02",
    title: "Built-In Reach",
    body: "Your membership connects you to 500,000+ CLTBucketlist followers across Instagram, TikTok, and beyond - real Charlotte visibility.",
  },
  {
    num: "03",
    title: "Real Relationships",
    body: "Monthly member events, mastermind sessions, and a private community designed for genuine connection - not card collecting.",
  },
  {
    num: "04",
    title: "Your Brand, Elevated",
    body: "Members get featured placements, collaborative opportunities, and marketing support that amplifies who you are in Charlotte.",
  },
];

const benefits = [
  { title: "Access to exclusive member-only events and mixers" },
  { title: "Mastermind roundtables and accountability sessions" },
  { title: "Private Slack community with vetted members" },
  { title: "Collaborative referrals within the member network" },
  { title: "Featured placement in 704 Collective content and channels" },
  { title: "Member spotlight opportunities across CLTBucketlist platforms" },
  { title: "Early access to events, partnerships, and announcements" },
  { title: "Direct introductions to founders, investors, and key players in Charlotte" },
];

const stats = [
  {
    number: "500K+",
    label: "COMMUNITY REACH",
    desc: "Built on CLTBucketlist's audience - real Charlotte people who trust this brand across Instagram, TikTok, and beyond.",
  },
  {
    number: "Curated",
    label: "EVERY MEMBER",
    desc: "This isn't open enrollment. Every 704 Business member is reviewed. You're joining a room where everyone belongs there.",
  },
  {
    number: "704",
    label: "ROOTED HERE",
    desc: "We're not another national chamber chapter. We're Charlotte-first, Charlotte-built, and exclusively focused on growth in the 704.",
  },
];

function SectionLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          height: "1px",
          width: "40px",
          backgroundColor: "rgba(198,166,100,0.4)",
        }}
      />
      <span
        style={{
          color: "#C6A664",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.25em",
        }}
      >
        {text}
      </span>
      <div
        style={{
          height: "1px",
          width: "40px",
          backgroundColor: "rgba(198,166,100,0.4)",
        }}
      />
    </div>
  );
}

export default function BusinessPage() {
  return (
    <>
      <JsonLd schema={businessServiceSchema704} />
      <Nav />
      <main id="main-content" style={{ paddingTop: "64px" }}>
        <MarketingPageRoot>

        {/* ════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════ */}
        <section
          style={{
            position: "relative",
            minHeight: "88vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {/* Background photo */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "url('/hero-business.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center 40%",
              transform: "scale(1.04)",
              transition: "transform 8s ease-out",
            }}
          />

          {/* Dark overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.75) 60%, rgba(0,0,0,0.90) 100%)",
            }}
          />

          {/* Gold top glow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at center top, rgba(198,166,100,0.08) 0%, transparent 50%)",
              pointerEvents: "none",
            }}
          />

          {/* Gold bottom rule */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "1px",
              background:
                "linear-gradient(to right, transparent, rgba(198,166,100,0.25), transparent)",
            }}
          />

          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: "720px",
              margin: "0 auto",
              padding: "0 24px",
              textAlign: "center",
            }}
          >
            <FadeIn delay={0.2} duration={0.8}>
              <p
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: "24px",
                }}
              >
                704 COLLECTIVE · BUSINESS MEMBERSHIP
              </p>
            </FadeIn>

            <h1
              style={{
                fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                marginBottom: "20px",
                color: "#FAF6F0",
              }}
            >
              <WordReveal text="SCALE YOUR IMPACT. OWN YOUR NETWORK." />
            </h1>

            <FadeUp delay={0.5} duration={0.8}>
              <p
                style={{
                  fontSize: "1.125rem",
                  color: "#A0A0A0",
                  marginBottom: "16px",
                }}
              >
                Charlotte&apos;s Premier Business Membership
              </p>
              <p
                style={{
                  color: "#A0A0A0",
                  fontSize: "clamp(1rem, 2vw, 1.15rem)",
                  maxWidth: "520px",
                  margin: "0 auto 40px auto",
                  lineHeight: 1.7,
                }}
              >
                704 Business is the high-performance division of the Collective - built for entrepreneurs, founders, and elite professionals who are serious about growth in the Queen City.
              </p>
            </FadeUp>

            <FadeUp delay={0.9} duration={0.7}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  justifyContent: "center",
                }}
              >
                <a
                  href="#apply"
                  className="btn-gold"
                  style={{ padding: "16px 36px", fontSize: "0.875rem" }}
                >
                  APPLY NOW
                </a>
                <a
                  href="#pricing"
                  className="btn-ghost-gold"
                  style={{ padding: "16px 36px", fontSize: "0.875rem" }}
                >
                  VIEW PRICING
                </a>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            WHO WE ARE
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}>
          <div
            style={{
              maxWidth: "800px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel text="WHO WE ARE" />
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  marginBottom: "24px",
                  color: "#FAF6F0",
                }}
              >
                BUILT FROM CHARLOTTE&apos;S HEARTBEAT
              </h2>
            </FadeUp>

            <FadeUp delay={0.2}>
              <p
                style={{
                  color: "#A0A0A0",
                  fontSize: "1rem",
                  lineHeight: 1.8,
                  textAlign: "center",
                  marginBottom: "0",
                }}
              >
                704 Business was born from CLTBucketlist - Charlotte&apos;s most trusted lifestyle brand with over 500,000 community members. We built something the city was missing: a curated professional network where trust is built before the meeting happens.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.1}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "24px",
                marginTop: "48px",
              }}
              className="stats-grid"
            >
              {stats.map((s, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: "#2E2E2E",
                    borderRadius: "12px",
                    padding: "28px 20px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: "2rem",
                      fontWeight: 700,
                      color: "#C6A664",
                      marginBottom: "8px",
                      lineHeight: 1,
                    }}
                  >
                    {s.number}
                  </p>
                  <p
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.35)",
                      marginBottom: "8px",
                    }}
                  >
                    {s.label}
                  </p>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "#A0A0A0",
                      lineHeight: 1.6,
                    }}
                  >
                    {s.desc}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            HOW WE'RE DIFFERENT
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#2E2E2E", padding: "80px 24px" }}>
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <FadeUp>
                <SectionLabel text="HOW WE'RE DIFFERENT" />
              </FadeUp>

              <FadeUp delay={0.1}>
                <h2
                  style={{
                    fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                    marginBottom: "16px",
                    color: "#FAF6F0",
                  }}
                >
                  NOT ANOTHER NETWORKING CLUB
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "520px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                    lineHeight: 1.7,
                  }}
                >
                  We&apos;re not a chamber. We&apos;re not a coworking space. We&apos;re a collective of Charlotte&apos;s most driven founders, entrepreneurs, and professionals - people who move fast, think big, and actually show up.
                </p>
              </FadeUp>
            </div>

            <StaggerContainer
              staggerDelay={0.1}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "16px",
              }}
              className="pillars-grid"
            >
              {pillars.map((p, i) => (
                <StaggerItem
                  key={i}
                  className="card-hover"
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "12px",
                    padding: "36px 28px",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      color: "rgba(198,166,100,0.2)",
                      fontSize: "2.5rem",
                      fontWeight: 700,
                      letterSpacing: "-0.05em",
                      marginBottom: "16px",
                    }}
                  >
                    {p.num}
                  </div>
                  <h3
                    style={{
                      color: "#FAF6F0",
                      fontWeight: 600,
                      fontSize: "1.05rem",
                      marginBottom: "10px",
                    }}
                  >
                    {p.title}
                  </h3>
                  <p
                    style={{
                      color: "#A0A0A0",
                      fontSize: "0.8125rem",
                      lineHeight: 1.7,
                    }}
                  >
                    {p.body}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            WHAT MEMBERS GET
        ════════════════════════════════════════════ */}
        <section
          id="benefits"
          style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}
        >
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <FadeUp>
                <SectionLabel text="MEMBERSHIP BENEFITS" />
              </FadeUp>

              <FadeUp delay={0.1}>
                <h2
                  style={{
                    fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                    marginBottom: "12px",
                    color: "#FAF6F0",
                  }}
                >
                  WHAT MEMBERS GET
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "480px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                    lineHeight: 1.6,
                  }}
                >
                  Every benefit is designed to give you visibility, access, and real connections - nothing filler.
                </p>
              </FadeUp>
            </div>

            <StaggerContainer
              staggerDelay={0.06}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
              }}
              className="benefits-grid"
            >
              {benefits.map((b, i) => (
                <StaggerItem
                  key={i}
                  className="card-hover"
                  style={{
                    backgroundColor: "#2E2E2E",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "10px",
                    padding: "20px 20px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      color: "#C6A664",
                      fontSize: "0.875rem",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    ✓
                  </span>
                  <span
                    style={{
                      color: "#FAF6F0",
                      fontSize: "0.875rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {b.title}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            PRICING
        ════════════════════════════════════════════ */}
        <section
          id="pricing"
          style={{ backgroundColor: "#2E2E2E", padding: "80px 24px" }}
        >
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <FadeUp>
                <SectionLabel text="Pricing" />
              </FadeUp>

              <FadeUp delay={0.1}>
                <h2
                  style={{
                    fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.025em",
                    color: "#FAF6F0",
                  }}
                >
                  Membership
                </h2>
              </FadeUp>
            </div>

            <ScaleUp delay={0.2}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "24px",
                }}
                className="pricing-grid"
              >
                {/* Monthly Card */}
                <div
                  style={{
                    backgroundColor: "#111111",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "16px",
                    padding: "36px 28px",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.35)",
                      marginBottom: "20px",
                    }}
                  >
                    MONTHLY
                  </p>
                  <div style={{ marginBottom: "8px" }}>
                    <span
                      style={{
                        fontSize: "clamp(2rem, 5vw, 2.75rem)",
                        fontWeight: 700,
                        color: "#FAF6F0",
                        letterSpacing: "-0.03em",
                      }}
                    >
                      $300
                    </span>
                    <span
                      style={{
                        color: "rgba(250,246,240,0.3)",
                        fontSize: "0.9rem",
                        marginLeft: "4px",
                      }}
                    >
                      /month
                    </span>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8125rem", marginBottom: "4px" }}>
                    Cancel anytime
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.75rem", marginBottom: "32px" }}>
                    Full access, no commitments
                  </p>
                  <a
                    href="/apply/business"
                    className="btn-gold"
                    style={{ padding: "14px 28px", fontSize: "0.875rem", display: "inline-block", width: "100%", boxSizing: "border-box" }}
                  >
                    START MONTHLY
                  </a>
                </div>

                {/* Annual Card */}
                <div
                  style={{
                    backgroundColor: "#111111",
                    border: "1px solid rgba(198,166,100,0.3)",
                    borderRadius: "16px",
                    padding: "36px 28px",
                    textAlign: "center",
                    position: "relative",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      letterSpacing: "0.15em",
                      color: "#C6A664",
                      border: "1px solid rgba(198,166,100,0.4)",
                      borderRadius: "100px",
                      padding: "4px 10px",
                      marginBottom: "12px",
                    }}
                  >
                    BEST VALUE
                  </span>
                  <p
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.35)",
                      marginBottom: "20px",
                    }}
                  >
                    ANNUAL
                  </p>
                  <div style={{ marginBottom: "8px" }}>
                    <span
                      style={{
                        fontSize: "clamp(2rem, 5vw, 2.75rem)",
                        fontWeight: 700,
                        color: "#FAF6F0",
                        letterSpacing: "-0.03em",
                      }}
                    >
                      $3,600
                    </span>
                    <span
                      style={{
                        color: "rgba(250,246,240,0.3)",
                        fontSize: "0.9rem",
                        marginLeft: "4px",
                      }}
                    >
                      /year
                    </span>
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8125rem", marginBottom: "4px" }}>
                    Save $600 vs monthly
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.75rem", marginBottom: "32px" }}>
                    Rate locked for 1 year
                  </p>
                  <a
                    href="/apply/business"
                    className="btn-gold"
                    style={{ padding: "14px 28px", fontSize: "0.875rem", display: "inline-block", width: "100%", boxSizing: "border-box" }}
                  >
                    JOIN ANNUAL
                  </a>
                </div>
              </div>

              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "rgba(255,255,255,0.3)",
                  textAlign: "center",
                  marginTop: "24px",
                  fontStyle: "italic",
                }}
              >
                Joining at the annual rate locks your rate for the full year. Prices will increase as the community grows.
              </p>
            </ScaleUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════ */}
        <section
          id="apply"
          style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}
        >
          <div
            style={{
              maxWidth: "560px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel text="READY TO JOIN" />
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                  fontWeight: 700,
                  color: "#FAF6F0",
                  letterSpacing: "-0.025em",
                  marginBottom: "16px",
                }}
              >
                THIS IS YOUR CITY. OWN IT.
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  color: "#A0A0A0",
                  fontSize: "1rem",
                  lineHeight: 1.7,
                  maxWidth: "480px",
                  margin: "0 auto 8px auto",
                }}
              >
                704 Business is a curated community of Charlotte&apos;s most ambitious professionals who are serious about growth - personally and professionally.
              </p>
            </FadeUp>

            <FadeUp delay={0.2}>
              <p
                style={{
                  fontSize: "0.8125rem",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: "32px",
                }}
              >
                Takes about 3 minutes.
              </p>
            </FadeUp>

            <ScaleUp delay={0.25}>
              <a
                href="/apply/business"
                className="btn-gold"
                style={{ padding: "16px 40px", fontSize: "0.9375rem", display: "inline-block" }}
              >
                APPLY FOR 704 BUSINESS →
              </a>
            </ScaleUp>
          </div>
        </section>

        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}
