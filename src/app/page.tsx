import type { Metadata } from "next";
import Image from "next/image";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer";
import Link from "next/link";
import { HERO_BLUR_DATA_URL } from "@/lib/heroBlur";
import { getFeaturedPartnerLogos } from "@/lib/partnerFeatured";
import { FeaturedPartnersCarousel } from "@/components/partners/FeaturedPartnersCarousel";
import {
  FadeUp,
  FadeIn,
  SlideIn,
  StaggerContainer,
  StaggerItem,
  ScaleUp,
  DrawLine,
  WordReveal,
} from "@/components/Animations";
import TiltCard from "@/components/TiltCard";
import GradientShift from "@/components/GradientShift";
import { MarketingPageRoot } from "@/components/MarketingPageRoot";
import JsonLd from "@/components/JsonLd";
import { websiteSchema704, organizationSchema704 } from "@/lib/jsonLdSchemas";
import { PromoBanner } from "@/components/PromoBanner";
import { SlideshowWidget } from "@/components/SlideshowWidget";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "704 Collective | Where Charlotte Connects",
  description:
    "Charlotte's two-track social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
  openGraph: {
    title: "704 Collective | Where Charlotte Connects",
    description:
      "Charlotte's two-track social club and business membership association. Curated events, real connections, and a community built for people who are building something.",
    url: "https://704collective.com",
    siteName: "704 Collective",
    images: [
      {
        url: "https://704collective.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "704 Collective",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "704 Collective | Where Charlotte Connects",
    description:
      "Charlotte's two-track social club and business membership association. Curated events, real connections, and community.",
    images: ["https://704collective.com/og-image.png"],
  },
  alternates: { canonical: "https://704collective.com" },
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

export default async function Home() {
  const featuredPartners = await getFeaturedPartnerLogos();

  return (
    <>
      <JsonLd schema={[organizationSchema704, websiteSchema704]} />
      <PromoBanner />
      <Nav />

      <main id="main-content" style={{ paddingTop: "calc(64px + var(--banner-height, 0px))" }}>
        <MarketingPageRoot>
        {/* ════════════════════════════════════════════
            SECTION 1: HERO
        ════════════════════════════════════════════ */}
        <section
          id="hero"
          style={{
            minHeight: "70vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background photo */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              transform: "scale(1.04)",
              transition: "transform 8s ease-out",
            }}
          >
            <Image
              src="/hero-home.jpg"
              alt=""
              fill
              priority
              placeholder="blur"
              blurDataURL={HERO_BLUR_DATA_URL}
              className="object-cover object-[center_30%]"
              sizes="100vw"
            />
          </div>

          {/* Dark overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.70) 60%, rgba(0,0,0,0.85) 100%)",
            }}
          />

          {/* Gold vignette edge */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              maxWidth: "800px",
              margin: "0 auto",
              padding: "64px 24px",
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
                WHERE CHARLOTTE CONNECTS
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
              <WordReveal text="704 Collective" />
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
                Charlotte&apos;s members-only community for young professionals — built around 10 curated experiences every month and the people worth knowing in this city.
              </p>
            </FadeUp>

            <FadeUp delay={0.9} duration={0.7}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <Link href="#perks" className="btn-primary">
                  Explore the Community
                </Link>
                <Link href="/events" className="btn-ghost">
                  See Upcoming Events →
                </Link>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 2: WHO WE ARE
        ════════════════════════════════════════════ */}
        <section
          id="about"
          style={{
            backgroundColor: "#1A1A1A",
            padding: "72px 24px",
          }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <FadeUp>
              <SectionLabel>WHO WE ARE</SectionLabel>
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
                Your city. Your people.
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
                  704 Collective is Charlotte&apos;s membership community — built two ways.
                </p>
              </FadeUp>

              <FadeUp delay={0.3}>
                <p style={{ marginBottom: "20px" }}>
                  704 Social is for people who want more out of Charlotte. Curated events, real friendships, and a community where showing up once leads to showing up again.
                </p>
              </FadeUp>

              <FadeUp delay={0.35}>
                <p style={{ marginBottom: "20px" }}>
                  704 Business is for founders, creatives, and operators serious about growth. Mastermind sessions, keynote rooms, and direct access to the people shaping this city. The kind of room that&apos;s hard to get into on your own.
                </p>
              </FadeUp>

              <FadeUp delay={0.4}>
                <p style={{ marginBottom: "20px" }}>
                  Most &ldquo;communities&rdquo; in Charlotte are either a happy hour with a hashtag or a $5,000 networking group full of people trying to sell you something. We built 704 because we were tired of both.
                </p>
              </FadeUp>

              <FadeUp delay={0.45}>
                <p>
                  This is the one people keep telling us they&apos;ve been looking for.
                </p>
              </FadeUp>
            </div>

            {/* Photo Slideshow — crossfade */}
            <div style={{ marginTop: '48px', width: '100%', maxWidth: '900px', margin: '48px auto 0', position: 'relative', borderRadius: '16px', overflow: 'hidden' }}>
              <style>{`
                .slide-img {
                  position: absolute;
                  inset: 0;
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                  opacity: 0;
                  transition: opacity 0.8s ease-in-out;
                }
                .slide-img.active {
                  opacity: 1;
                }
                .slideshow-container {
                  position: relative;
                  width: 100%;
                  aspect-ratio: 3/2;
                  background: #2E2E2E;
                  border-radius: 16px;
                  overflow: hidden;
                }
                .slideshow-arrow {
                  position: absolute;
                  top: 50%;
                  transform: translateY(-50%);
                  background: rgba(0,0,0,0.45);
                  border: none;
                  border-radius: 50%;
                  width: 40px;
                  height: 40px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                  z-index: 10;
                  color: #FFFFFF;
                  transition: background 200ms ease;
                }
                .slideshow-arrow:hover { background: rgba(0,0,0,0.7); }
                .slideshow-arrow.prev { left: 12px; }
                .slideshow-arrow.next { right: 12px; }
                .slideshow-dots {
                  position: absolute;
                  bottom: 12px;
                  left: 50%;
                  transform: translateX(-50%);
                  display: flex;
                  gap: 6px;
                  z-index: 10;
                }
                .slideshow-dot {
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  background: rgba(255,255,255,0.4);
                  border: none;
                  cursor: pointer;
                  padding: 0;
                  transition: background 200ms ease;
                }
                .slideshow-dot.active { background: #FFFFFF; }
              `}</style>
              <SlideshowWidget photos={[
                'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/CH2A9737%20(1).jpg',
                'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/CH2A9805%20(1).jpg',
                'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/CH2A9841%20(1).jpg',
                'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/CH2A9875%20(1).jpg',
                'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/IMG_1534%20(1).jpg',
                'https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/Tezza-4591%20(1)%20(1).jpg',
              ]} />
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FEATURED PARTNERS
        ════════════════════════════════════════════ */}
        {featuredPartners.length > 0 && (
          <section
            id="partners"
            style={{
              backgroundColor: "#F5F0E8",
              padding: "72px 24px",
            }}
          >
            <div style={{ maxWidth: "1000px", margin: "0 auto", textAlign: "center" }}>
              <FadeUp>
                <h2
                  style={{
                    fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "#1A1A1A",
                    marginBottom: "12px",
                  }}
                >
                  Our Partners
                </h2>
                <div
                  style={{
                    width: "56px",
                    height: "3px",
                    backgroundColor: "#C6A664",
                    borderRadius: "2px",
                    margin: "0 auto 32px",
                  }}
                  aria-hidden
                />
              </FadeUp>
              <FeaturedPartnersCarousel partners={featuredPartners} />
            </div>
          </section>
        )}

        {/* ════════════════════════════════════════════
            SECTION 5: WHAT MEMBERS GET
        ════════════════════════════════════════════ */}
        <section
          id="perks"
          style={{
            backgroundColor: "#1A1A1A",
            padding: "72px 24px",
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
              <SectionLabel>WHAT YOU GET</SectionLabel>
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
                More than a membership.
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
                Here&apos;s what&apos;s waiting inside.
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
                    desc: "10 planned events every month — happy hours, dinners, rooftop nights, and more.",
                  },
                  {
                    title: "Wellness & Adventure",
                    desc: "Cold plunge, hot yoga, hikes, pickleball — activities that actually get you moving.",
                  },
                  {
                    title: "Priority Access",
                    desc: "RSVP before anyone else. Members always get first pick on limited-capacity events.",
                  },
                  {
                    title: "Real Community",
                    desc: "A group chat, familiar faces, and people who actually remember your name.",
                  },
                  {
                    title: "Member Perks",
                    desc: "Exclusive discounts and deals through our CLTBucketlist partner network.",
                  },
                  {
                    title: "No Commitment",
                    desc: "Cancel anytime. No contracts, no cancellation fees, no guilt trips.",
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
                    desc: "Structured mastermind sessions with Charlotte's most driven professionals.",
                  },
                  {
                    title: "Keynote Speakers",
                    desc: "Exclusive access to industry leaders and founders sharing real playbooks.",
                  },
                  {
                    title: "Closed-Door Networking",
                    desc: "Invite-only rooms. No cold intros — just warm, curated connections.",
                  },
                  {
                    title: "Referral Network",
                    desc: "A built-in system for sending and receiving business between members.",
                  },
                  {
                    title: "Economic Development Access",
                    desc: "Direct lines to Charlotte's growth ecosystem and decision-makers.",
                  },
                  {
                    title: "Full Social Access + Guest",
                    desc: "Everything in Social included, plus a guest pass every month.",
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
            SECTION 7: TESTIMONIALS
        ════════════════════════════════════════════ */}
        <section
          style={{
            backgroundColor: "#000000",
            padding: "72px 24px",
          }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <FadeUp>
              <SectionLabel>WHAT MEMBERS SAY</SectionLabel>
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
                Don&apos;t take our word for it.
              </h2>
            </FadeUp>

            <FadeUp delay={0.15}>
              <p
                style={{
                  fontSize: "1rem",
                  color: "rgba(255,255,255,0.45)",
                  marginBottom: "48px",
                }}
              >
                100 members in. Zero regrets reported.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.15}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "20px",
              }}
              className="testimonial-grid"
            >
              {[
                {
                  quote: "704 makes it so easy to hit fun events — especially the health and wellness ones, my personal fave — and I get to meet so many new people every time!!",
                  name: "Sydney",
                  role: "Member",
                  avatar: "https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/Sydney.jpg",
                },
                {
                  quote: "Joining 704 was a great decision, there's so many events and everyone I've met has been great.",
                  name: "Nick",
                  role: "Member",
                  avatar: "https://bnmtynevbuplqpuqvmna.supabase.co/storage/v1/object/public/public-assets/Nick.jpg",
                },
              ].map((item, i) => (
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
                      color: "rgba(255, 255, 255, 0.65)",
                      lineHeight: 1.65,
                      fontStyle: "italic",
                      marginBottom: "20px",
                    }}
                  >
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <Image
                      src={item.avatar}
                      alt={item.name}
                      width={36}
                      height={36}
                      style={{ borderRadius: '50%', objectFit: 'cover', width: '36px', height: '36px', flexShrink: 0 }}
                      unoptimized
                    />
                    <div>
                      <p
                        style={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          color: "#FFFFFF",
                        }}
                      >
                        {item.name}
                      </p>
                      <p
                        style={{
                          fontSize: "0.75rem",
                          color: "rgba(255, 255, 255, 0.3)",
                        }}
                      >
                        {item.role}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            SECTION 4: TWO MEMBERSHIP TIERS
        ════════════════════════════════════════════ */}
        <section
          id="membership"
          style={{
            backgroundColor: "#000000",
            padding: "72px 24px",
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
              <SectionLabel>TWO TIERS. ONE COMMUNITY.</SectionLabel>
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
                Find your fit.
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
                Whether you&apos;re here for the social life or the business edge — there&apos;s a place for you.
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
                    <p
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: "#C6A664",
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      SOCIAL TIER
                    </p>
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
                      Your social life, handled.
                    </p>

                    <div style={{ marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "2.25rem",
                          fontWeight: 700,
                          color: "#FFFFFF",
                        }}
                      >
                        $35
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
                        fontSize: "0.75rem",
                        color: "rgba(255, 255, 255, 0.4)",
                        marginBottom: "20px",
                      }}
                    >
                      Goes to $49/mo on May 1st
                    </p>

                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {[
                        "10 curated events every month",
                        "Happy hours, dinners & adventures",
                        "Wellness & workout days",
                        "Coffee & pastries every Wednesday",
                        "Priority RSVP access",
                        "Digital membership card",
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
                    Explore Social
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
                        marginBottom: "8px",
                      }}
                    >
                      PREMIUM
                    </span>
                    <p
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        color: "#C6A664",
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      BUSINESS TIER
                    </p>
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
                      Scale your impact. Own your network.
                    </p>

                    <div style={{ marginBottom: "28px" }}>
                      <span
                        style={{
                          fontSize: "1.25rem",
                          fontWeight: 700,
                          color: "#FFFFFF",
                        }}
                      >
                        Starting at $300/mo
                      </span>
                    </div>

                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {[
                        "Everything in Social",
                        "Mastermind roundtables",
                        "Member spotlights & brand amplification",
                        "Private Slack community",
                        "Featured placements & introductions",
                        "Host your own events through the platform",
                        "Application required",
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
                    href="/business"
                    className="btn-primary"
                    style={{
                      display: "block",
                      textAlign: "center",
                      marginTop: "32px",
                      padding: "14px 28px",
                      fontSize: "0.875rem",
                    }}
                  >
                    Explore Business
                  </Link>
                </TiltCard>
              </ScaleUp>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            NEW SECTION: WHY 704 COLLECTIVE
        ════════════════════════════════════════════ */}
        <section
          id="why"
          style={{
            backgroundColor: "#2E2E2E",
            padding: "72px 24px",
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
              <SectionLabel>THE COMMUNITY</SectionLabel>
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
                Why 704 Collective.
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
                Most communities are dead in three months. Ours is just getting started.
              </p>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.1}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
                marginTop: "56px",
              }}
              className="perks-grid"
            >
              {[
                {
                  num: "01",
                  title: "Intentionally Small",
                  desc: "Other Charlotte groups pack 600 people into a room and call it networking. We cap events at 20-40 so you actually remember the people you met.",
                },
                {
                  num: "02",
                  title: "Built for Charlotte",
                  desc: "Born from CLTBucketlist — 500,000 members deep. We didn't move here and start a community. We built one from the city we already knew.",
                },
                {
                  num: "03",
                  title: "No Performance Required",
                  desc: "No name tags. No elevator pitches. No awkward circles. Real spaces, real people, and conversations that actually go somewhere.",
                },
              ].map((item, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "12px",
                    padding: "28px 24px",
                    textAlign: "left",
                    transition: "all 200ms ease",
                  }}
                  className="card-hover"
                >
                  <p
                    style={{
                      fontSize: "2rem",
                      fontWeight: 700,
                      color: "rgba(198,166,100,0.2)",
                      marginBottom: "12px",
                      lineHeight: 1,
                    }}
                  >
                    {item.num}
                  </p>
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
        </section>

        {/* ════════════════════════════════════════════
            SECTION 9: FAQ
        ════════════════════════════════════════════ */}
        <section
          id="faq"
          style={{
            backgroundColor: "#2E2E2E",
            padding: "72px 24px",
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
              <SectionLabel>COMMON QUESTIONS</SectionLabel>
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
                FAQ
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.1}
              style={{ marginTop: "40px", textAlign: "left" }}
            >
              {[
                {
                  q: "What is 704 Collective?",
                  a: "704 Collective is Charlotte's members-only community for young professionals — two tracks, one community. 704 Social is built around 10 curated experiences every month and the friendships that come from actually showing up. 704 Business is the professional side — mastermind sessions, keynote rooms, referral networks, and direct access to Charlotte's most driven founders and operators.",
                },
                {
                  q: "What does my membership cover?",
                  a: "Social members get full access to all 10+ monthly events — happy hours, dinners, wellness days, adventures, and member-only experiences. Business members get everything in Social plus mastermind roundtables, keynote speakers, a private Slack community, featured placements, and more.",
                },
                {
                  q: "What kind of events do you host?",
                  a: "Happy hours at Charlotte's best spots, cold plunge and sauna nights, coffee meetups, rooftop hangouts, group dinners, game nights, pickleball, hikes, volunteer days, and member-only experiences. On the business side: mastermind sessions, keynote speaker events, closed-door networking, and member spotlights.",
                },
                {
                  q: "How much does it cost?",
                  a: "704 Social is $35/month — going to $49/month on May 1st. 704 Business starts at $300/month or $3,600/year (save $600). No contracts, cancel anytime.",
                },
                {
                  q: "Do I have to attend every event?",
                  a: "Not at all. Come to as many or as few as you want. There are 10+ every month so you can pick what fits your schedule and interests.",
                },
                {
                  q: "Do I need to apply?",
                  a: "For 704 Social, no. Just join and you're in immediately. For 704 Business, yes — we review every application personally to keep the room intentional. Takes about 3 minutes.",
                },
                {
                  q: "Can I bring guests?",
                  a: "Business members get a guest pass every month. Social members can bring guests to select events — check each event for guest policy details.",
                },
                {
                  q: "What if I'm new to Charlotte?",
                  a: "This is literally built for you. Whether you just moved here or have lived here for years and never found your people, 704 is the fastest way to build a real life in this city.",
                },
                {
                  q: "How is this different from other Charlotte groups?",
                  a: "We keep events small — 20 to 40 people — so you actually meet someone. No name tags, no elevator pitches, no awkward circles. And we've been building in Charlotte for years through CLTBucketlist, so we know this city and the people in it.",
                },
                {
                  q: "Is there a contract or cancellation fee?",
                  a: "No contract, no fees. Monthly Social members cancel anytime before their next billing date. Annual Business members commit for the year but lock in their rate. No hard feelings, no hoops.",
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
        {/* ════════════════════════════════════════════
            SECTION 8: FINAL CTA
        ════════════════════════════════════════════ */}
        <GradientShift
          style={{
            backgroundColor: "#1A1A1A",
            padding: "72px 24px",
          }}
        >
          <div
            style={{ maxWidth: "800px", margin: "0 auto", textAlign: "center" }}
          >
            <FadeUp>
              <SectionLabel>JOIN BEFORE MAY 1ST</SectionLabel>
            </FadeUp>

            <FadeUp delay={0.05}>
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
                Ready to find your people?
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
                $35/month. 10 curated events. Charlotte&apos;s most intentional young professional community. Goes to $49/month on May 1st.
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
                  href="/join?plan=social"
                  className="btn-primary"
                  style={{ padding: "16px 36px", fontSize: "0.9375rem" }}
                >
                  Join Social
                </Link>
                <Link
                  href="/business"
                  className="btn-ghost"
                  style={{ padding: "16px 36px", fontSize: "0.9375rem" }}
                >
                  Explore Business
                </Link>
              </div>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "rgba(255,255,255,0.25)",
                  marginTop: "24px",
                }}
              >
                Cancel anytime. No application for Social.
              </p>
            </ScaleUp>
          </div>
        </GradientShift>

        </MarketingPageRoot>
      </main>

      <Footer />
    </>
  );
}
