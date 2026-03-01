'use client';

import { Calendar, Users, Sparkles } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <Calendar className="w-6 h-6 text-primary" aria-hidden="true" />,
    title: "Exclusive Events",
    description: "Access members-only happy hours, networking events, and exclusive experiences across Charlotte."
  },
  {
    icon: <Users className="w-6 h-6 text-primary" aria-hidden="true" />,
    title: "Community",
    description: "Connect with ambitious professionals who are building their careers and making an impact."
  },
  {
    icon: <Sparkles className="w-6 h-6 text-primary" aria-hidden="true" />,
    title: "Perks",
    description: "Free tickets to all events, digital membership card, and partner discounts across the city."
  }
];

export function FeaturesSection() {
  return (
    <section className="py-12 md:py-20 border-t border-border" aria-labelledby="features-heading">
      <div className="container max-w-6xl mx-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">The Community</p>
        <h2 id="features-heading" className="text-2xl font-semibold mb-8">Why 704 Collective</h2>
        <div className="grid md:grid-cols-3 gap-4 md:gap-6">
          {FEATURES.map((feature, index) => (
            <article key={index} className="card-elevated p-4 md:p-6 space-y-4">
              <div 
                className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"
                aria-hidden="true"
              >
                {feature.icon}
              </div>
              <h3 className="text-xl font-medium">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
