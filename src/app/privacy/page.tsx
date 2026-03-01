'use client';

import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Privacy() {
  const { user, profile, isAdmin } = useAuth();
  usePageTitle('Privacy Policy | 704 Collective');

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user ? { email: user.email, name: profile?.full_name || undefined, avatarUrl: profile?.avatar_url || undefined } : null}
        isAdmin={isAdmin}
      />
      <main className="container max-w-3xl py-16 px-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-12">Last Updated: February 2026</p>

        <p className="text-foreground mb-8">
          At 704 Collective, we take your privacy seriously. This Privacy Policy explains what information we collect, how we use it, and your choices regarding your personal data. By joining 704 Collective or using our services, you consent to the practices described in this policy.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">1. Information We Collect</h2>

          <p className="text-foreground font-medium mb-2">Information You Provide Directly:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
            <li>Name and contact information (email address, phone number)</li>
            <li>Billing information (processed securely through Stripe — we do not store full credit card numbers)</li>
            <li>Profile information you choose to share (profession, interests, social media handles)</li>
            <li>Communications you send to us (emails, feedback, support requests)</li>
          </ul>

          <p className="text-foreground font-medium mb-2">Information Collected Automatically:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
            <li>Device and browser information when you visit our website</li>
            <li>IP address and general location data</li>
            <li>Website usage data (pages visited, time spent, clicks)</li>
            <li>Event attendance and RSVP history</li>
          </ul>

          <p className="text-foreground font-medium mb-2">Information From Third Parties:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Payment confirmation from Stripe</li>
            <li>Authentication data from Google (if you use Google sign-in)</li>
            <li>Information from event and communication platforms we use</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">2. How We Use Your Information</h2>
          <p className="text-muted-foreground mb-2">We use your information to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Process your membership and payments</li>
            <li>Send you event invitations, updates, and community announcements</li>
            <li>Communicate with you about your account and membership</li>
            <li>Improve our events, services, and member experience</li>
            <li>Facilitate connections within the community (with your consent)</li>
            <li>Send you information about partner offers and discounts</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">3. How We Share Your Information</h2>
          <p className="text-muted-foreground mb-4">We do not sell your personal information. We may share your information in the following limited circumstances:</p>

          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">Service Providers:</strong> We share data with third-party services that help us operate (e.g., Stripe for payments, email marketing platforms, event management tools). These providers are contractually obligated to protect your data and use it only for the services they provide to us.
          </p>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">Event Venues &amp; Partners:</strong> We may share your name and basic contact information with event venues or partners for check-in and event management purposes.
          </p>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">Community Directory:</strong> If you opt in, your name, profession, and social handles may be visible to other members in our member directory.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Legal Requirements:</strong> We may disclose information if required by law, court order, or government request, or to protect the rights, property, or safety of 704 Collective, our members, or others.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">4. Third-Party Services We Use</h2>
          <p className="text-muted-foreground mb-3">We use the following third-party services that may collect or process your data:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-3">
            <li><strong className="text-foreground">Stripe</strong> — Payment processing</li>
            <li><strong className="text-foreground">Supabase</strong> — Database, authentication, and hosting</li>
            <li><strong className="text-foreground">Google</strong> — OAuth social login</li>
            <li><strong className="text-foreground">HubSpot</strong> — Email communications and CRM</li>
            <li><strong className="text-foreground">Resend</strong> — Transactional email delivery</li>
            <li><strong className="text-foreground">Sentry</strong> — Error tracking and performance monitoring</li>
          </ul>
          <p className="text-muted-foreground">Each of these services has their own privacy policies, which we encourage you to review.</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">5. Cookies &amp; Tracking</h2>
          <p className="text-muted-foreground mb-3">Our website uses cookies and similar technologies to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-3">
            <li>Keep you logged in to your account</li>
            <li>Remember your preferences</li>
            <li>Analyze website traffic and usage</li>
            <li>Improve our website and services</li>
          </ul>
          <p className="text-muted-foreground">You can control cookies through your browser settings. Note that disabling cookies may affect your ability to use certain features of our website.</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">6. Data Security</h2>
          <p className="text-muted-foreground">
            We implement reasonable security measures to protect your personal information, including encryption, secure servers, and limited access controls. However, no method of transmission over the internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">7. Data Retention</h2>
          <p className="text-muted-foreground">
            We retain your personal information for as long as your membership is active, and for a reasonable period afterward for legal, accounting, and business purposes. If you cancel your membership, we will retain basic records (name, email, billing history) for up to 3 years for tax and legal compliance, unless you request deletion.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">8. Your Rights &amp; Choices</h2>
          <p className="text-muted-foreground mb-2">You have the right to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-3">
            <li><strong className="text-foreground">Access:</strong> Request a copy of the personal information we hold about you</li>
            <li><strong className="text-foreground">Correction:</strong> Request correction of inaccurate information</li>
            <li><strong className="text-foreground">Deletion:</strong> Request deletion of your personal information (subject to legal retention requirements)</li>
            <li><strong className="text-foreground">Opt-Out:</strong> Unsubscribe from marketing emails at any time using the link in our emails</li>
            <li><strong className="text-foreground">Portability:</strong> Request your data in a portable format</li>
          </ul>
          <p className="text-muted-foreground">To exercise any of these rights, please contact us at hello@704collective.com. We will respond to your request within 30 days.</p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">9. Children&apos;s Privacy</h2>
          <p className="text-muted-foreground">
            704 Collective is intended for individuals 18 years of age or older. We do not knowingly collect personal information from children under 18. If we learn that we have collected information from a child under 18, we will delete it promptly.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">10. Changes to This Policy</h2>
          <p className="text-muted-foreground">
            We may update this Privacy Policy from time to time. If we make significant changes, we will notify you by email or through a prominent notice on our website. Your continued use of our services after the changes take effect constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">11. Contact Us</h2>
          <p className="text-muted-foreground mb-1">If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
          <p className="text-muted-foreground">704 Collective</p>
          <p className="text-muted-foreground">
            Email: <a href="mailto:hello@704collective.com" className="text-primary hover:underline">hello@704collective.com</a>
          </p>
          <p className="text-muted-foreground">Website: 704collective.com</p>
        </section>
      </main>
    </div>
  );
}
