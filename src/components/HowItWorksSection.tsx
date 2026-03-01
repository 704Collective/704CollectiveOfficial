'use client';

const STEPS = [
  {
    number: '1',
    title: 'Join',
    description: "No application. No interviews. Just sign up and you're in.",
  },
  {
    number: '2',
    title: 'Show Up',
    description: '8+ events per month. Happy hours, dinners, adventures — we plan everything so you just walk in.',
  },
  {
    number: '3',
    title: 'Build Your Circle',
    description: 'The people you meet become the friends you text and the network that opens doors.',
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="how-it-works-heading">
      <div className="container max-w-6xl mx-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">How It Works</p>
        <h2 id="how-it-works-heading" className="text-2xl md:text-3xl font-semibold mb-10">Three simple steps</h2>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          {STEPS.map((step) => (
            <div key={step.number} className="card-elevated p-6 md:p-8 flex-1 space-y-4">
              <span className="text-4xl font-bold" style={{ color: '#C6A664' }}>{step.number}</span>
              <h3 className="text-xl font-medium text-foreground">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
