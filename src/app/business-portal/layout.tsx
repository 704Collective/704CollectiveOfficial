import type { Metadata } from 'next';
import BusinessPortalLayoutClient from './BusinessPortalLayoutClient';

export const metadata: Metadata = {
  title: 'Business Portal | 704 Collective',
  robots: { index: false, follow: false },
};

export default function BusinessPortalLayout({ children }: { children: React.ReactNode }) {
  return <BusinessPortalLayoutClient>{children}</BusinessPortalLayoutClient>;
}
