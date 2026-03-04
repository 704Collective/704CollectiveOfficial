import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer"
;
import Link from "next/link";
import {
  FadeUp,
  FadeIn,
  SlideIn,
  StaggerContainer,
  StaggerItem,
  ScaleUp,
  DrawLine,
  Parallax,
  WordReveal,
} from "@/components/Animations";
import TiltCard from "@/components/TiltCard";
import HeroDots from "@/components/HeroDots";
import GradientShift from "@/components/GradientShift";

export const metadata: Metadata = {
  title: "704 Collective | Charlotte's Premier Community",
  description:
    "Charlotte's two-tier social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
  openGraph: {
    title: "704 Collective | Charlotte's Premier Community",
    description:
      "Charlotte's two-tier social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
    url: "https://704collective.com",
    siteName: "704 Collective",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "704 Collective - Your City. Your People.",
      },
    ],
    locale: "en_US",
    type: "website",
  },
};

/* ─── Small reusable pieces ─── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </span>
  );
}

/* ─── Page ─── */

export default function Home() {
  return (
    <>
      <Nav />

      <main style={{ paddingTop: "64px" }}>
        {/* ════════════════════════════════════════════
            SECTION 1: HERO
        ════════════════════════════════════════════ */}
        <section
          id="hero"
          style={{
            minHeight: "calc(100vh - 64px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000000",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Subtle radial glow */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "800px",
              height: "800px",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          {/* Animated dot grid */}
          <HeroDots />

          <div
            style={{
              position: "relative",
              maxWidth: "800px",
              margin: "0 auto",
              padding: "80px 24px",
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
                  color: "rgba(255, 255, 255, 0.4)",
                  marginBottom: "24px",
                }}
              >
                Charlotte{"'"}s Premier Community
              </p>
            </FadeIn>

            <h1
              style={{
                fontSize: "clamp(2.5rem, 7vw, 4.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
                color: "#FFFFFF",
                marginBottom: "24px",
              }}
            >
              <WordReveal text="Your City." />
              <br />
              <WordReveal text="Your People." />
            </h1>

            <FadeUp delay={0.6} duration={0.8}>
              <p
                style={{
                  fontSize: "1.125rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.6,
                  maxWidth: "540px",
                  margin: "0 auto 40px auto",
                }}
              >
                A two-tier social club and business membership association for
                the people building, creating, and leading in Charlotte.
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
                <Link href="/social" className="btn-primary">
                  Join 704 Social
                </Link>
                <Link href="/business" className="btn-ghost">
                  Explore 704 Business
                </Link>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 2: WHAT IS 704 COLLECTIVE
        ════════════════════════════════════════════ */}
        <section
          id="about"
          style={{
            backgroundColor: "#1A1A1A",
            padding: "96px 24px",
          }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <FadeUp>
              <SectionLabel>Who We Are</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Two communities. One mission.
              </h2>
            </FadeUp>

            <DrawLine
              direction="horizontal"
              color="linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)"
            />

            <div
              style={{
                fontSize: "1.0625rem",
                color: "rgba(255, 255, 255, 0.6)",
                lineHeight: 1.75,
                textAlign: "center",
                marginTop: "32px",
              }}
            >
              <FadeUp delay={0.2}>
                <p style={{ marginBottom: "20px" }}>
                  704 Collective is Charlotte{"'"}s two-tier social club and
                  business membership association. We connect ambitious
                  professionals, creatives, and business owners through
                  intentional events, real relationships, and a community that
                  actually feels like community.
                </p>
              </FadeUp>

              <FadeUp delay={0.3}>
                <p style={{ marginBottom: "20px" }}>
                  <strong style={{ color: "#FFFFFF" }}>704 Social</strong> is
                  the activity and social side — curated events, wellness
                  experiences, and a built-in friend group in Charlotte. No
                  awkward mixers. Just real people showing up.
                </p>
              </FadeUp>

              <FadeUp delay={0.4}>
                <p>
                  <strong style={{ color: "#FFFFFF" }}>704 Business</strong> is
                  the professional side — monthly member meetings, keynote
                  speakers, closed-door networking, and access to Charlotte{"'"}s
                  inner business circles. Strategic connections that help you
                  grow.
                </p>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 3: HOW IT WORKS
        ════════════════════════════════════════════ */}
        <section
          id="how-it-works"
          style={{
            backgroundColor: "#2E2E2E",
            padding: "96px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "1000px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel>How It Works</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Two paths. Both start here.
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: "1.0625rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.65,
                  maxWidth: "600px",
                  margin: "0 auto",
                }}
              >
                Whether you{"'"}re looking for your people or looking to level up
                your business — getting started is simple.
              </p>
            </FadeUp>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "32px",
                marginTop: "56px",
              }}
              className="how-it-works-grid"
            >
              {/* Social Track */}
              <SlideIn direction="left" delay={0.2}>
                <div
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "16px",
                    padding: "40px 32px",
                    textAlign: "left",
                    height: "100%",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(255, 255, 255, 0.4)",
                      backgroundColor: "rgba(255, 255, 255, 0.06)",
                      padding: "6px 14px",
                      borderRadius: "100px",
                      marginBottom: "28px",
                    }}
                  >
                    704 Social
                  </span>

                  <StaggerContainer staggerDelay={0.15}>
                    {[
                      {
                        step: "01",
                        title: "Join",
                        desc: "Sign up and pay $30/month. No application, no waitlist.",
                      },
                      {
                        step: "02",
                        title: "Show Up",
                        desc: "Pick the events that interest you and start attending. 8+ per month.",
                      },
                      {
                        step: "03",
                        title: "Build Your Circle",
                        desc: "Meet your people, keep showing up, and watch your social life in Charlotte change.",
                      },
                    ].map((item, i) => (
                      <StaggerItem key={i}>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            marginBottom: i < 2 ? "28px" : "0",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: "#C6A664",
                              minWidth: "24px",
                              paddingTop: "3px",
                            }}
                          >
                            {item.step}
                          </span>
                          <div>
                            <h3
                              style={{
                                fontSize: "1rem",
                                fontWeight: 700,
                                color: "#FFFFFF",
                                marginBottom: "4px",
                              }}
                            >
                              {item.title}
                            </h3>
                            <p
                              style={{
                                fontSize: "0.875rem",
                                color: "rgba(255, 255, 255, 0.5)",
                                lineHeight: 1.55,
                              }}
                            >
                              {item.desc}
                            </p>
                          </div>
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerContainer>

                  <Link
                    href="/social"
                    className="btn-primary"
                    style={{
                      display: "inline-block",
                      marginTop: "32px",
                      fontSize: "0.8125rem",
                      padding: "12px 28px",
                    }}
                  >
                    Join 704 Social
                  </Link>
                </div>
              </SlideIn>

              {/* Business Track */}
              <SlideIn direction="right" delay={0.2}>
                <div
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "16px",
                    padding: "40px 32px",
                    textAlign: "left",
                    height: "100%",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "#C6A664",
                      backgroundColor: "rgba(198, 166, 100, 0.1)",
                      padding: "6px 14px",
                      borderRadius: "100px",
                      marginBottom: "28px",
                    }}
                  >
                    704 Business
                  </span>

                  <StaggerContainer staggerDelay={0.15}>
                    {[
                      {
                        step: "01",
                        title: "Apply",
                        desc: "Fill out a short application. Takes about 5 minutes.",
                      },
                      {
                        step: "02",
                        title: "Get Reviewed",
                        desc: "We personally review every application within 24-48 hours.",
                      },
                      {
                        step: "03",
                        title: "Get Connected",
                        desc: "Welcome to Charlotte's inner business circle. Full Social access included.",
                      },
                    ].map((item, i) => (
                      <StaggerItem key={i}>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            marginBottom: i < 2 ? "28px" : "0",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: "#C6A664",
                              minWidth: "24px",
                              paddingTop: "3px",
                            }}
                          >
                            {item.step}
                          </span>
                          <div>
                            <h3
                              style={{
                                fontSize: "1rem",
                                fontWeight: 700,
                                color: "#FFFFFF",
                                marginBottom: "4px",
                              }}
                            >
                              {item.title}
                            </h3>
                            <p
                              style={{
                                fontSize: "0.875rem",
                                color: "rgba(255, 255, 255, 0.5)",
                                lineHeight: 1.55,
                              }}
                            >
                              {item.desc}
                            </p>
                          </div>
                        </div>
                      </StaggerItem>
                    ))}
                  </StaggerContainer>

                  <Link
                    href="/business#apply"
                    className="btn-ghost"
                    style={{
                      display: "inline-block",
                      marginTop: "32px",
                      fontSize: "0.8125rem",
                      padding: "12px 28px",
                    }}
                  >
                    Apply for 704 Business
                  </Link>
                </div>
              </SlideIn>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 4: TWO MEMBERSHIP TIERS
        ════════════════════════════════════════════ */}
        <section
          id="membership"
          style={{
            backgroundColor: "#000000",
            padding: "96px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "1000px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel>Membership</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Choose your path
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: "1.0625rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.65,
                  maxWidth: "600px",
                  margin: "0 auto",
                }}
              >
                Both tiers give you access to a curated community. Business
                members get everything in Social — plus a +1 to every social
                event.
              </p>
            </FadeUp>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "24px",
                marginTop: "56px",
              }}
              className="tier-grid"
            >
              {/* Social Tier */}
              <ScaleUp delay={0.2}>
                <TiltCard
                  className="card-hover"
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "16px",
                    padding: "44px 32px",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    height: "100%",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        marginBottom: "4px",
                      }}
                    >
                      704 Social
                    </h3>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginBottom: "20px",
                      }}
                    >
                      Activity club & social community
                    </p>

                    <div style={{ marginBottom: "28px" }}>
                      <span
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 700,
                          color: "#FFFFFF",
                        }}
                      >
                        $30
                      </span>
                      <span
                        style={{
                          fontSize: "1rem",
                          color: "rgba(255, 255, 255, 0.4)",
                        }}
                      >
                        {" "}
                        / month
                      </span>
                    </div>

                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {[
                        "8+ curated events every month",
                        "Social mixers & happy hours",
                        "Wellness & adventure days",
                        "Priority RSVP access",
                        "Exclusive co-ed community",
                        "Cancel anytime",
                      ].map((item, i) => (
                        <li
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            fontSize: "0.875rem",
                            color: "rgba(255, 255, 255, 0.65)",
                            marginBottom: "12px",
                            lineHeight: 1.5,
                          }}
                        >
                          <span
                            style={{
                              color: "#C6A664",
                              fontWeight: 700,
                              marginTop: "1px",
                            }}
                          >
                            {"✓"}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href="/social"
                    className="btn-primary"
                    style={{
                      display: "block",
                      textAlign: "center",
                      marginTop: "32px",
                      padding: "14px 28px",
                      fontSize: "0.875rem",
                    }}
                  >
                    Join 704 Social
                  </Link>
                </TiltCard>
              </ScaleUp>

              {/* Business Tier */}
              <ScaleUp delay={0.35}>
                <TiltCard
                  className="card-hover"
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(198, 166, 100, 0.2)",
                    borderRadius: "16px",
                    padding: "44px 32px",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    position: "relative",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "32px",
                      right: "32px",
                      height: "1px",
                      background:
                        "linear-gradient(90deg, transparent, #C6A664, transparent)",
                    }}
                  />

                  <div>
                    <h3
                      style={{
                        fontSize: "1.5rem",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        marginBottom: "4px",
                      }}
                    >
                      704 Business
                    </h3>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginBottom: "20px",
                      }}
                    >
                      Business membership association
                    </p>

                    <div style={{ marginBottom: "8px" }}>
                      <span
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 700,
                          color: "#FFFFFF",
                        }}
                      >
                        $300
                      </span>
                      <span
                        style={{
                          fontSize: "1rem",
                          color: "rgba(255, 255, 255, 0.4)",
                        }}
                      >
                        {" "}
                        / month
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "rgba(255, 255, 255, 0.35)",
                        marginBottom: "28px",
                      }}
                    >
                      or $3,600/year (save $600)
                    </p>

                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {[
                        "Everything in 704 Social",
                        "+1 to all social events",
                        "Monthly member meetings",
                        "Keynote speaker events",
                        "Closed-door networking",
                        "Referral & collaboration opportunities",
                        "City of Charlotte economic development access",
                        "Member-only digital portal",
                        "Cancel anytime",
                      ].map((item, i) => (
                        <li
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            fontSize: "0.875rem",
                            color: "rgba(255, 255, 255, 0.65)",
                            marginBottom: "12px",
                            lineHeight: 1.5,
                          }}
                        >
                          <span
                            style={{
                              color: "#C6A664",
                              fontWeight: 700,
                              marginTop: "1px",
                            }}
                          >
                            {"✓"}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    href="/business#apply"
                    className="btn-ghost"
                    style={{
                      display: "block",
                      textAlign: "center",
                      marginTop: "32px",
                      padding: "14px 28px",
                      fontSize: "0.875rem",
                      borderColor: "rgba(198, 166, 100, 0.3)",
                      color: "#C6A664",
                    }}
                  >
                    Apply for 704 Business
                  </Link>
                </TiltCard>
              </ScaleUp>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 5: WHAT MEMBERS GET
        ════════════════════════════════════════════ */}
        <section
          id="perks"
          style={{
            backgroundColor: "#1A1A1A",
            padding: "96px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "1000px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel>What You Get</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                More than a membership
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: "1.0625rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.65,
                  maxWidth: "600px",
                  margin: "0 auto",
                }}
              >
                From wellness experiences to business strategy sessions —
                here{"'"}s what{"'"}s waiting inside.
              </p>
            </FadeUp>

            {/* Social Perks */}
            <div style={{ marginTop: "56px", marginBottom: "56px" }}>
              <FadeIn>
                <h3
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(255, 255, 255, 0.35)",
                    marginBottom: "24px",
                  }}
                >
                  704 Social Perks
                </h3>
              </FadeIn>

              <StaggerContainer
                staggerDelay={0.08}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "16px",
                }}
                className="perks-grid"
              >
                {[
                  {
                    title: "Curated Social Events",
                    desc: "Mixers, happy hours, game nights, and themed socials every week.",
                  },
                  {
                    title: "Wellness & Adventure",
                    desc: "Cold plunge, sauna sessions, run clubs, cycling, and outdoor adventures.",
                  },
                  {
                    title: "Priority Access",
                    desc: "RSVP before the public. Limited spots, members always come first.",
                  },
                  {
                    title: "Real Community",
                    desc: "An exclusive co-ed group of people you actually want to spend time with.",
                  },
                  {
                    title: "Member Perks",
                    desc: "Special access and experiences across Charlotte, powered by CLTBucketlist.",
                  },
                  {
                    title: "No Commitment",
                    desc: "Cancel anytime. No contracts, no cancellation fees.",
                  },
                ].map((item, i) => (
                  <StaggerItem
                    key={i}
                    style={{
                      backgroundColor: "#2E2E2E",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                      borderRadius: "12px",
                      padding: "28px 24px",
                      textAlign: "left",
                      transition: "all 200ms ease",
                    }}
                    className="card-hover"
                  >
                    <h4
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        marginBottom: "8px",
                      }}
                    >
                      {item.title}
                    </h4>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "rgba(255, 255, 255, 0.5)",
                        lineHeight: 1.55,
                      }}
                    >
                      {item.desc}
                    </p>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>

            {/* Divider */}
            <DrawLine
              direction="horizontal"
              color="linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)"
            />

            {/* Business Perks */}
            <div style={{ marginTop: "56px" }}>
              <FadeIn>
                <h3
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#C6A664",
                    marginBottom: "24px",
                  }}
                >
                  704 Business Adds
                </h3>
              </FadeIn>

              <StaggerContainer
                staggerDelay={0.08}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "16px",
                }}
                className="perks-grid"
              >
                {[
                  {
                    title: "Monthly Member Meetings",
                    desc: "Structured sessions with Charlotte's top professionals. Real strategy, real accountability.",
                  },
                  {
                    title: "Keynote Speakers",
                    desc: "Relevant local business leaders sharing insights in intimate, member-only settings.",
                  },
                  {
                    title: "Closed-Door Networking",
                    desc: "Open and closed networking events designed for real business conversations.",
                  },
                  {
                    title: "Referral Network",
                    desc: "Collaboration and referral opportunities within a high-trust professional ecosystem.",
                  },
                  {
                    title: "Economic Development Access",
                    desc: "Exclusive connections to City of Charlotte's economic development programs and leadership.",
                  },
                  {
                    title: "Full Social Access + Guest",
                    desc: "Everything in 704 Social, plus bring a +1 to every social event.",
                  },
                ].map((item, i) => (
                  <StaggerItem
                    key={i}
                    style={{
                      backgroundColor: "#2E2E2E",
                      border: "1px solid rgba(198, 166, 100, 0.08)",
                      borderRadius: "12px",
                      padding: "28px 24px",
                      textAlign: "left",
                      transition: "all 200ms ease",
                    }}
                    className="card-hover"
                  >
                    <h4
                      style={{
                        fontSize: "0.9375rem",
                        fontWeight: 700,
                        color: "#FFFFFF",
                        marginBottom: "8px",
                      }}
                    >
                      {item.title}
                    </h4>
                    <p
                      style={{
                        fontSize: "0.8125rem",
                        color: "rgba(255, 255, 255, 0.5)",
                        lineHeight: 1.55,
                      }}
                    >
                      {item.desc}
                    </p>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 6: EVENTS PREVIEW
        ════════════════════════════════════════════ */}
        <section
          id="events"
          style={{
            backgroundColor: "#2E2E2E",
            padding: "96px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "1000px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel>Events</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Something for every side of you
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: "1.0625rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.65,
                  maxWidth: "600px",
                  margin: "0 auto",
                }}
              >
                Social events build your circle. Business events build your
                career. Both build something that lasts.
              </p>
            </FadeUp>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "32px",
                marginTop: "56px",
              }}
              className="events-grid"
            >
              {/* Social Events */}
              <SlideIn direction="left" delay={0.2}>
                <div
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "16px",
                    padding: "36px 28px",
                    textAlign: "left",
                    height: "100%",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      color: "#FFFFFF",
                      marginBottom: "6px",
                    }}
                  >
                    Social Events
                  </h3>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "rgba(255, 255, 255, 0.4)",
                      marginBottom: "24px",
                    }}
                  >
                    Included with 704 Social ($30/mo)
                  </p>

                  {[
                    "Coffee & Connect mornings",
                    "Happy hours & themed socials",
                    "Board game & trivia nights",
                    "Cold plunge & sauna sessions",
                    "Run clubs & cycling",
                    "Outdoor adventure days",
                    "Blinders socials & mixers",
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.875rem",
                        color: "rgba(255, 255, 255, 0.6)",
                        marginBottom: "12px",
                      }}
                    >
                      <span
                        style={{
                          width: "4px",
                          height: "4px",
                          borderRadius: "50%",
                          backgroundColor: "rgba(255, 255, 255, 0.3)",
                          flexShrink: 0,
                        }}
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </SlideIn>

              {/* Business Events */}
              <SlideIn direction="right" delay={0.2}>
                <div
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(198, 166, 100, 0.1)",
                    borderRadius: "16px",
                    padding: "36px 28px",
                    textAlign: "left",
                    height: "100%",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: 700,
                      color: "#FFFFFF",
                      marginBottom: "6px",
                    }}
                  >
                    Business Events
                  </h3>
                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "rgba(198, 166, 100, 0.6)",
                      marginBottom: "24px",
                    }}
                  >
                    Included with 704 Business ($300/mo) — plus all Social
                    events
                  </p>

                  {[
                    "Monthly member meetings",
                    "Open & closed networking events",
                    "Local keynote speaker events",
                    "Targeted conferences",
                    "Exclusive member-only events",
                    "Team trips & experiences",
                    "Pre-launch business introductions",
                  ].map((item, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.875rem",
                        color: "rgba(255, 255, 255, 0.6)",
                        marginBottom: "12px",
                      }}
                    >
                      <span
                        style={{
                          width: "4px",
                          height: "4px",
                          borderRadius: "50%",
                          backgroundColor: "#C6A664",
                          flexShrink: 0,
                        }}
                      />
                      {item}
                    </div>
                  ))}
                </div>
              </SlideIn>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 7: TESTIMONIALS (PLACEHOLDER)
        ════════════════════════════════════════════ */}
        <section
          style={{
            backgroundColor: "#000000",
            padding: "96px 24px",
          }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <FadeUp>
              <SectionLabel>What Members Say</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Real people. Real words.
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.15}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "20px",
                marginTop: "48px",
              }}
              className="testimonial-grid"
            >
              {[1, 2, 3].map((i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "12px",
                    padding: "28px 24px",
                    textAlign: "left",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "rgba(255, 255, 255, 0.5)",
                      lineHeight: 1.6,
                      fontStyle: "italic",
                      marginBottom: "20px",
                    }}
                  >
                    {'"'}Member testimonial coming soon.{'"'}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        backgroundColor: "#2E2E2E",
                      }}
                    />
                    <div>
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          color: "rgba(255, 255, 255, 0.6)",
                        }}
                      >
                        Member Name
                      </p>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "rgba(255, 255, 255, 0.3)",
                        }}
                      >
                        Title / Company
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 8: APPLY CTAs
        ════════════════════════════════════════════ */}
        <GradientShift
          style={{
            backgroundColor: "#1A1A1A",
            padding: "96px 24px",
          }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <FadeUp>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Ready to join Charlotte{"'"}s inner circle?
              </h2>
            </FadeUp>

            <FadeUp delay={0.1}>
              <p
                style={{
                  fontSize: "1.0625rem",
                  color: "rgba(255, 255, 255, 0.55)",
                  lineHeight: 1.65,
                  maxWidth: "600px",
                  margin: "0 auto",
                }}
              >
                Whether you{"'"}re here for the community or the business
                connections — your people are already inside.
              </p>
            </FadeUp>

            <ScaleUp delay={0.2}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  justifyContent: "center",
                  marginTop: "40px",
                }}
              >
                <Link
                  href="/social"
                  className="btn-primary"
                  style={{ padding: "16px 36px", fontSize: "0.9375rem" }}
                >
                  Join 704 Social — $30/mo
                </Link>
                <Link
                  href="/business#apply"
                  className="btn-ghost"
                  style={{ padding: "16px 36px", fontSize: "0.9375rem" }}
                >
                  Apply for 704 Business
                </Link>
              </div>
            </ScaleUp>
          </div>
        </GradientShift>

        {/* ════════════════════════════════════════════
            SECTION 9: SMALL FAQ
        ════════════════════════════════════════════ */}
        <section
          id="faq"
          style={{
            backgroundColor: "#2E2E2E",
            padding: "96px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "700px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel>FAQ</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                  color: "#FFFFFF",
                  marginBottom: "16px",
                }}
              >
                Quick answers
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.1}
              style={{ marginTop: "40px", textAlign: "left" }}
            >
              {[
                {
                  q: "What is 704 Collective?",
                  a: "704 Collective is Charlotte's two-tier social club and business membership association. 704 Social is the activity and community side — curated events, wellness experiences, and a real social circle. 704 Business is the professional side — monthly meetings, keynote speakers, exclusive networking, and access to Charlotte's inner business circles.",
                },
                {
                  q: "What's the difference between Social and Business?",
                  a: "704 Social ($30/month) gives you access to 8+ curated events per month — mixers, wellness days, adventure outings, and community. 704 Business ($300/month) includes everything in Social, plus monthly business meetings, keynote speakers, closed-door networking, referral opportunities, and a +1 to every social event.",
                },
                {
                  q: "Do I need to apply?",
                  a: "For 704 Social, no — just join and start showing up. For 704 Business, yes — we review every application personally to keep the community high-quality and intentional. It takes about 5 minutes and we respond within 24-48 hours.",
                },
                {
                  q: "Can I cancel anytime?",
                  a: "Yes. Monthly members can cancel before their next billing date with no fees. Annual Business members commit for the year but lock in their rate and save $600.",
                },
                {
                  q: "Who runs 704 Collective?",
                  a: "704 Collective is built by the team behind CLTBucketlist.com — Charlotte's go-to local guide platform. Years of producing high-impact events and working with hundreds of local businesses gave us the foundation to build something deeper.",
                },
              ].map((item, i) => (
                <StaggerItem key={i}>
                  <details
                    className="faq-item"
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      padding: "20px 0",
                    }}
                  >
                    <summary
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        listStyle: "none",
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "#FFFFFF",
                      }}
                    >
                      {item.q}
                      <span
                        style={{
                          color: "#C6A664",
                          fontSize: "1.25rem",
                          fontWeight: 300,
                          flexShrink: 0,
                          marginLeft: "16px",
                          transition: "transform 200ms ease",
                        }}
                      >
                        +
                      </span>
                    </summary>
                    <p
                      style={{
                        fontSize: "0.875rem",
                        color: "rgba(255, 255, 255, 0.55)",
                        lineHeight: 1.65,
                        marginTop: "12px",
                        paddingRight: "32px",
                      }}
                    >
                      {item.a}
                    </p>
                  </details>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}