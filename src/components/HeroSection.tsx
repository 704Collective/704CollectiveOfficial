'use client';

import { ArrowRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HomepageImageGrid } from '@/components/HomepageImageGrid';

const STRIPE_JOIN_URL = 'https://buy.stripe.com/fZu14pctP2kz5vf0Df0Jq04';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden min-h-[40vh] md:min-h-[60vh] flex items-center" aria-labelledby="hero-heading">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-hero-pattern" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" aria-hidden="true" />

      <div className="relative z-10 py-16 md:py-24 lg:py-32 flex flex-col items-center w-full">
        {/* Text Block - Centered */}
        <div className="space-y-8 text-center items-center flex flex-col mb-12 px-4 sm:px-6 max-w-3xl mx-auto">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Charlotte, NC</p>
            <h1 
              id="hero-heading"
              className="font-semibold italic text-4xl md:text-5xl lg:text-6xl text-foreground animate-fade-up"
            >
              Charlotte's Premier Community
            </h1>
          </div>
          
          <div className="space-y-1 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <p className="font-semibold italic text-2xl md:text-3xl text-foreground">Your city.</p>
            <p className="font-semibold italic text-2xl md:text-3xl text-foreground">Your people.</p>
          </div>

          <p className="text-muted-foreground text-lg animate-fade-up max-w-lg" style={{ animationDelay: '0.15s' }}>
            Real friends, real events, real connections. No awkward small talk. No overwhelming crowds.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <Button size="xl" variant="hero" className="rounded-full w-full sm:w-auto" asChild>
              <a href={STRIPE_JOIN_URL} target="_blank" rel="noopener noreferrer" aria-label="Become a member of 704 Collective">
                Become a Member
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="rounded-full w-full sm:w-auto border-white/20 hover:bg-white/5" asChild>
              <a href="#events-section" aria-label="See upcoming events">
                <Calendar className="w-5 h-5 mr-2" aria-hidden="true" />
                See Upcoming Events
              </a>
            </Button>
          </div>
        </div>

        {/* Full-width Carousel - Below text on ALL breakpoints */}
        <div className="w-full max-w-none" aria-label="Community photo gallery">
          <HomepageImageGrid />
        </div>
      </div>
    </section>
  );
}
