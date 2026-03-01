'use client';

const TESTIMONIALS = [
  {
    quote:
      '704 makes it so easy to hit fun events—especially the health and wellness ones, my personal fave—and I get to meet so many new people every time!!',
    author: 'Sydney',
    role: 'Social Member',
    img: 'https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets//Sydney.jpg',
  },
  {
    quote:
      "Joining 704 was a great decision, there's so many events and everyone I've met has been great.",
    author: 'Nick',
    role: 'Social Member',
    img: 'https://chnpjxwcmxkmcdoivmra.supabase.co/storage/v1/object/public/public-assets//Nick.jpg',
  },
];

export function Testimonials() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="testimonials-heading">
      <div className="container max-w-6xl mx-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground text-center mb-3">
          What Members Say
        </p>
        <h2
          id="testimonials-heading"
          className="text-3xl md:text-4xl font-semibold text-center mb-12"
        >
          Don't Take Our Word For It
        </h2>

        <div className="flex flex-col md:flex-row gap-6">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.author}
              className="flex-1 flex flex-col items-center text-center rounded-2xl border border-white/[0.08] p-8"
              style={{
                background:
                  'linear-gradient(180deg, hsl(0 0% 15%) 0%, hsl(0 0% 10%) 100%)',
              }}
            >
              <img
                src={t.img}
                alt={`${t.author}, ${t.role}`}
                className="w-32 h-32 md:w-40 md:h-40 rounded-full object-cover shadow-lg mb-6"
              />
              <p className="text-lg italic text-foreground/90 leading-relaxed mb-6">
                "{t.quote}"
              </p>
              <p className="font-semibold text-foreground">{t.author}</p>
              <p className="text-sm text-muted-foreground">{t.role}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
