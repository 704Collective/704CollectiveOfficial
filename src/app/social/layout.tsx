import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "704 Social | Charlotte's Activity Club & Social Community",
  description:
    'Join Charlotte\'s premier social community for young professionals. 8+ curated events monthly — happy hours, wellness, adventures & more. $30/month. Cancel anytime.',
  openGraph: {
    title: "704 Social | Charlotte's Activity Club & Social Community",
    description:
      'Real friends. Real events. Real connections. Join Charlotte\'s most active young professionals community.',
    url: 'https://704collective.com/social',
    siteName: '704 Collective',
    type: 'website',
  },
  alternates: { canonical: 'https://704collective.com/social' },
};

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return children;
}