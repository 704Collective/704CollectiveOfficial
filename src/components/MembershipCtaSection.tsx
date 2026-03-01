'use client';

import { Check, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STRIPE_JOIN_URL = 'https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04';

const BENEFITS = [
  '8+ events every month',
  'Priority RSVP access',
  'Happy hours & socials',
  'Wellness & workout days',
  'Digital membership card',
  'Cancel anytime',
];

export function MembershipCtaSection() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="membership-heading">
      <div className="container max-w-6xl mx-auto">
        <div className="max-w-2xl mx-auto rounded-2xl border border-white/[0.12] p-8 md:p-12 text-center"
          style={{ background: 'linear-gradient(180deg, hsl(0 0% 15%) 0%, hsl(0 0% 10%) 100%)' }}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Membership</p>
          <h2 id="membership-heading" className="text-3xl md:text-4xl font-semibold mb-2">704 Social</h2>
          <p className="text-4xl md:text-5xl font-bold mt-4 mb-8" style={{ color: '#C6A664' }}>
            $30 <span className="text-lg font-medium text-muted-foreground">/ month</span>
          </p>

          <ul className="space-y-3 text-left max-w-sm mx-auto mb-10">
            {BENEFITS.map((b, i) => (
              <li key={i} className="flex items-center gap-3">
                <Check className="h-5 w-5 flex-shrink-0" style={{ color: '#C6A664' }} aria-hidden="true" />
                <span className="text-foreground">{b}</span>
              </li>
            ))}
          </ul>

          <Button size="xl" variant="hero" className="rounded-full w-full sm:w-auto" asChild>
            <a href={STRIPE_JOIN_URL} target="_blank" rel="noopener noreferrer">
              Become a Member
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
