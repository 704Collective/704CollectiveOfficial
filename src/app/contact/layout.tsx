import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact | 704 Collective',
  description:
    'Get in touch with 704 Collective. Questions about membership, events, or partnerships? Reach us via email or social media.',
  openGraph: {
    title: 'Contact | 704 Collective',
    description: 'Have questions? Contact the 704 Collective team.',
    url: 'https://704collective.com/contact',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/contact' },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}