'use client';

import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/Header';
import { usePageTitle } from '@/hooks/usePageTitle';

export default function Terms() {
  const { user, profile, isAdmin } = useAuth();
  usePageTitle('Terms of Service | 704 Collective');

  return (
    <div className="min-h-screen bg-background">
      <Header
        user={user ? { email: user.email, name: profile?.full_name || undefined, avatarUrl: profile?.avatar_url || undefined } : null}
        isAdmin={isAdmin}
      />
      <main className="container max-w-3xl py-16 px-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-12">Last Updated: February 2026</p>

        <p className="text-foreground mb-8">
          Welcome to 704 Collective! These Terms of Service (&quot;Terms&quot;) govern your use of our membership community, website, events, and related services. By joining 704 Collective or using our services, you agree to these Terms. Please read them carefully.
        </p>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">1. What is 704 Collective?</h2>
          <p className="text-muted-foreground">
            704 Collective is a membership-based social community for young professionals in Charlotte, NC. We host events, facilitate connections, and provide access to a curated network of like-minded individuals. Our goal is to help you build meaningful relationships and discover great experiences in Charlotte.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">2. Membership &amp; Billing</h2>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">Monthly Subscription:</strong> By joining 704 Collective, you authorize us to charge your selected payment method $30.00 per month (or the current membership rate at the time of signup) on a recurring basis until you cancel.
          </p>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">Automatic Renewal:</strong> Your membership automatically renews on the same date each month. We will send you a reminder email approximately 3 days before each renewal.
          </p>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">Payment Processing:</strong> All payments are processed securely through Stripe. We do not store your full credit card information on our servers.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Price Changes:</strong> We reserve the right to change membership pricing with 30 days&apos; notice. Any price changes will not affect your current billing cycle.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">3. What You&apos;re Paying For (Access, Not Attendance)</h2>
          <p className="text-muted-foreground mb-4">
            This is important, so we want to be crystal clear: Your membership fee pays for access to the 704 Collective community — not attendance at specific events.
          </p>
          <p className="text-foreground font-medium mb-2">Your membership includes:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
            <li>Invitations to all 704 Collective events, workshops, and experiences</li>
            <li>Access to our private community channels and member-only content</li>
            <li>Exclusive discounts at participating Charlotte partner businesses</li>
            <li>Connection to our network of young professionals</li>
          </ul>
          <p className="text-muted-foreground">
            Think of us like a gym membership or streaming service — your fee covers your access to these benefits, regardless of how often you use them. We pre-pay our vendors and reserve event capacity based on our active member count, which is why we cannot offer refunds or credits for months where you did not attend events or utilize your membership benefits.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">4. Refund Policy</h2>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">No Refunds for Non-Attendance:</strong> Because membership provides access rather than guaranteeing attendance, we do not offer refunds or credits for months where you did not attend events, access community channels, or use partner discounts. This applies regardless of the reason for non-attendance, including (but not limited to) busy schedules, travel, illness, or forgetting about events.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Billing Errors:</strong> If you believe you were charged in error (for example, after you canceled your membership), please contact us at hello@704collective.com within 30 days and we will investigate and correct any legitimate billing mistakes.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">5. Cancellation Policy</h2>
          <p className="text-muted-foreground mb-3">We believe in keeping things simple. There are no contracts, no cancellation fees, and no 30-day notice requirements.</p>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">How to Cancel:</strong> You can cancel your membership at any time through your Member Portal or by contacting us directly at hello@704collective.com.
          </p>
          <p className="text-muted-foreground mb-3">
            <strong className="text-foreground">When Cancellation Takes Effect:</strong> When you cancel, your membership remains active until the end of your current billing cycle. You will not be charged again after cancellation, but you will retain access to member benefits until your paid period ends.
          </p>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Rejoining:</strong> If you cancel and later wish to rejoin, you are welcome to sign up again at any time at the then-current membership rate.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">6. Pausing Your Membership</h2>
          <p className="text-muted-foreground">
            If you need a temporary break from your membership, you may request a pause for up to one (1) month. During a paused membership, you will not be charged, but you will also not have access to member benefits. To request a pause, please contact us at hello@704collective.com. Pauses are granted at our discretion and are limited to one pause per 12-month period.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">7. Community Code of Conduct</h2>
          <p className="text-muted-foreground mb-3">704 Collective is a community built on respect, inclusion, and genuine connection. By joining, you agree to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
            <li>Treat all members, staff, and event partners with respect and courtesy</li>
            <li>Refrain from harassment, discrimination, bullying, or intimidation of any kind</li>
            <li>Not use 704 Collective events or channels for aggressive sales pitches, MLM recruiting, or unwanted solicitation</li>
            <li>Not share other members&apos; personal contact information without their explicit consent</li>
            <li>Behave responsibly and safely at all events</li>
            <li>Comply with the rules and policies of our event venues and partners</li>
          </ul>
          <p className="text-muted-foreground">
            <strong className="text-foreground">Violation of this Code:</strong> We reserve the right to revoke your membership (without refund) for violations of this Code of Conduct. Serious violations may result in immediate termination and permanent ban from 704 Collective events and community spaces.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">8. Photo &amp; Video Release</h2>
          <p className="text-muted-foreground mb-3">By attending 704 Collective events, you grant 704 Collective and its authorized representatives permission to:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
            <li>Photograph and/or record video of you at events</li>
            <li>Use these photos and videos for marketing, social media, promotional materials, and press purposes</li>
            <li>Edit, crop, or modify these images as needed for promotional use</li>
          </ul>
          <p className="text-muted-foreground">
            This release is granted without compensation. If you prefer not to be photographed or recorded at a specific event, please inform the event host at the beginning of the event, and we will make reasonable efforts to accommodate your request.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">9. Assumption of Risk &amp; Liability Waiver</h2>
          <p className="text-muted-foreground mb-3">By participating in 704 Collective events and activities, you acknowledge and agree that:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1 mb-4">
            <li>Participation in events may involve inherent risks, including but not limited to physical activity, travel to event locations, and consumption of food or beverages</li>
            <li>You voluntarily assume all risks associated with participation</li>
            <li>To the fullest extent permitted by law, you release and hold harmless 704 Collective, its owners, officers, employees, and agents from any and all claims, damages, or liability arising from your participation in events or use of our services</li>
          </ul>
          <p className="text-muted-foreground">
            This waiver does not apply to claims arising from gross negligence or intentional misconduct by 704 Collective.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">10. Intellectual Property</h2>
          <p className="text-muted-foreground">
            All content, branding, logos, and materials associated with 704 Collective are the property of 704 Collective and are protected by applicable intellectual property laws. You may not use, reproduce, or distribute our branding or materials without prior written permission.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">11. Changes to These Terms</h2>
          <p className="text-muted-foreground">
            We may update these Terms from time to time. If we make material changes, we will notify you by email or through our community channels at least 14 days before the changes take effect. Your continued membership after the effective date constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">12. Governing Law &amp; Disputes</h2>
          <p className="text-muted-foreground">
            These Terms are governed by the laws of the State of North Carolina. Any disputes arising from these Terms or your membership shall be resolved in the state or federal courts located in Mecklenburg County, North Carolina.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-semibold text-foreground mb-4">13. Contact Us</h2>
          <p className="text-muted-foreground mb-1">If you have any questions about these Terms, please contact us:</p>
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
