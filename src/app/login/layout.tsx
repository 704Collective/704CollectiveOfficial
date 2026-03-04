import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | 704 Collective',
  description: 'Sign in to your 704 Collective account to manage your membership, RSVP to events, and connect with the community.',
  openGraph: {
    title: 'Sign In | 704 Collective',
    description: 'Sign in to your 704 Collective member account.',
    url: 'https://704collective.com/login',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/login' },
  robots: { index: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}