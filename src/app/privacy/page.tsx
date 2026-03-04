'use client';

import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FadeUp } from '@/components/Animations';

const sectionStyle: React.CSSProperties = { marginBottom: '48px' };
const h2Style: React.CSSProperties = { fontSize: '1.375rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' };
const pStyle: React.CSSProperties = { fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: '12px' };
const strongStyle: React.CSSProperties = { color: '#FFFFFF', fontWeight: 600 };
const subheadStyle: React.CSSProperties = { ...pStyle, color: '#FFFFFF', fontWeight: 600, marginBottom: '8px' };
const ulStyle: React.CSSProperties = { paddingLeft: '20px', marginBottom: '16px' };
const liStyle: React.CSSProperties = { fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: '4px', listStyleType: 'disc' };
const linkStyle: React.CSSProperties = { color: '#C6A664', textDecoration: 'none', transition: 'opacity 200ms' };

export default function Privacy() {
  usePageTitle('Privacy Policy | 704 Collective');

  return (
    <>
      <Nav />
      <main style={{ paddingTop: '64px', backgroundColor: '#000', minHeight: '100vh' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 24px 96px' }}>
          <FadeUp>
            <h1 style={{ fontSize: 'clamp(2rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              Privacy Policy
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', marginBottom: '40px' }}>Last Updated: February 2026</p>
          </FadeUp>

          <FadeUp delay={0.1}>
            <p style={{ ...pStyle, marginBottom: '48px' }}>
              At 704 Collective, we take your privacy seriously. This Privacy Policy explains what information we collect, how we use it, and your choices regarding your personal data. By joining 704 Collective or using our services, you consent to the practices described in this policy.
            </p>
          </FadeUp>

          <FadeUp delay={0.15}>
            <section style={sectionStyle}>
              <h2 style={h2Style}>1. Information We Collect</h2>
              <p style={subheadStyle}>Information You Provide Directly:</p>
              <ul style={ulStyle}>
                <li style={liStyle}>Name and contact information (email address, phone number)</li>
                <li style={liStyle}>Billing information (processed securely through Stripe — we do not store full credit card numbers)</li>
                <li style={liStyle}>Profile information you choose to share (profession, interests, social media handles)</li>
                <li style={liStyle}>Communications you send to us (emails, feedback, support requests)</li>
              </ul>
              <p style={subheadStyle}>Information Collected Automatically:</p>
              <ul style={ulStyle}>
                <li style={liStyle}>Device and browser information when you visit our website</li>
                <li style={liStyle}>IP address and general location data</li>
                <li style={liStyle}>Website usage data (pages visited, time spent, clicks)</li>
                <li style={liStyle}>Event attendance and RSVP history</li>
              </ul>
              <p style={subheadStyle}>Information From Third Parties:</p>
              <ul style={ulStyle}>
                <li style={liStyle}>Payment confirmation from Stripe</li>
                <li style={liStyle}>Authentication data from Google (if you use Google sign-in)</li>
                <li style={liStyle}>Information from event and communication platforms we use</li>
              </ul>
            </section>
          </FadeUp>

          <section style={sectionStyle}>
            <h2 style={h2Style}>2. How We Use Your Information</h2>
            <p style={pStyle}>We use your information to:</p>
            <ul style={ulStyle}>
              <li style={liStyle}>Process your membership and payments</li>
              <li style={liStyle}>Send you event invitations, updates, and community announcements</li>
              <li style={liStyle}>Communicate with you about your account and membership</li>
              <li style={liStyle}>Improve our events, services, and member experience</li>
              <li style={liStyle}>Facilitate connections within the community (with your consent)</li>
              <li style={liStyle}>Send you information about partner offers and discounts</li>
              <li style={liStyle}>Comply with legal obligations</li>
            </ul>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>3. How We Share Your Information</h2>
            <p style={pStyle}>We do not sell your personal information. We may share your information in the following limited circumstances:</p>
            <p style={pStyle}><span style={strongStyle}>Service Providers:</span> We share data with third-party services that help us operate (e.g., Stripe for payments, email marketing platforms, event management tools). These providers are contractually obligated to protect your data and use it only for the services they provide to us.</p>
            <p style={pStyle}><span style={strongStyle}>Event Venues &amp; Partners:</span> We may share your name and basic contact information with event venues or partners for check-in and event management purposes.</p>
            <p style={pStyle}><span style={strongStyle}>Community Directory:</span> If you opt in, your name, profession, and social handles may be visible to other members in our member directory.</p>
            <p style={pStyle}><span style={strongStyle}>Legal Requirements:</span> We may disclose information if required by law, court order, or government request, or to protect the rights, property, or safety of 704 Collective, our members, or others.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>4. Third-Party Services We Use</h2>
            <p style={pStyle}>We use the following third-party services that may collect or process your data:</p>
            <ul style={ulStyle}>
              <li style={liStyle}><span style={strongStyle}>Stripe</span> — Payment processing</li>
              <li style={liStyle}><span style={strongStyle}>Supabase</span> — Database, authentication, and hosting</li>
              <li style={liStyle}><span style={strongStyle}>Google</span> — OAuth social login</li>
              <li style={liStyle}><span style={strongStyle}>HubSpot</span> — Email communications and CRM</li>
              <li style={liStyle}><span style={strongStyle}>Resend</span> — Transactional email delivery</li>
              <li style={liStyle}><span style={strongStyle}>Sentry</span> — Error tracking and performance monitoring</li>
            </ul>
            <p style={pStyle}>Each of these services has their own privacy policies, which we encourage you to review.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>5. Cookies &amp; Tracking</h2>
            <p style={pStyle}>Our website uses cookies and similar technologies to:</p>
            <ul style={ulStyle}>
              <li style={liStyle}>Keep you logged in to your account</li>
              <li style={liStyle}>Remember your preferences</li>
              <li style={liStyle}>Analyze website traffic and usage</li>
              <li style={liStyle}>Improve our website and services</li>
            </ul>
            <p style={pStyle}>You can control cookies through your browser settings. Note that disabling cookies may affect your ability to use certain features of our website.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>6. Data Security</h2>
            <p style={pStyle}>We implement reasonable security measures to protect your personal information, including encryption, secure servers, and limited access controls. However, no method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>7. Data Retention</h2>
            <p style={pStyle}>We retain your personal information for as long as your membership is active, and for a reasonable period afterward for legal, accounting, and business purposes. If you cancel your membership, we will retain basic records (name, email, billing history) for up to 3 years for tax and legal compliance, unless you request deletion.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>8. Your Rights &amp; Choices</h2>
            <p style={pStyle}>You have the right to:</p>
            <ul style={ulStyle}>
              <li style={liStyle}><span style={strongStyle}>Access:</span> Request a copy of the personal information we hold about you</li>
              <li style={liStyle}><span style={strongStyle}>Correction:</span> Request correction of inaccurate information</li>
              <li style={liStyle}><span style={strongStyle}>Deletion:</span> Request deletion of your personal information (subject to legal retention requirements)</li>
              <li style={liStyle}><span style={strongStyle}>Opt-Out:</span> Unsubscribe from marketing emails at any time using the link in our emails</li>
              <li style={liStyle}><span style={strongStyle}>Portability:</span> Request your data in a portable format</li>
            </ul>
            <p style={pStyle}>To exercise any of these rights, please contact us at <a href="mailto:hello@704collective.com" style={linkStyle}>hello@704collective.com</a>. We will respond to your request within 30 days.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>9. Children{"'"}s Privacy</h2>
            <p style={pStyle}>704 Collective is intended for individuals 18 years of age or older. We do not knowingly collect personal information from children under 18. If we learn that we have collected information from a child under 18, we will delete it promptly.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>10. Changes to This Policy</h2>
            <p style={pStyle}>We may update this Privacy Policy from time to time. If we make significant changes, we will notify you by email or through a prominent notice on our website. Your continued use of our services after the changes take effect constitutes acceptance of the updated policy.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>11. Contact Us</h2>
            <p style={pStyle}>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
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