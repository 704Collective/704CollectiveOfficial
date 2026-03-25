import type { Metadata } from 'next';
import { PartnerApplyForm } from '@/components/partners/PartnerApplyForm';

export const metadata: Metadata = {
  title: 'Apply as a Partner | 704 Collective',
  robots: { index: false },
};

export default function PartnerApplyPage() {
  return <PartnerApplyForm />;
}
