import type { Metadata } from 'next';
import ExchangeIntakeForm from '../ExchangeIntakeForm';

export const metadata: Metadata = {
  title: 'The Exchange Mixer - RSVP',
  description: 'Thursday, August 27 at the Beer Garden at The Village at Commonwealth. Structured networking plus a social hour.',
};

export default function ExchangeRsvpPage() {
  return <ExchangeIntakeForm variant="public" />;
}
