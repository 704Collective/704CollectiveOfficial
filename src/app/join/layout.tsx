import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Join 704 Collective — Charlotte's Young Professionals Community",
  description:
    'Become a 704 Collective member. $30/month for unlimited events, priority access, and Charlotte\'s most active social community. Cancel anytime.',
  openGraph: {
    title: "Join 704 Collective — Charlotte's Young Professionals Community",
    description: 'Sign up for 704 Collective. $30/month, cancel anytime.',
    url: 'https://704collective.com/join',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/join' },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return children;
}