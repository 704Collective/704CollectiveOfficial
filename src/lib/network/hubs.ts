// Wave H3 — the hub contract: constant slug list, visibility, palette, copy.

export const HUBS = ['reset', 'nest', 'foundry', 'experience', 'enterprise', 'hall', 'lab'] as const;
export type HubSlug = (typeof HUBS)[number];

/** The four hubs that render today. enterprise / hall / lab 404 until promoted. */
export const VISIBLE_HUBS: readonly HubSlug[] = ['reset', 'nest', 'foundry', 'experience'];

export function isHub(s: string): s is HubSlug {
  return (HUBS as readonly string[]).includes(s);
}
export function isVisibleHub(s: string): s is HubSlug {
  return (VISIBLE_HUBS as readonly string[]).includes(s);
}

/** Public palette (shared). */
export const NW = {
  bg: '#FAFAF8',
  ink: '#141412',
  muted: '#6B6962',
  border: '#E4E1DA',
  band: '#F3F1EB',
  dark: '#141412',
} as const;

export type HubAccent = { accent: string; soft: string };

export const HUB_ACCENTS: Record<HubSlug, HubAccent> = {
  reset: { accent: '#3F7159', soft: '#9DBCA9' },
  nest: { accent: '#9A4A26', soft: '#D6A285' },
  foundry: { accent: '#8A6420', soft: '#CBB078' },
  experience: { accent: '#963D4E', soft: '#D397A2' },
  // Hidden hubs: ink until they get a palette of their own.
  enterprise: { accent: '#141412', soft: '#B8B5AD' },
  hall: { accent: '#141412', soft: '#B8B5AD' },
  lab: { accent: '#141412', soft: '#B8B5AD' },
};

export type SignatureSection =
  | { kind: 'route'; title: string; intro: string; stops: { time: string; title: string; body: string }[] }
  | { kind: 'milestones'; title: string; intro: string; columns: { label: string; title: string; body: string }[] }
  | { kind: 'stages'; title: string; intro: string; stages: { title: string; body: string; chips: string[] }[] }
  | { kind: 'occasions'; title: string; intro: string; occasions: { title: string; body: string }[] };

export type HubCopy = {
  slug: HubSlug;
  name: string;            // "The Reset"
  kicker: string;          // pill text
  h1: string;
  promise: string;
  proof: string[];         // 4 chips; the last is always "Backed by CLTBucketlist"
  ribbonFallback: string[]; // used when a hub has no categories yet
  trustLine: string;
  battleCry: string;
  signature: SignatureSection;
  faqs: { q: string; a: string }[];
  metaTitle: string;
  metaDescription: string;
};

const PROOF_TAIL = 'Backed by CLTBucketlist';

export const HUB_COPY: Record<HubSlug, HubCopy> = {
  reset: {
    slug: 'reset',
    name: 'The Reset',
    kicker: 'THE RESET · WELLNESS',
    h1: 'The places Charlotte goes to feel human again.',
    promise: 'Sauna, cold plunge, movement, recovery and the slower rituals — one vetted business per category, so you never have to guess.',
    proof: ['Every business passed the 704 Review', 'One seat per category', 'Re-reviewed quarterly', PROOF_TAIL],
    ribbonFallback: ['Sauna', 'Cold plunge', 'Pilates', 'Massage', 'Breathwork', 'Yoga', 'Recovery', 'Float'],
    trustLine: 'Every business here passed the 704 Review',
    battleCry: 'Rest is not a reward. It is the work.',
    signature: {
      kind: 'route',
      title: 'The Sunday Reset Route',
      intro: 'Three stops. One afternoon. The way our members actually do it.',
      stops: [
        { time: '10:00', title: 'Move', body: 'Start with a class that asks something of you — Pilates, hot yoga, a hard run club.' },
        { time: '12:30', title: 'Heat & cold', body: 'Sauna, then plunge. Twenty minutes that reset the whole week.' },
        { time: '14:00', title: 'Recover', body: 'Bodywork, a float, a long slow lunch. Go home different.' },
      ],
    },
    faqs: [
      { q: 'How does a business get on this page?', a: 'They apply, pass the 704 Review (five pillars, 50 points, 40 to pass), and pay for the placement. We re-verify quarterly and remove businesses that slip.' },
      { q: 'What is an exclusive seat?', a: 'One business per category. When a seat is held, no competitor can buy into that category on this hub until the seat is released.' },
      { q: 'Does 704 earn from these listings?', a: 'Yes — listings are paid placements. The bar to be listed is not for sale; the placement is.' },
      { q: 'How do intros work?', a: 'You tell us what you need; we pass it to the business with your details. Links on this page route through 704 so the business knows the intro came from here.' },
    ],
    metaTitle: 'The Reset — Charlotte wellness, vetted by 704',
    metaDescription: 'Sauna, cold plunge, movement and recovery in Charlotte. One vetted business per category, reviewed quarterly by 704 Collective.',
  },
  nest: {
    slug: 'nest',
    name: 'The Nest',
    kicker: 'THE NEST · HOME & MOVING',
    h1: 'Everyone you need to land well in Charlotte.',
    promise: 'Agents, lenders, movers, designers and the trades — vetted, one per category, so your move is a plan instead of a gamble.',
    proof: ['Every business passed the 704 Review', 'One seat per category', 'Re-reviewed quarterly', PROOF_TAIL],
    ribbonFallback: ['Real estate', 'Mortgage', 'Movers', 'Interior design', 'Cleaning', 'Handyman', 'Landscaping', 'Storage'],
    trustLine: 'Every business here passed the 704 Review',
    battleCry: 'A city becomes home the day you know who to call.',
    signature: {
      kind: 'milestones',
      title: 'Your move, mapped',
      intro: 'The order that keeps a Charlotte move calm.',
      columns: [
        { label: '60', title: '60 days out', body: 'Lender pre-approval. Agent conversations. Know your number before you know your street.' },
        { label: '30', title: '30 days out', body: 'Movers booked. Utilities scheduled. Designer walk-through if you are starting fresh.' },
        { label: 'GO', title: 'Move day', body: 'Cleaners before, movers during, handyman the week after.' },
        { label: '90', title: '90 days in', body: 'Landscaping, storage, the projects you promised yourself. Now you live here.' },
      ],
    },
    faqs: [
      { q: 'Are these businesses paying to be here?', a: 'Yes. Listings are paid placements that first passed the 704 Review. Paying does not get a business past the review.' },
      { q: 'Can two agents be listed?', a: 'Not on the same hub. One exclusive seat per category; spotlight listings are non-exclusive and sit below the room.' },
      { q: 'What happens if a business lets a member down?', a: 'Tell us. Re-reviews are quarterly and removal is real.' },
    ],
    metaTitle: 'The Nest — Charlotte home & moving, vetted by 704',
    metaDescription: 'Agents, lenders, movers and the trades in Charlotte. One vetted business per category, reviewed quarterly by 704 Collective.',
  },
  foundry: {
    slug: 'foundry',
    name: 'The Foundry',
    kicker: 'THE FOUNDRY · BUILDERS',
    h1: 'The bench behind Charlotte’s builders.',
    promise: 'Counsel, capital, books, brand and the people who make a company real — vetted, one per category, by stage.',
    proof: ['Every business passed the 704 Review', 'One seat per category', 'Re-reviewed quarterly', PROOF_TAIL],
    ribbonFallback: ['Business law', 'Accounting', 'Branding', 'Web & product', 'Fractional CFO', 'Recruiting', 'Insurance', 'Coworking'],
    trustLine: 'Every business here passed the 704 Review',
    battleCry: 'Build in the open. Hire like you mean it.',
    signature: {
      kind: 'stages',
      title: 'The bench, by stage',
      intro: 'Who you need changes as the company does.',
      stages: [
        { title: 'Idea → first dollar', body: 'Get the entity right, the books clean and a name you will not regret.', chips: ['Business law', 'Accounting', 'Branding'] },
        { title: 'First dollar → team', body: 'Product that ships, people who stay, risk that is covered.', chips: ['Web & product', 'Recruiting', 'Insurance'] },
        { title: 'Team → scale', body: 'Numbers that hold up in a room, and a room to be in.', chips: ['Fractional CFO', 'Coworking', 'Business law'] },
      ],
    },
    faqs: [
      { q: 'Is this a directory?', a: 'No. A directory lists everyone. This lists one vetted business per category, and we stand behind the vetting.' },
      { q: 'How is the review scored?', a: 'Five pillars, ten points each, forty to pass. Read How we vet for the full rubric.' },
      { q: 'Can I request an intro without being a member?', a: 'Yes. Intros are open to anyone; members get priority in the room.' },
    ],
    metaTitle: 'The Foundry — Charlotte business services, vetted by 704',
    metaDescription: 'Counsel, capital, books and brand for Charlotte founders. One vetted business per category, reviewed quarterly by 704 Collective.',
  },
  experience: {
    slug: 'experience',
    name: 'The Experience',
    kicker: 'THE EXPERIENCE · NIGHTS OUT',
    h1: 'Build a night Charlotte talks about.',
    promise: 'Venues, chefs, bars, music and the people who make an evening — vetted, one per category, so the plan holds.',
    proof: ['Every business passed the 704 Review', 'One seat per category', 'Re-reviewed quarterly', PROOF_TAIL],
    ribbonFallback: ['Private dining', 'Cocktail bar', 'Live music', 'Event venue', 'Private chef', 'Photography', 'Florals', 'Transportation'],
    trustLine: 'Every business here passed the 704 Review',
    battleCry: 'The best nights are built, not found.',
    signature: {
      kind: 'occasions',
      title: 'Build the night',
      intro: 'Pick the occasion. The room is already vetted.',
      occasions: [
        { title: 'The birthday that is not a bar crawl', body: 'Private dining, a bar with a back room, a photographer who knows the light.' },
        { title: 'The team night', body: 'A venue that holds forty, a chef, transportation that shows up.' },
        { title: 'The date you planned', body: 'Cocktails first, live music after, florals waiting at the table.' },
        { title: 'The one you host', body: 'Your place, their chef, their bar, their cleanup.' },
      ],
    },
    faqs: [
      { q: 'Do you plan events?', a: 'No — we vet the people who do, and make the intro. The night is yours.' },
      { q: 'Why are some businesses marked exclusive?', a: 'They hold the only seat in their category on this hub. Spotlight listings are vetted too, just not exclusive.' },
      { q: 'How current is this page?', a: 'Every business is re-reviewed quarterly and the verified date is on each profile.' },
    ],
    metaTitle: 'The Experience — Charlotte nights out, vetted by 704',
    metaDescription: 'Venues, chefs, bars and music in Charlotte. One vetted business per category, reviewed quarterly by 704 Collective.',
  },
  enterprise: hiddenHub('enterprise', 'The Enterprise'),
  hall: hiddenHub('hall', 'The Hall'),
  lab: hiddenHub('lab', 'The Lab'),
};

function hiddenHub(slug: HubSlug, name: string): HubCopy {
  return {
    slug, name, kicker: name.toUpperCase(), h1: name, promise: '', proof: [PROOF_TAIL], ribbonFallback: [], trustLine: '',
    battleCry: '', signature: { kind: 'route', title: '', intro: '', stops: [] }, faqs: [],
    metaTitle: `${name} — 704 Collective`, metaDescription: '',
  };
}

export const DISCLOSURE_LINE =
  'Listings are paid placements that passed the 704 Review; exclusive seats are held by members.';

export const LISTING_PRICE_LINE = 'from $150/month';
