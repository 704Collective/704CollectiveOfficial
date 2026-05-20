'use client';

import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { FadeUp } from '@/components/Animations';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

const sectionStyle: React.CSSProperties = { marginBottom: '48px' };
const h2Style: React.CSSProperties = { fontSize: '1.375rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' };
const pStyle: React.CSSProperties = { fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, marginBottom: '12px' };
const linkStyle: React.CSSProperties = { color: '#C6A664', textDecoration: 'none', transition: 'opacity 200ms' };

export default function SmsTerms() {
  usePageTitle('SMS Terms | 704 Collective');

  return (
    <>
      <Nav />
      <main id="main-content" style={{ paddingTop: '64px', backgroundColor: '#000', minHeight: '100vh' }}>
        <MarketingPageRoot>
        <div style={{ maxWidth: '720px', margin: '0 auto', padding: '64px 24px 96px' }}>
          <FadeUp>
            <h1 style={{ fontSize: 'clamp(2rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', marginBottom: '8px' }}>
              SMS Terms &amp; Conditions
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', marginBottom: '40px' }}>Last updated: May 2026</p>
          </FadeUp>

          <FadeUp delay={0.1}>
            <p style={{ ...pStyle, marginBottom: '48px' }}>
              These SMS Terms describe the text messaging program operated by 704 Collective. By opting in to receive text messages from us, you agree to these terms.
            </p>
          </FadeUp>

          <FadeUp delay={0.15}>
            <section style={sectionStyle}>
              <h2 style={h2Style}>1. Program Description</h2>
              <p style={pStyle}>704 Collective sends text messages to members who have opted in to receive them. Messages include event reminders, RSVP confirmations, membership updates, and account notifications related to your membership. We do not send promotional or marketing text messages through this program.</p>
            </section>
          </FadeUp>

          <section style={sectionStyle}>
            <h2 style={h2Style}>2. Opting In</h2>
            <p style={pStyle}>You opt in to receive text messages by checking the SMS consent box when you create your membership at 704collective.com. This checkbox is optional and unchecked by default. You may complete your membership signup without opting in to text messages.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>3. Message Frequency</h2>
            <p style={pStyle}>Message frequency varies based on event activity and your membership. You may receive messages when you RSVP to an event, in the days before an event you are attending, and when there are updates relevant to your account.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>4. Cost</h2>
            <p style={pStyle}>704 Collective does not charge for text messages. However, standard message and data rates from your mobile carrier may apply. Contact your carrier for details about your plan.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>5. Opting Out</h2>
            <p style={pStyle}>You may opt out of text messages at any time by replying STOP to any message you receive from us. After you reply STOP, you will receive one final message confirming that you have been unsubscribed, and you will not receive further text messages unless you opt in again.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>6. Help</h2>
            <p style={pStyle}>For help with the text messaging program, reply HELP to any message, or contact us at <a href="mailto:hello@704collective.com" style={linkStyle}>hello@704collective.com</a>.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>7. Supported Carriers</h2>
            <p style={pStyle}>The 704 Collective text messaging program is supported by major United States mobile carriers. Carriers are not liable for delayed or undelivered messages.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>8. Privacy</h2>
            <p style={pStyle}>Your phone number and consent are handled in accordance with our <a href="/privacy" style={linkStyle}>Privacy Policy</a>. We do not sell, rent, or share your phone number with third parties for their marketing purposes. See our <a href="/privacy" style={linkStyle}>Privacy Policy</a> for full details.</p>
          </section>

          <section style={sectionStyle}>
            <h2 style={h2Style}>9. Changes to These Terms</h2>
            <p style={pStyle}>We may update these SMS Terms from time to time. Continued participation in the text messaging program after changes are posted constitutes acceptance of the updated terms.</p>
          </section>

          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.25)', marginTop: '16px' }}>Last updated: May 2026</p>
        </div>
        </MarketingPageRoot>
      </main>
      <Footer />
    </>
  );
}