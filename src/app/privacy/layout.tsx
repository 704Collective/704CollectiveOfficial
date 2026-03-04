import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | 704 Collective',
  description:
    'Read the 704 Collective Privacy Policy — what information we collect, how we use it, third-party services, and your rights.',
  openGraph: {
    title: 'Privacy Policy | 704 Collective',
    description: '704 Collective Privacy Policy.',
    url: 'https://704collective.com/privacy',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}