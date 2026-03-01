'use client';

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STRIPE_JOIN_URL = 'https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04';

export function FinalCtaSection() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="final-cta-heading">
      <div className="container max-w-6xl mx-auto">
        <div className="card-elevated p-8 md:p-14 text-center max-w-3xl mx-auto">
          <h2 id="final-cta-heading" className="text-2xl sm:text-3xl lg:text-4xl font-semibold mb-4">
            Ready to find your people?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join Charlotte's premier community for young professionals.
          </p>
          <Button size="xl" variant="hero" className="rounded-full w-full sm:w-auto" asChild>
            <a href={STRIPE_JOIN_URL} target="_blank" rel="noopener noreferrer">
              Become a Member
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </a>
          </Button>
          <p className="text-sm text-muted-foreground mt-6">
            Questions?{' '}
            <a href="mailto:hello@704collective.com" className="text-foreground hover:text-primary transition-colors underline underline-offset-4">
              hello@704collective.com
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
