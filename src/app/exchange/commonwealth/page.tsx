import type { Metadata } from 'next';
import ExchangeIntakeForm from '../ExchangeIntakeForm';

export const metadata: Metadata = {
  title: 'The Exchange Mixer - Residents',
  description: 'A free evening for residents of The Village at Commonwealth, hosted with 704 Collective.',
  robots: { index: false, follow: false },
};

export default function ExchangeCommonwealthPage() {
  return <ExchangeIntakeForm variant="commonwealth" />;
}
