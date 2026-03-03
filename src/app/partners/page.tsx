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
  WordReveal,
} from "@/components/Animations";
import HeroDots from "@/components/HeroDots";
import GradientShift from "@/components/GradientShift";

export const metadata: Metadata = {
  title: "Become a Partner | 704 Collective",
  description:
    "Partner with Charlotte's premier community. Whether you're a vendor, venue, or sponsor — connect with 704 Collective's engaged audience of ambitious professionals.",
  openGraph: {
    title: "Become a Partner | 704 Collective",
    description:
      "Partner with Charlotte's premier community as a vendor, venue, or sponsor.",
    url: "https://704collective.com/partners",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
};

const partnerTypes = [
  {
    type: "Vendor",
    tagline: "Offer your product or service to our members",
    description:
      "You have a product, service, or experience that would resonate with Charlotte's most active community. As a vendor partner, you get direct access to our member base through events, features, and exclusive offers.",
    includes: [
      "Featured placement at 704 events",
      "Exposure to 704 Social and Business members",
      "Co-branded promotional opportunities",
      "Inclusion in member perks and offers",
      "CLTBucketlist cross-promotion",
      "Dedicated partner profile on our platform",
    ],
    idealFor:
      "Local businesses, service providers, food & beverage brands, wellness companies, and experience-based businesses.",
    accent: "rgba(255, 255, 255, 0.08)",
    borderAccent: "rgba(255, 255, 255, 0.06)",
  },
  {
    type: "Venue",
    tagline: "Host our events at your space",
    description:
      "You have a space that brings people together. As a venue partner, you host 704 Collective events — putting your location in front of Charlotte's most connected professionals and social community.",
    includes: [
      "Regular event bookings at your space",
      "Exposure to 20-40 engaged attendees per event",
      "Social media features and event coverage",
      "Member-exclusive offers for your venue",
      "CLTBucketlist listing and promotion",
      "Dedicated partner profile on our platform",
    ],
    idealFor:
      "Restaurants, bars, rooftops, coworking spaces, private event spaces, wellness studios, and unique Charlotte locations.",
    accent: "rgba(198, 166, 100, 0.06)",
    borderAccent: "rgba(198, 166, 100, 0.1)",
  },
  {
    type: "Sponsor",
    tagline: "Align your brand with Charlotte's top community",
    description:
      "You want meaningful brand visibility with a highly engaged, curated audience. As a sponsor partner, your brand is woven into 704 Collective events, content, and member experiences at a strategic level.",
    includes: [
      "Logo placement at sponsored events",
      "Brand integration in event marketing",
      "Social media features and mentions",
      "Access to member demographics and insights",
      "Custom partnership activations",
      "Premium placement across 704 + CLTBucketlist",
    ],
    idealFor:
      "Brands, agencies, financial services, real estate companies, tech companies, and any business looking to reach Charlotte's ambitious professionals.",
    accent: "rgba(198, 166, 100, 0.08)",
    borderAccent: "rgba(198, 166, 100, 0.15)",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Apply",
    desc: "Tell us about your business and select which partner type(s) you're interested in. Takes about 5 minutes.",
  },
  {
    step: "02",
    title: "Review",
    desc: "Our team reviews every application personally. We look for alignment with our community and members. Expect to hear back within 48 hours.",
  },
  {
    step: "03",
    title: "Onboard",
    desc: "Once approved, you get access to your partner dashboard, event calendar, and a dedicated point of contact on our team.",
  },
  {
    step: "04",
    title: "Activate",
    desc: "Start showing up in front of our members — through events, promotions, features, and direct access to Charlotte's most connected community.",
  },
];

const faqs = [
  {
    q: "What is a 704 Collective partner?",
    a: "A partner is a local business, venue, or brand that works with 704 Collective to create value for our members. Partners get direct access to our engaged community of professionals through events, features, promotions, and exclusive offers.",
  },
  {
    q: "Can I be more than one partner type?",
    a: "Absolutely. Many partners are both a vendor and a venue, or a venue and a sponsor. You can select multiple types during your application and we'll build a partnership that fits.",
  },
  {
    q: "Is there a cost to become a partner?",
    a: "Partnership structures vary by type and scope. Some partnerships are value-exchange (you provide a space or product, we provide exposure). Sponsorships typically involve a financial commitment. We'll discuss specifics after reviewing your application.",
  },
  {
    q: "How many partners do you work with?",
    a: "We keep our partner roster intentionally curated. We'd rather have 20 great partners than 200 generic ones. Every partner should feel like they're getting real value, not competing for attention.",
  },
  {
    q: "What is CLTBucketlist?",
    a: "CLTBucketlist.com is Charlotte's go-to local guide — reaching 50,000+ Charlotte residents monthly. It's the platform 704 Collective was built on. As a partner, you get cross-promotion across both brands.",
  },
  {
    q: "How do I get started?",
    a: "Fill out the application below. It takes about 5 minutes. Our team reviews every application personally and responds within 48 hours.",
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

function TooltipIcon({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        fontSize: "10px",
        color: "rgba(255, 255, 255, 0.35)",
        cursor: "help",
        marginLeft: "6px",
        flexShrink: 0,
      }}
    >
      ?
    </span>
  );
}

export default function PartnersPage() {
  return (
    <>
      <Nav />
      <main style={{ paddingTop: "64px" }}>
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
            backgroundColor: "#111111",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at center top, rgba(198,166,100,0.05) 0%, transparent 50%)",
            }}
          />
          <HeroDots />
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
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  border: "1px solid rgba(198,166,100,0.25)",
                  borderRadius: "9999px",
                  padding: "8px 20px",
                  marginBottom: "36px",
                }}
              >
                <div
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: "#C6A664",
                  }}
                />
                <span
                  style={{
                    color: "#C6A664",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                  }}
                >
                  Partner With Us
                </span>
              </div>
            </FadeIn>

            <h1
              style={{
                fontSize: "clamp(2.5rem, 6vw, 4.25rem)",
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                marginBottom: "24px",
                color: "#FAF6F0",
              }}
            >
              <WordReveal text="Grow With Charlotte's" />
              <br />
              <WordReveal text="Most Connected Community" />
            </h1>

            <FadeUp delay={0.6} duration={0.8}>
              <p
                style={{
                  color: "#A0A0A0",
                  fontSize: "clamp(1rem, 2vw, 1.15rem)",
                  maxWidth: "520px",
                  margin: "0 auto 40px auto",
                  lineHeight: 1.7,
                }}
              >
                Whether you{"'"}re a vendor, venue, or sponsor — 704 Collective
                puts your brand in front of Charlotte{"'"}s most engaged
                professionals and social community.
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
                  Become a Partner
                </a>
                <a
                  href="#types"
                  className="btn-ghost-gold"
                  style={{ padding: "16px 36px", fontSize: "0.875rem" }}
                >
                  See Partner Types
                </a>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            WHAT IS A 704 PARTNER?
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}>
          <div
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel text="Why Partner" />
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  marginBottom: "32px",
                  color: "#FAF6F0",
                }}
              >
                Not an ad. A relationship.
              </h2>
            </FadeUp>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                color: "#A0A0A0",
                fontSize: "1rem",
                lineHeight: 1.8,
                textAlign: "center",
              }}
            >
              <FadeUp delay={0.2}>
                <p>
                  704 Collective is built on real connections. That philosophy
                  extends to how we work with partners. No banner ads. No
                  generic directories. No pay-to-play that nobody notices.
                </p>
              </FadeUp>

              <FadeUp delay={0.3}>
                <p>
                  Our partners are woven into the experience — hosting events,
                  providing products, and aligning their brands with a curated
                  audience that actually pays attention.
                </p>
              </FadeUp>

              <FadeUp delay={0.4}>
                <p>
                  Backed by{" "}
                  <a
                    href="https://cltbucketlist.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#C6A664", textDecoration: "none" }}
                  >
                    CLTBucketlist.com
                  </a>{" "}
                  — Charlotte{"'"}s largest local guide reaching 50,000+ residents
                  monthly — your partnership has reach that extends far beyond
                  our membership.
                </p>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            THREE PARTNER TYPES
        ════════════════════════════════════════════ */}
        <section
          id="types"
          style={{ backgroundColor: "#2E2E2E", padding: "80px 24px" }}
        >
          <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "56px" }}>
              <FadeUp>
                <SectionLabel text="Partner Types" />
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
                  Three ways to partner
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "500px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                    lineHeight: 1.7,
                  }}
                >
                  Pick one, two, or all three. Many partners fit more than one
                  category. We{"'"}ll build something that works for you.
                </p>
              </FadeUp>
            </div>

            <StaggerContainer
              staggerDelay={0.15}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "20px",
              }}
              className="partner-types-grid"
            >
              {partnerTypes.map((p, i) => (
                <StaggerItem
                  key={i}
                  className="card-hover"
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: `1px solid ${p.borderAccent}`,
                    borderRadius: "16px",
                    padding: "36px 28px",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <h3
                      style={{
                        fontSize: "1.25rem",
                        fontWeight: 700,
                        color: "#FAF6F0",
                      }}
                    >
                      {p.type}
                    </h3>
                    <TooltipIcon text={p.idealFor} />
                  </div>

                  <p
                    style={{
                      fontSize: "0.8125rem",
                      color: "#C6A664",
                      fontWeight: 600,
                      marginBottom: "16px",
                    }}
                  >
                    {p.tagline}
                  </p>

                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "#A0A0A0",
                      lineHeight: 1.7,
                      marginBottom: "24px",
                    }}
                  >
                    {p.description}
                  </p>

                  <div style={{ marginTop: "auto" }}>
                    <p
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "rgba(255, 255, 255, 0.3)",
                        marginBottom: "12px",
                      }}
                    >
                      What{"'"}s Included
                    </p>
                    {p.includes.map((item, j) => (
                      <div
                        key={j}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            color: "#C6A664",
                            fontSize: "10px",
                            marginTop: "4px",
                            flexShrink: 0,
                          }}
                        >
                          {"—"}
                        </span>
                        <span
                          style={{
                            color: "rgba(255, 255, 255, 0.55)",
                            fontSize: "0.8rem",
                            lineHeight: 1.5,
                          }}
                        >
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            HOW IT WORKS
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}>
          <div style={{ maxWidth: "700px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <FadeUp>
                <SectionLabel text="Process" />
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
                  How it works
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "460px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                    lineHeight: 1.7,
                  }}
                >
                  From application to activation — here{"'"}s what to expect.
                </p>
              </FadeUp>
            </div>

            <StaggerContainer staggerDelay={0.12}>
              {howItWorks.map((item, i) => (
                <StaggerItem key={i}>
                  <div
                    style={{
                      display: "flex",
                      gap: "20px",
                      padding: "24px 0",
                      borderBottom:
                        i < howItWorks.length - 1
                          ? "1px solid rgba(255, 255, 255, 0.06)"
                          : "none",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#C6A664",
                        minWidth: "28px",
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
                          color: "#FAF6F0",
                          marginBottom: "6px",
                        }}
                      >
                        {item.title}
                      </h3>
                      <p
                        style={{
                          fontSize: "0.875rem",
                          color: "#A0A0A0",
                          lineHeight: 1.65,
                        }}
                      >
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            APPLICATION
        ════════════════════════════════════════════ */}
        <section
          id="apply"
          style={{ backgroundColor: "#2E2E2E", padding: "80px 24px" }}
        >
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <FadeUp>
                <SectionLabel text="Apply" />
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
                  Become a 704 Partner
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "420px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                  }}
                >
                  Tell us about your business. Select which partner type(s)
                  you{"'"}re interested in. We{"'"}ll be in touch within 48 hours.
                </p>
              </FadeUp>
            </div>

            <ScaleUp delay={0.2}>
              <div
                style={{
                  backgroundColor: "#1A1A1A",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "16px",
                  padding: "56px 32px",
                  textAlign: "center",
                  minHeight: "300px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div>
                  <p
                    style={{
                      color: "rgba(250,246,240,0.2)",
                      fontSize: "0.85rem",
                      marginBottom: "8px",
                    }}
                  >
                    [Partner application form will be built here]
                  </p>
                  <p
                    style={{
                      color: "rgba(250,246,240,0.12)",
                      fontSize: "0.75rem",
                      marginBottom: "24px",
                    }}
                  >
                    Supabase-powered form with multi-select partner types
                  </p>
                  <Link
                    href="/partners/login"
                    style={{
                      color: "#C6A664",
                      fontSize: "0.8125rem",
                      textDecoration: "none",
                      borderBottom: "1px solid rgba(198, 166, 100, 0.3)",
                      paddingBottom: "2px",
                    }}
                  >
                    Already a partner? Log in →
                  </Link>
                </div>
              </div>
            </ScaleUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FAQ
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}>
          <div style={{ maxWidth: "640px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <FadeUp>
                <SectionLabel text="FAQ" />
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
                  Common Questions
                </h2>
              </FadeUp>
            </div>

            <StaggerContainer staggerDelay={0.08}>
              {faqs.map((faq, i) => (
                <StaggerItem key={i}>
                  <details
                    className="faq-item"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      padding: "18px 0",
                    }}
                  >
                    <summary
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          color: "#FAF6F0",
                          fontWeight: 600,
                          fontSize: "0.95rem",
                          paddingRight: "24px",
                          lineHeight: 1.4,
                        }}
                      >
                        {faq.q}
                      </span>
                      <span
                        style={{
                          color: "#C6A664",
                          fontSize: "1.25rem",
                          flexShrink: 0,
                          transition: "transform 200ms ease",
                        }}
                      >
                        +
                      </span>
                    </summary>
                    <p
                      style={{
                        color: "#A0A0A0",
                        fontSize: "0.85rem",
                        marginTop: "14px",
                        lineHeight: 1.7,
                        paddingRight: "32px",
                      }}
                    >
                      {faq.a}
                    </p>
                  </details>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FINAL CTA
        ════════════════════════════════════════════ */}
        <GradientShift
          style={{
            backgroundColor: "#2E2E2E",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            padding: "80px 24px",
          }}
        >
          <div
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  marginBottom: "16px",
                  color: "#FAF6F0",
                }}
              >
                Let{"'"}s build something{" "}
                <span style={{ color: "#C6A664", fontStyle: "italic" }}>
                  together
                </span>
              </h2>
            </FadeUp>

            <FadeUp delay={0.1}>
              <p
                style={{
                  color: "#A0A0A0",
                  fontSize: "0.95rem",
                  maxWidth: "420px",
                  margin: "0 auto 32px auto",
                }}
              >
                Charlotte{"'"}s most engaged community is looking for partners who
                care as much as they do. That{"'"}s you.
              </p>
            </FadeUp>

            <ScaleUp delay={0.2}>
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
                  Become a Partner
                </a>
                <a
                  href="mailto:partners@704collective.com"
                  className="btn-ghost-gold"
                  style={{ padding: "16px 36px", fontSize: "0.875rem" }}
                >
                  Questions? Email Us
                </a>
              </div>
            </ScaleUp>
          </div>
        </GradientShift>
      </main>
      <Footer />
    </>
  );
}