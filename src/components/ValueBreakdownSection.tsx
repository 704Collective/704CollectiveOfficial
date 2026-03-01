'use client';

const VALUE_CARDS = [
  {
    category: 'Wellness',
    item: 'Cold Plunge & Sauna',
    publicPrice: '$45',
    memberPrice: 'Included Free',
  },
  {
    category: 'Social',
    item: 'Appetizer & Entry',
    publicPrice: '$30',
    memberPrice: 'Included Free',
  },
  {
    category: 'Community',
    item: 'Coffee Meetup',
    publicPrice: '$5',
    memberPrice: 'Included Free',
  },
];

export function ValueBreakdownSection() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="value-heading">
      <div className="container max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Is It Worth It?</p>
          <h2 id="value-heading" className="text-2xl md:text-3xl font-semibold mb-4">Your membership pays for itself</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Between the wellness perks and the people you'll meet, yes. Attending just one event a month justifies the price.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-4 md:gap-6 mb-10">
          {VALUE_CARDS.map((card) => (
            <div key={card.category} className="card-elevated p-6 md:p-8 flex-1 text-center space-y-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{card.category}</p>
              <h3 className="text-lg font-medium text-foreground">{card.item}</h3>
              <p className="text-muted-foreground line-through">{card.publicPrice} Public Price</p>
              <p className="text-lg font-semibold" style={{ color: '#C6A664' }}>{card.memberPrice}</p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-muted-foreground italic max-w-xl mx-auto text-lg">
            "Even if you only make it to Cold Plunge &amp; Sauna night, your membership has already paid for itself."
          </p>
        </div>
      </div>
    </section>
  );
}
