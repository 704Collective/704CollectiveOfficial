import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Member Portal | 704 Collective',
  description: 'Manage your 704 Collective membership, events, and profile.',
  robots: { index: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}