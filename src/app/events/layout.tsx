import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Events | 704 Collective',
  description:
    'Browse upcoming 704 Collective events in Charlotte — happy hours, wellness experiences, game nights, and more. Members RSVP free.',
  openGraph: {
    title: 'Events | 704 Collective',
    description:
      'Browse upcoming 704 Collective events in Charlotte. Members get free entry to all events.',
    url: 'https://704collective.com/events',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/events' },
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}