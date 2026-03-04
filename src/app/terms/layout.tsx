import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | 704 Collective',
  description:
    'Read the 704 Collective Terms of Service — membership, billing, cancellation, community code of conduct, and more.',
  openGraph: {
    title: 'Terms of Service | 704 Collective',
    description: '704 Collective Terms of Service.',
    url: 'https://704collective.com/terms',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/terms' },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}