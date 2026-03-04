'use client';

import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FadeUp } from '@/components/Animations';

const sectionStyle: React.CSSProperties = { marginBottom: '48px' };
const h2Style: React.CSSProperties = { fontSize: '1.375rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' };
const pStyle: React.CSSProperties = { fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: '12px' };
const strongStyle: React.CSSProperties = { color: '#FFFFFF', fontWeight: 600 };
const ulStyle: React.CSSProperties = { paddingLeft: '20px', marginBottom: '16px' };
const liStyle: React.CSSProperties = { fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: '4px', listStyleType: 'disc' };
const linkStyle: React.CSSProperties = { color: '#C6A664', textDecoration: 'none', transition: 'opacity 200ms' };

export default function Terms() {
  usePageTitle('Terms of Service | 704 Collective');

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', backgroundColor: '#000', minHeight: '100vh' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 24px 96px' }}>
          <FadeUp>
            <h1 style={{ fontSize: 'clamp(2rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              Terms of Service
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', marginBottom: '40px' }}>Last Updated: February 2026</p>
          </FadeUp>

          <FadeUp delay={0.1}>
            <p style={{ ...pStyle, marginBottom: '48px' }}>
              Welcome to 704 Collective! These Terms of Service (&quot;Terms&quot;) govern your use of our membership community, website, events, and related services. By joining 704 Collective or using our services, you agree to these Terms. Please read them carefully.
            </p>
          </FadeUp>

          <FadeUp delay={0.15}>
            <section style={sectionStyle}>
              <h2 style={h2Style}>1. What is 704 Collective?</h2>
              <p style={pStyle}>704 Collective is a membership-based social community for young professionals in Charlotte, NC. We host events, facilitate connections, and provide access to a curated network of like-minded individuals. Our goal is to help you build meaningful relationships and discover great experiences in Charlotte.</p>
            </section>
          </FadeUp>

          <section style={sectionStyle}>
            <h2 style={h2Style}>2. Membership &amp; Billing</h2>
            <p style={pStyle}><span style={strongStyle}>Monthly Subscription:</span> By joining 704 Collective, you authorize us to charge your selected payment method $30.00 per month (or the current membership rate at the time of signup) on a recurring basis until you cancel.</p>
            <p style={pStyle}><span style={strongStyle}>Automatic Renewal:</span> Your membership automatically renews on the same date each month. We will send you a reminder email approximately 3 days before each renewal.</p>
            <p style={pStyle}><span style={strongStyle}>Payment Processing:</span> All payments are processed securely through Stripe. We do not store your full credit card information on our servers.</p>
            <p style={pStyle}><span style={strongStyle}>Price Changes:</span> We reserve the right to change membership pricing with 30 days{"'"} notice. Any price changes will not affect your current billing cycle.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>3. What You{"'"}re Paying For (Access, Not Attendance)</h2>
            <p style={pStyle}>This is important, so we want to be crystal clear: Your membership fee pays for access to the 704 Collective community — not attendance at specific events.</p>
            <p style={{ ...pStyle, color: '#FFFFFF', fontWeight: 600 }}>Your membership includes:</p>
            <ul style={ulStyle}>
              <li style={liStyle}>Invitations to all 704 Collective events, workshops, and experiences</li>
              <li style={liStyle}>Access to our private community channels and member-only content</li>
              <li style={liStyle}>Exclusive discounts at participating Charlotte partner businesses</li>
              <li style={liStyle}>Connection to our network of young professionals</li>
            </ul>
            <p style={pStyle}>Think of us like a gym membership or streaming service — your fee covers your access to these benefits, regardless of how often you use them. We pre-pay our vendors and reserve event capacity based on our active member count, which is why we cannot offer refunds or credits for months where you did not attend events or utilize your membership benefits.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>4. Refund Policy</h2>
            <p style={pStyle}><span style={strongStyle}>No Refunds for Non-Attendance:</span> Because membership provides access rather than guaranteeing attendance, we do not offer refunds or credits for months where you did not attend events, access community channels, or use partner discounts. This applies regardless of the reason for non-attendance, including (but not limited to) busy schedules, travel, illness, or forgetting about events.</p>
            <p style={pStyle}><span style={strongStyle}>Billing Errors:</span> If you believe you were charged in error (for example, after you canceled your membership), please contact us at <a href="mailto:hello@704collective.com" style={linkStyle}>hello@704collective.com</a> within 30 days and we will investigate and correct any legitimate billing mistakes.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>5. Cancellation Policy</h2>
            <p style={pStyle}>We believe in keeping things simple. There are no contracts, no cancellation fees, and no 30-day notice requirements.</p>
            <p style={pStyle}><span style={strongStyle}>How to Cancel:</span> You can cancel your membership at any time through your Member Portal or by contacting us directly at <a href="mailto:hello@704collective.com" style={linkStyle}>hello@704collective.com</a>.</p>
            <p style={pStyle}><span style={strongStyle}>When Cancellation Takes Effect:</span> When you cancel, your membership remains active until the end of your current billing cycle. You will not be charged again after cancellation, but you will retain access to member benefits until your paid period ends.</p>
            <p style={pStyle}><span style={strongStyle}>Rejoining:</span> If you cancel and later wish to rejoin, you are welcome to sign up again at any time at the then-current membership rate.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>6. Pausing Your Membership</h2>
            <p style={pStyle}>If you need a temporary break from your membership, you may request a pause for up to one (1) month. During a paused membership, you will not be charged, but you will also not have access to member benefits. To request a pause, please contact us at <a href="mailto:hello@704collective.com" style={linkStyle}>hello@704collective.com</a>. Pauses are granted at our discretion and are limited to one pause per 12-month period.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>7. Community Code of Conduct</h2>
            <p style={pStyle}>704 Collective is a community built on respect, inclusion, and genuine connection. By joining, you agree to:</p>
            <ul style={ulStyle}>
              <li style={liStyle}>Treat all members, staff, and event partners with respect and courtesy</li>
              <li style={liStyle}>Refrain from harassment, discrimination, bullying, or intimidation of any kind</li>
              <li style={liStyle}>Not use 704 Collective events or channels for aggressive sales pitches, MLM recruiting, or unwanted solicitation</li>
              <li style={liStyle}>Not share other members{"'"} personal contact information without their explicit consent</li>
              <li style={liStyle}>Behave responsibly and safely at all events</li>
              <li style={liStyle}>Comply with the rules and policies of our event venues and partners</li>
            </ul>
            <p style={pStyle}><span style={strongStyle}>Violation of this Code:</span> We reserve the right to revoke your membership (without refund) for violations of this Code of Conduct. Serious violations may result in immediate termination and permanent ban from 704 Collective events and community spaces.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>8. Photo &amp; Video Release</h2>
            <p style={pStyle}>By attending 704 Collective events, you grant 704 Collective and its authorized representatives permission to:</p>
            <ul style={ulStyle}>
              <li style={liStyle}>Photograph and/or record video of you at events</li>
              <li style={liStyle}>Use these photos and videos for marketing, social media, promotional materials, and press purposes</li>
              <li style={liStyle}>Edit, crop, or modify these images as needed for promotional use</li>
            </ul>
            <p style={pStyle}>This release is granted without compensation. If you prefer not to be photographed or recorded at a specific event, please inform the event host at the beginning of the event, and we will make reasonable efforts to accommodate your request.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>9. Assumption of Risk &amp; Liability Waiver</h2>
            <p style={pStyle}>By participating in 704 Collective events and activities, you acknowledge and agree that:</p>
            <ul style={ulStyle}>
              <li style={liStyle}>Participation in events may involve inherent risks, including but not limited to physical activity, travel to event locations, and consumption of food or beverages</li>
              <li style={liStyle}>You voluntarily assume all risks associated with participation</li>
              <li style={liStyle}>To the fullest extent permitted by law, you release and hold harmless 704 Collective, its owners, officers, employees, and agents from any and all claims, damages, or liability arising from your participation in events or use of our services</li>
            </ul>
            <p style={pStyle}>This waiver does not apply to claims arising from gross negligence or intentional misconduct by 704 Collective.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>10. Intellectual Property</h2>
            <p style={pStyle}>All content, branding, logos, and materials associated with 704 Collective are the property of 704 Collective and are protected by applicable intellectual property laws. You may not use, reproduce, or distribute our branding or materials without prior written permission.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>11. Changes to These Terms</h2>
            <p style={pStyle}>We may update these Terms from time to time. If we make material changes, we will notify you by email or through our community channels at least 14 days before the changes take effect. Your continued membership after the effective date constitutes acceptance of the updated Terms.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>12. Governing Law &amp; Disputes</h2>
            <p style={pStyle}>These Terms are governed by the laws of the State of North Carolina. Any disputes arising from these Terms or your membership shall be resolved in the state or federal courts located in Mecklenburg County, North Carolina.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>13. Contact Us</h2>
            <p style={pStyle}>If you have any questions about these Terms, please contact us:</p>
            <p style={pStyle}>704 Collective</p>
            <p style={pStyle}>Email: <a href="mailto:hello@704collective.com" style={linkStyle}>hello@704collective.com</a></p>
            <p style={{ ...pStyle, marginBottom: 0 }}>Website: <a href="https://704collective.com" style={linkStyle}>704collective.com</a></p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}