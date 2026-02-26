import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { FadeUp, FadeIn } from "@/components/Animations";

export const metadata: Metadata = {
  title: "Privacy Policy | 704 Collective",
  description: "How 704 Collective collects, uses, and protects your information.",
  openGraph: {
    title: "Privacy Policy | 704 Collective",
    description: "How 704 Collective collects, uses, and protects your information.",
    url: "https://704collective.com/privacy",
  },
};

export default function PrivacyPage() {
  const lastUpdated = "February 25, 2026";

  return (
    <>
      <Nav />
      <main style={{ paddingTop: "64px" }}>
        {/* Header */}
        <section style={{ backgroundColor: "#000000", padding: "80px 24px 48px" }}>
          <div style={{ maxWidth: "680px", margin: "0 auto" }}>
            <FadeIn delay={0.1}>
              <span style={labelStyle}>Legal</span>
            </FadeIn>
            <FadeUp delay={0.15}>
              <h1 style={headingStyle}>Privacy Policy</h1>
            </FadeUp>
            <FadeUp delay={0.25}>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.875rem" }}>
                Last updated: {lastUpdated}
              </p>
            </FadeUp>
          </div>
        </section>

        {/* Content */}
        <section style={{ backgroundColor: "#1A1A1A", padding: "64px 24px 96px" }}>
          <div style={{ maxWidth: "680px", margin: "0 auto" }}>
            <FadeUp>
              <div style={proseContainer}>
                <p style={introStyle}>
                  704 Collective (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates
                  704collective.com and related services. This Privacy Policy explains how we
                  collect, use, disclose, and safeguard your information when you visit our
                  website, use our services, or interact with us. Please read this policy
                  carefully. If you do not agree with the terms, please discontinue use of our
                  services.
                </p>

                <h2 style={h2Style}>1. Information We Collect</h2>

                <h3 style={h3Style}>Personal Information</h3>
                <p style={pStyle}>
                  We may collect personal information that you voluntarily provide when you
                  register for a membership, apply to become a partner, subscribe to our
                  newsletter, fill out a form, or otherwise contact us. This includes your name,
                  email address, phone number, business name, website URL, and any other
                  information you choose to provide.
                </p>

                <h3 style={h3Style}>Automatically Collected Information</h3>
                <p style={pStyle}>
                  When you visit our website, we may automatically collect certain information
                  about your device, including your IP address, browser type, operating system,
                  referring URLs, pages viewed, and access times. We may also collect information
                  about how you interact with our website through cookies and similar tracking
                  technologies.
                </p>

                <h3 style={h3Style}>Payment Information</h3>
                <p style={pStyle}>
                  If you purchase a membership, payment processing is handled by Stripe. We do
                  not store your credit card number or full payment details on our servers.
                  Stripe&apos;s use of your information is governed by their privacy policy.
                </p>

                <h2 style={h2Style}>2. How We Use Your Information</h2>
                <p style={pStyle}>
                  We use the information we collect to operate and maintain our website and
                  services, process membership applications and payments, communicate with you
                  about events, updates, and membership benefits, respond to your inquiries and
                  provide customer support, send marketing communications (with your consent),
                  analyze website usage to improve our services, and comply with legal obligations.
                </p>

                <h2 style={h2Style}>3. Sharing Your Information</h2>
                <p style={pStyle}>
                  We do not sell your personal information to third parties. We may share your
                  information with service providers who assist us in operating our website and
                  services (such as Supabase for database management, Stripe for payment
                  processing, and Vercel for website hosting), with other members in limited
                  contexts such as member directories (only with your consent), and when required
                  by law or to protect our rights.
                </p>

                <h2 style={h2Style}>4. Data Retention</h2>
                <p style={pStyle}>
                  We retain your personal information for as long as your account is active or as
                  needed to provide you services. If you request deletion of your account, we will
                  remove your personal information within 30 days, except where retention is
                  required by law.
                </p>

                <h2 style={h2Style}>5. Data Security</h2>
                <p style={pStyle}>
                  We implement reasonable security measures to protect your personal information,
                  including encryption of data in transit and at rest, secure authentication
                  mechanisms, and regular security reviews. However, no method of transmission
                  over the internet or electronic storage is 100% secure, and we cannot guarantee
                  absolute security.
                </p>

                <h2 style={h2Style}>6. Cookies and Tracking</h2>
                <p style={pStyle}>
                  Our website uses cookies and similar tracking technologies to enhance your
                  experience. You can control cookie preferences through your browser settings.
                  Disabling cookies may affect the functionality of certain features on our
                  website.
                </p>

                <h2 style={h2Style}>7. Third-Party Links</h2>
                <p style={pStyle}>
                  Our website may contain links to third-party websites. We are not responsible
                  for the privacy practices of these websites and encourage you to review their
                  privacy policies.
                </p>

                <h2 style={h2Style}>8. Your Rights</h2>
                <p style={pStyle}>
                  Depending on your location, you may have the right to access the personal
                  information we hold about you, request correction of inaccurate information,
                  request deletion of your personal information, opt out of marketing
                  communications, and request a copy of your data in a portable format. To
                  exercise any of these rights, please contact us at hello@704collective.com.
                </p>

                <h2 style={h2Style}>9. Children&apos;s Privacy</h2>
                <p style={pStyle}>
                  Our services are not directed to individuals under the age of 18. We do not
                  knowingly collect personal information from children. If we become aware that a
                  child has provided us with personal information, we will take steps to delete
                  such information.
                </p>

                <h2 style={h2Style}>10. Changes to This Policy</h2>
                <p style={pStyle}>
                  We may update this Privacy Policy from time to time. We will notify you of any
                  material changes by posting the new policy on this page with an updated
                  effective date. Your continued use of our services after any changes constitutes
                  acceptance of the updated policy.
                </p>

                <h2 style={h2Style}>11. Contact Us</h2>
                <p style={pStyle}>
                  If you have questions about this Privacy Policy or our data practices, please
                  contact us at:
                </p>
                <div
                  style={{
                    backgroundColor: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: "8px",
                    padding: "20px 24px",
                    marginTop: "8px",
                  }}
                >
                  <p style={{ color: "#FAF6F0", fontWeight: 600, fontSize: "0.9375rem", marginBottom: "4px" }}>
                    704 Collective
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.875rem", lineHeight: 1.7 }}>
                    Charlotte, North Carolina
                    <br />
                    <a
                      href="mailto:hello@704collective.com"
                      style={{ color: "#C6A664", textDecoration: "none" }}
                    >
                      hello@704collective.com
                    </a>
                  </p>
                </div>
              </div>
            </FadeUp>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.35)",
  marginBottom: "16px",
};

const headingStyle: React.CSSProperties = {
  fontSize: "clamp(2rem, 5vw, 3rem)",
  fontWeight: 700,
  letterSpacing: "-0.03em",
  lineHeight: 1.1,
  color: "#FFFFFF",
  marginBottom: "12px",
};

const proseContainer: React.CSSProperties = {};

const introStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  fontSize: "0.9375rem",
  lineHeight: 1.7,
  marginBottom: "40px",
};

const h2Style: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#FAF6F0",
  marginBottom: "12px",
  marginTop: "40px",
};

const h3Style: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.7)",
  marginBottom: "8px",
  marginTop: "20px",
};

const pStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.45)",
  fontSize: "0.875rem",
  lineHeight: 1.75,
  marginBottom: "16px",
};