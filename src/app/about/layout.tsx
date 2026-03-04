import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | 704 Collective',
  description:
    'Learn about 704 Collective — Charlotte\'s community for young professionals. Built by four friends who wanted more from the Queen City.',
  openGraph: {
    title: 'About | 704 Collective',
    description: 'Learn about 704 Collective and the team behind Charlotte\'s premier young professionals community.',
    url: 'https://704collective.com/about',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/about' },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}