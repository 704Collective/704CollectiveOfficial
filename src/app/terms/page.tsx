import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { FadeUp, FadeIn } from "@/components/Animations";

export const metadata: Metadata = {
  title: "Terms of Service | 704 Collective",
  description: "Terms and conditions for using 704 Collective's services and membership.",
  openGraph: {
    title: "Terms of Service | 704 Collective",
    description: "Terms and conditions for 704 Collective membership and services.",
    url: "https://704collective.com/terms",
  },
};

export default function TermsPage() {
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
              <h1 style={headingStyle}>Terms of Service</h1>
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
              <div>
                <p style={introStyle}>
                  Welcome to 704 Collective. By accessing our website, applying for membership,
                  or using our services, you agree to be bound by these Terms of Service
                  (&quot;Terms&quot;). Please read them carefully before using our services.
                </p>

                <h2 style={h2Style}>1. Acceptance of Terms</h2>
                <p style={pStyle}>
                  By creating an account, purchasing a membership, or otherwise using our
                  services, you acknowledge that you have read, understood, and agree to be bound
                  by these Terms and our Privacy Policy. If you do not agree to these Terms, you
                  may not use our services.
                </p>

                <h2 style={h2Style}>2. Membership</h2>

                <h3 style={h3Style}>Eligibility</h3>
                <p style={pStyle}>
                  Membership is open to individuals who are at least 21 years of age. 704
                  Collective reserves the right to approve or deny any membership application at
                  our sole discretion. We are a curated community and maintain the right to
                  ensure alignment with our values and culture.
                </p>

                <h3 style={h3Style}>Membership Tiers</h3>
                <p style={pStyle}>
                  We offer two membership tiers: Social Membership and Business Membership. Each
                  tier has distinct benefits, pricing, and requirements as outlined on our
                  website. Specific tier details, pricing, and benefits are subject to change with
                  reasonable notice to current members.
                </p>

                <h3 style={h3Style}>Payment and Billing</h3>
                <p style={pStyle}>
                  Membership fees are billed on a recurring basis (monthly or annually, depending
                  on your selected plan). By subscribing, you authorize us to charge your
                  designated payment method at the start of each billing cycle. All payments are
                  processed through Stripe. Annual memberships lock in the current rate for the
                  duration of the annual term.
                </p>

                <h3 style={h3Style}>Cancellation</h3>
                <p style={pStyle}>
                  You may cancel your membership at any time. Cancellation takes effect at the
                  end of your current billing period. No refunds will be issued for partial
                  billing periods. Annual memberships may be cancelled but are non-refundable
                  after the first 14 days.
                </p>

                <h2 style={h2Style}>3. Member Conduct</h2>
                <p style={pStyle}>
                  As a member of 704 Collective, you agree to treat all members, staff, partners,
                  and guests with respect and professionalism. You agree not to engage in
                  harassment, discrimination, or any behavior that creates a hostile or
                  uncomfortable environment. You agree to comply with the rules and guidelines of
                  any event or venue associated with 704 Collective, not to use your membership
                  for unauthorized commercial solicitation, and to represent yourself and your
                  business honestly.
                </p>
                <p style={pStyle}>
                  Violation of these standards may result in warnings, suspension, or termination
                  of your membership at our discretion without refund.
                </p>

                <h2 style={h2Style}>4. Events</h2>
                <p style={pStyle}>
                  704 Collective organizes events for members. Event attendance may be limited and
                  is subject to availability. We reserve the right to modify, reschedule, or
                  cancel events. RSVP commitments should be honored; repeated no-shows may affect
                  your membership standing. Photography and video may be captured at events for
                  promotional purposes. By attending, you consent to the use of your likeness in
                  our marketing materials unless you notify us otherwise in writing.
                </p>

                <h2 style={h2Style}>5. Partner Program</h2>
                <p style={pStyle}>
                  Our Partner Program allows businesses to collaborate with 704 Collective.
                  Partner applications are subject to review and approval. Partner status does not
                  constitute an employment, joint venture, or franchise relationship. Either party
                  may terminate the partnership with 30 days written notice. Partners agree to
                  uphold the standards and reputation of 704 Collective.
                </p>

                <h2 style={h2Style}>6. Intellectual Property</h2>
                <p style={pStyle}>
                  All content on our website, including text, graphics, logos, images, and
                  software, is the property of 704 Collective and is protected by intellectual
                  property laws. You may not reproduce, distribute, modify, or create derivative
                  works from our content without express written permission. The &quot;704
                  Collective&quot; name, logo, and associated branding are trademarks of 704
                  Collective.
                </p>

                <h2 style={h2Style}>7. Limitation of Liability</h2>
                <p style={pStyle}>
                  704 Collective provides its services &quot;as is&quot; and makes no warranties,
                  express or implied, regarding the suitability, reliability, or accuracy of our
                  services. To the fullest extent permitted by law, 704 Collective shall not be
                  liable for any indirect, incidental, special, consequential, or punitive
                  damages arising from your use of our services, attendance at events, or
                  interactions with other members or partners.
                </p>

                <h2 style={h2Style}>8. Indemnification</h2>
                <p style={pStyle}>
                  You agree to indemnify and hold harmless 704 Collective, its founders, employees,
                  and agents from any claims, damages, losses, or expenses arising from your use
                  of our services, violation of these Terms, or infringement of any third-party
                  rights.
                </p>

                <h2 style={h2Style}>9. Dispute Resolution</h2>
                <p style={pStyle}>
                  Any disputes arising from these Terms or your use of our services shall be
                  resolved through binding arbitration in Charlotte, North Carolina, in
                  accordance with the rules of the American Arbitration Association. You agree to
                  waive any right to a jury trial or to participate in a class action. These Terms
                  shall be governed by the laws of the State of North Carolina.
                </p>

                <h2 style={h2Style}>10. Modifications</h2>
                <p style={pStyle}>
                  We reserve the right to modify these Terms at any time. Material changes will
                  be communicated to members via email or website notification at least 14 days
                  before taking effect. Your continued use of our services after changes are
                  posted constitutes acceptance of the modified Terms.
                </p>

                <h2 style={h2Style}>11. Termination</h2>
                <p style={pStyle}>
                  We may terminate or suspend your account and membership at any time for
                  violation of these Terms, conduct detrimental to the community, non-payment of
                  fees, or any other reason at our sole discretion. Upon termination, your right
                  to use our services ceases immediately.
                </p>

                <h2 style={h2Style}>12. Contact</h2>
                <p style={pStyle}>
                  If you have questions about these Terms, please contact us:
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