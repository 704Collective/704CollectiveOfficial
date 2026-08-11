import type { Metadata } from 'next';
import ExchangeIntakeForm from '../../ExchangeIntakeForm';

export const metadata: Metadata = {
  title: 'The Exchange Mixer - Your Details',
  robots: { index: false, follow: false },
};

export default async function ExchangeInvitedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ExchangeIntakeForm variant="invited" inviteToken={token} />;
}
