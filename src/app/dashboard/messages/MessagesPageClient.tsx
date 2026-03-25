'use client';

import { useSearchParams } from 'next/navigation';
import { MessagingView } from '@/components/portal/MessagingView';

export function MessagesPageClient() {
  const sp = useSearchParams();
  const dm = sp.get('dm');
  return <MessagingView initialDirectPeerId={dm} />;
}
