import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { Footer } from "@/components/Footer"
;
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
import HeroDots from "@/components/HeroDots";
import GradientShift from "@/components/GradientShift";

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

const stats = [
  { value: "150+", label: "Active Members" },
  { value: "40+", label: "Events Hosted" },
  { value: "50K+", label: "CLTBucketlist Reach" },
  { value: "20–40", label: "Per Event" },
];

const pillars = [
  {
    num: "01",
    title: "Curated, Not Crowded",
    body: "20-40 people per event. You will actually talk to everyone in the room. No wallflowers, no cliques, no awkward standing around.",
  },
  {
    num: "02",
    title: "Built on Local Credibility",
    body: "CLTBucketlist connects 50,000+ Charlotte residents to local businesses every month. That is the foundation 704 Collective was built on.",
  },
  {
    num: "03",
    title: "Relationships Over Transactions",
    body: "No pitch competitions. No forced introductions. Just real conversations between people who are serious about building something.",
  },
];

const benefits = [
  {
    title: "Monthly Business Meetings",
    body: "Structured sessions with Charlotte's top professionals. Real strategy, real accountability.",
  },
  {
    title: "Exclusive Workshops",
    body: "Deep-dive sessions on growth, leadership, marketing, and finance — led by people who have done it.",
  },
  {
    title: "Private Dinners",
    body: "Intimate gatherings at Charlotte's best restaurants. The conversations here change trajectories.",
  },
  {
    title: "Private Business Network",
    body: "Direct access to a vetted community of founders, executives, and professionals in Charlotte.",
  },
  {
    title: "Strategic Introductions",
    body: "We connect members with the right people — investors, partners, clients, mentors.",
  },
  {
    title: "Business Resources",
    body: "Templates, frameworks, and tools shared exclusively within the business community.",
  },
  {
    title: "Full 704 Social Access",
    body: "Complete Social pass included — all social events, wellness days, and community perks.",
  },
  {
    title: "Priority Everything",
    body: "First access to limited events, new programs, and partnership opportunities.",
  },
  {
    title: "Charlotte Insider Access",
    body: "Powered by CLTBucketlist — exclusive deals, early access, and connections to the city's best.",
  },
  {
    title: "Wellness & Recovery",
    body: "Cold plunge, sauna sessions, run clubs, and wellness events included with your membership.",
  },
  {
    title: "Guest Speaker Series",
    body: "Hear from Charlotte business leaders and industry experts in intimate, members-only settings.",
  },
  {
    title: "Cross-Community Exposure",
    body: "Visibility across the 704 Collective ecosystem — social members, partners, and local businesses.",
  },
];

const audienceItems = [
  "Founders and entrepreneurs building in Charlotte",
  "Professionals who want strategic relationships, not small talk",
  "Executives tired of generic networking events",
  "Creatives and freelancers looking for real collaboration",
  "Anyone serious about growing their business and network",
  "Leaders who know their network is their net worth",
];

const pricingFeatures = [
  "Monthly business meetings",
  "Exclusive workshops and speakers",
  "Private dinners",
  "Strategic introductions",
  "Full 704 Social access",
  "Priority to all events",
  "Business resource library",
  "Cancel anytime",
];

const faqs = [
  {
    q: "What is 704 Business?",
    a: "704 Business is the professional tier of 704 Collective. It is a curated community of ambitious Charlotte professionals who meet monthly for strategic networking, exclusive workshops, private dinners, and real business conversations. Every business member also gets full access to all 704 Social events and perks.",
  },
  {
    q: "How is this different from 704 Social?",
    a: "704 Social is about finding your people through curated social events, wellness days, and community. 704 Business adds a strategic layer: monthly business meetings, workshops, private dinners with industry leaders, strategic introductions, and a vetted professional network. Think of Social as your friend group and Business as your personal board of advisors.",
  },
  {
    q: "Why is there an application?",
    a: "Because the quality of the room matters. We keep 704 Business intentionally small so every member gets real value. The application helps us ensure every member is serious about building relationships and contributing to the community.",
  },
  {
    q: "What does $300/month actually cover?",
    a: "Monthly business meetings with structured agendas, exclusive workshops and guest speakers, private dinners at Charlotte's best restaurants, strategic introductions, access to the private business network, the full business resource library, and complete 704 Social access including 8+ social events, wellness days, and community perks. The annual option at $3,600/year saves you $600.",
  },
  {
    q: "What kind of professionals are in the group?",
    a: "Founders, startup operators, real estate professionals, tech leaders, creative agency owners, finance professionals, consultants, and executives across industries. What they have in common: they are building something in Charlotte and want to be around others doing the same.",
  },
  {
    q: "How big are the meetings?",
    a: "Every event is kept between 20 and 40 people. Big enough to meet new faces, small enough to have real conversations. No 600-person mixers.",
  },
  {
    q: "Can I try before I commit?",
    a: 'We occasionally host open events for prospective members. Follow @704collective on Instagram or email hello@704collective.com to learn about upcoming opportunities.',
  },
  {
    q: "Is there a contract?",
    a: "No. Monthly members can cancel anytime before their renewal date. Annual members commit for the year but save $600. No cancellation fees, no hoops.",
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
                "radial-gradient(ellipse at center top, rgba(198,166,100,0.06) 0%, transparent 50%)",
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
                  704 Business
                </span>
              </div>
            </FadeIn>

            <h1
              style={{
                fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                marginBottom: "24px",
                color: "#FAF6F0",
              }}
            >
              <WordReveal text="Where Charlotte's Leaders" />
              <br />
              <span style={{ color: "#C6A664", fontStyle: "italic" }}>
                <WordReveal text="Connect" />
              </span>
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
                Strategic networking, exclusive workshops, and a curated
                community of ambitious professionals building something bigger
                than themselves.
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
                  Apply for Membership
                </a>
                <a
                  href="#benefits"
                  className="btn-ghost-gold"
                  style={{ padding: "16px 36px", fontSize: "0.875rem" }}
                >
                  See What{"'"}s Included
                </a>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            STATS
        ════════════════════════════════════════════ */}
        <section
          style={{
            backgroundColor: "#1A1A1A",
            borderTop: "1px solid rgba(255,255,255,0.04)",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <div
            style={{
              maxWidth: "860px",
              margin: "0 auto",
              padding: "48px 24px",
            }}
          >
            <StaggerContainer
              staggerDelay={0.1}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "32px",
                textAlign: "center",
              }}
              className="stats-grid"
            >
              {stats.map((s, i) => (
                <StaggerItem key={i}>
                  <div
                    style={{
                      fontSize: "clamp(1.5rem, 3vw, 2rem)",
                      fontWeight: 700,
                      color: "#C6A664",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    style={{
                      color: "#A0A0A0",
                      fontSize: "11px",
                      marginTop: "6px",
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                    }}
                  >
                    {s.label}
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            WHO WE ARE
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
              <SectionLabel text="Who We Are" />
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
                Built for builders.
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
                  704 Collective started with a simple idea: Charlotte is full of
                  ambitious, talented people who don{"'"}t have a real place to
                  connect.
                </p>
              </FadeUp>

              <FadeUp delay={0.3}>
                <p>
                  Not at a 600-person mixer. Not at a transactional networking
                  lunch. Not through a LinkedIn message that goes nowhere.
                </p>
              </FadeUp>

              <FadeUp delay={0.4}>
                <p>
                  We built 704 Business for professionals who want more than
                  small talk — people building companies, leading teams, and
                  making moves.
                </p>
              </FadeUp>

              <FadeUp delay={0.5}>
                <p
                  style={{
                    color: "#C6A664",
                    fontWeight: 600,
                    fontSize: "1.1rem",
                  }}
                >
                  Charlotte{"'"}s business community — built by people who live
                  here, for people who are building here.
                </p>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            HOW WE'RE DIFFERENT
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#2E2E2E", padding: "80px 24px" }}>
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "48px" }}>
              <FadeUp>
                <SectionLabel text="How We're Different" />
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
                  Not another networking group.
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "480px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                    lineHeight: 1.7,
                  }}
                >
                  We built{" "}
                  <a
                    href="https://cltbucketlist.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#C6A664", textDecoration: "none" }}
                  >
                    CLTBucketlist.com
                  </a>{" "}
                  — Charlotte{"'"}s go-to local guide — and spent years learning
                  what this city actually needs.
                </p>
              </FadeUp>
            </div>

            <StaggerContainer
              staggerDelay={0.12}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
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
                    textAlign: "center",
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
                <SectionLabel text="Membership" />
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
                  What Members Get
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
                  Everything in 704 Social, plus business-exclusive access.
                </p>
              </FadeUp>
            </div>

            <StaggerContainer
              staggerDelay={0.06}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
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
                    padding: "24px 20px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "6px",
                        backgroundColor: "rgba(198,166,100,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          color: "#C6A664",
                          fontSize: "10px",
                          fontWeight: 700,
                        }}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3
                      style={{
                        color: "#FAF6F0",
                        fontWeight: 600,
                        fontSize: "0.85rem",
                      }}
                    >
                      {b.title}
                    </h3>
                  </div>
                  <p
                    style={{
                      color: "#A0A0A0",
                      fontSize: "0.8rem",
                      lineHeight: 1.65,
                      paddingLeft: "38px",
                    }}
                  >
                    {b.body}
                  </p>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            WHO THIS IS FOR
        ════════════════════════════════════════════ */}
        <section style={{ backgroundColor: "#2E2E2E", padding: "80px 24px" }}>
          <div
            style={{
              maxWidth: "720px",
              margin: "0 auto",
              textAlign: "center",
            }}
          >
            <FadeUp>
              <SectionLabel text="Is This You?" />
            </FadeUp>

            <FadeUp delay={0.1}>
              <h2
                style={{
                  fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.025em",
                  marginBottom: "40px",
                  color: "#FAF6F0",
                }}
              >
                Who This Is For
              </h2>
            </FadeUp>

            <StaggerContainer
              staggerDelay={0.08}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "10px",
                textAlign: "left",
              }}
              className="audience-grid"
            >
              {audienceItems.map((item, i) => (
                <StaggerItem
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "14px 18px",
                    backgroundColor: "rgba(26,26,26,0.6)",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span
                    style={{
                      color: "#C6A664",
                      fontSize: "0.8rem",
                      marginTop: "2px",
                      flexShrink: 0,
                      fontWeight: 600,
                    }}
                  >
                    {"->"}
                  </span>
                  <span
                    style={{
                      color: "#A0A0A0",
                      fontSize: "0.85rem",
                      lineHeight: 1.6,
                    }}
                  >
                    {item}
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
          style={{ backgroundColor: "#1A1A1A", padding: "80px 24px" }}
        >
          <div style={{ maxWidth: "560px", margin: "0 auto" }}>
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
              <TiltCard
                style={{
                  backgroundColor: "#111111",
                  border: "1px solid rgba(198,166,100,0.15)",
                  borderRadius: "16px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "1px",
                    background:
                      "linear-gradient(to right, transparent, rgba(198,166,100,0.4), transparent)",
                  }}
                />
                <div
                  className="pricing-inner"
                  style={{ padding: "44px 36px", textAlign: "center" }}
                >
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      border: "1px solid rgba(198,166,100,0.2)",
                      borderRadius: "9999px",
                      padding: "6px 16px",
                      marginBottom: "28px",
                    }}
                  >
                    <div
                      style={{
                        width: "4px",
                        height: "4px",
                        borderRadius: "50%",
                        backgroundColor: "#C6A664",
                      }}
                    />
                    <span
                      style={{
                        color: "#C6A664",
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.2em",
                      }}
                    >
                      Business Membership
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                      fontWeight: 700,
                      color: "#FAF6F0",
                      letterSpacing: "-0.025em",
                      marginBottom: "28px",
                    }}
                  >
                    704 Business
                  </h3>

                  <div
                    className="pricing-prices"
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "center",
                      gap: "20px",
                      marginBottom: "6px",
                    }}
                  >
                    <div>
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
                        /mo
                      </span>
                    </div>
                    <div
                      className="pricing-divider"
                      style={{
                        color: "rgba(255,255,255,0.1)",
                        fontSize: "1.25rem",
                      }}
                    >
                      |
                    </div>
                    <div>
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
                        /yr
                      </span>
                    </div>
                  </div>

                  <p
                    style={{
                      color: "rgba(250,246,240,0.25)",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "32px",
                    }}
                  >
                    Annual saves $600 — Both include full Social access
                  </p>

                  <div
                    className="pricing-features"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "6px 20px",
                      maxWidth: "380px",
                      margin: "0 auto 32px auto",
                      textAlign: "left",
                    }}
                  >
                    {pricingFeatures.map((f, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "5px 0",
                        }}
                      >
                        <span
                          style={{ color: "#C6A664", fontSize: "11px" }}
                        >
                          {"—"}
                        </span>
                        <span
                          style={{ color: "#A0A0A0", fontSize: "0.8rem" }}
                        >
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>

                  <a
                    href="#apply"
                    className="btn-gold"
                    style={{
                      padding: "16px 40px",
                      fontSize: "0.875rem",
                    }}
                  >
                    Apply Now
                  </a>
                </div>
              </TiltCard>
            </ScaleUp>
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
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <FadeUp>
                <SectionLabel text="Get Started" />
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
                  Apply for 704 Business
                </h2>
              </FadeUp>

              <FadeUp delay={0.15}>
                <p
                  style={{
                    color: "#A0A0A0",
                    maxWidth: "400px",
                    margin: "0 auto",
                    fontSize: "0.95rem",
                  }}
                >
                  Takes about 5 minutes. We review every application personally.
                </p>
              </FadeUp>
            </div>

            <FadeUp delay={0.2}>
              <div
                className="apply-steps"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "16px",
                  marginBottom: "40px",
                }}
              >
                {[
                  { n: "1", t: "Apply" },
                  { n: "2", t: "Review (24-48 hrs)" },
                  { n: "3", t: "Welcome" },
                ].map((step, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    {i > 0 && (
                      <div
                        style={{
                          width: "20px",
                          height: "1px",
                          backgroundColor: "rgba(255,255,255,0.1)",
                        }}
                      />
                    )}
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        backgroundColor: "rgba(198,166,100,0.1)",
                        color: "#C6A664",
                        fontSize: "10px",
                        fontWeight: 700,
                      }}
                    >
                      {step.n}
                    </span>
                    <span
                      style={{ color: "#A0A0A0", fontSize: "12px" }}
                    >
                      {step.t}
                    </span>
                  </div>
                ))}
              </div>
            </FadeUp>

            <ScaleUp delay={0.3}>
              <div
                style={{
                  backgroundColor: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "12px",
                  padding: "56px 32px",
                  textAlign: "center",
                  minHeight: "260px",
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
                    [HubSpot application form embeds here]
                  </p>
                  <p
                    style={{
                      color: "rgba(250,246,240,0.12)",
                      fontSize: "0.75rem",
                    }}
                  >
                    14-question form — connected when ready
                  </p>
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
                Ready to build something{" "}
                <span style={{ color: "#C6A664", fontStyle: "italic" }}>
                  bigger
                </span>
                ?
              </h2>
            </FadeUp>

            <FadeUp delay={0.1}>
              <p
                style={{
                  color: "#A0A0A0",
                  fontSize: "0.95rem",
                  maxWidth: "400px",
                  margin: "0 auto 32px auto",
                }}
              >
                Your network is your net worth. Start building it with the right
                people.
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
                  Apply for 704 Business
                </a>
                <a
                  href="mailto:hello@704collective.com"
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