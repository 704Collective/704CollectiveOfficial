import type { Metadata } from 'next';
import PartnerPortalLayoutClient from './PartnerPortalLayoutClient';

export const metadata: Metadata = {
  title: 'Partner Portal | 704 Collective',
  robots: { index: false, follow: false },
};

export default function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  return <PartnerPortalLayoutClient>{children}</PartnerPortalLayoutClient>;
}
