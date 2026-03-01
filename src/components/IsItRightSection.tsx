'use client';

import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

const STRIPE_JOIN_URL = 'https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04';

const REASONS = [
  "Are new to Charlotte and don't have a solid friend group yet",
  "Have friends but need things to actually do together",
  "Are tired of surface-level bar conversations that go nowhere",
  "Want to DO stuff, not just talk about doing stuff",
  "Tried the free 600-person meetups and felt overwhelmed",
  "Want real friends, not LinkedIn connections",
  "Need variety more than just bars on a Friday night — coffee meetups, game nights, workouts, adventures",
  "Most events in Charlotte cost $15–25. We're doing 8+ for $30",
];

export function IsItRightSection() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="right-for-you-heading">
      <div className="container max-w-6xl mx-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Is 704 Right For You?</p>
        <h2 id="right-for-you-heading" className="text-2xl md:text-3xl font-semibold mb-10">Join 704 If You...</h2>

        <div className="card-elevated p-6 md:p-10 max-w-3xl mx-auto">
          <ul className="space-y-4">
            {REASONS.map((reason, i) => (
              <li key={i} className="flex items-start gap-3">
                <Check className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: '#C6A664' }} aria-hidden="true" />
                <span className="text-foreground">{reason}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <Button size="xl" variant="hero" className="rounded-full w-full sm:w-auto" asChild>
              <a href={STRIPE_JOIN_URL} target="_blank" rel="noopener noreferrer">
                Become a Member
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
