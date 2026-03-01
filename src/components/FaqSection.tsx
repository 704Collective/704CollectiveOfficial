'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ_ITEMS = [
  {
    q: 'What is 704 Collective?',
    a: "A membership community for young professionals (25-35) in Charlotte. We're not another networking group — we're where you find your people. Think social hours, real connections, and a real community.",
  },
  {
    q: 'What does my $30/month cover?',
    a: 'Your membership is an all-access pass to our entire calendar of events. We use those funds to cover activity costs (cold plunges, indoor golf, guest workshops), venue and logistics, and community growth tools. We frequently provide food, drinks, or exclusive perks as a bonus.',
  },
  {
    q: 'What kind of events do you host?',
    a: "Everything from happy hours at Charlotte's best spots to group dinners, rooftop hangouts, outdoor adventures, and member-only experiences. We focus on environments where you can actually talk to people — no overcrowded venues or awkward mingling.",
  },
  {
    q: 'Do I have to attend every event?',
    a: 'Not at all. Our goal is to make sure one single event covers the cost of your membership. If you just make it to Sauna Night (value $45), your $30 membership is already paid for.',
  },
  {
    q: 'Can I bring guests?',
    a: 'Social events: Yes, occasionally — details vary by event. Each member gets one free guest pass per month.',
  },
  {
    q: "What if I'm new to Charlotte?",
    a: 'Perfect. 704 Collective is built for you. Come to your first event and leave with actual connections.',
  },
  {
    q: 'How is this different from other Charlotte groups?',
    a: 'Other Charlotte social clubs host 600–1,200 person events. We keep it intimate (20–40 people) so you actually get to know people.',
  },
  {
    q: 'Is there a contract?',
    a: 'No. Cancel anytime before your renewal date. No hard feelings, no hoops.',
  },
  {
    q: "What if I don't know anyone?",
    a: "That's exactly who we built this for. Our events are structured so meeting people is natural, not awkward.",
  },
];

export function FaqSection() {
  return (
    <section className="py-16 md:py-20 border-t border-border" aria-labelledby="faq-heading">
      <div className="container max-w-3xl mx-auto">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Common Questions</p>
        <h2 id="faq-heading" className="text-2xl md:text-3xl font-semibold mb-10">FAQ</h2>

        <Accordion type="single" collapsible className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="card-elevated px-6 border-none">
              <AccordionTrigger className="text-left text-foreground hover:no-underline py-5">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-base pb-5">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
