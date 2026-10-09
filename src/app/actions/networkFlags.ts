'use server';

import { hubPagesLive } from '@/lib/network/flags';

/**
 * H5 close-out: HUB_PAGES_LIVE is a server-only env. Client surfaces (dashboard
 * nav, /dashboard/leads, /dashboard/network) read it through this action so the
 * flag never needs a NEXT_PUBLIC_ twin.
 */
export async function getHubPagesLiveFlag(): Promise<boolean> {
  return hubPagesLive();
}
