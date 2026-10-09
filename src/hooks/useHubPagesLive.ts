'use client';

import { useEffect, useState } from 'react';
import { getHubPagesLiveFlag } from '@/app/actions/networkFlags';

// One round-trip per page load, shared by every caller.
let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

/** `null` until the server has answered; then the HUB_PAGES_LIVE truth. */
export function useHubPagesLive(): boolean | null {
  const [live, setLive] = useState<boolean | null>(cached);
  useEffect(() => {
    if (cached !== null) { setLive(cached); return; }
    let cancelled = false;
    inflight ??= getHubPagesLiveFlag().then((v) => { cached = v; return v; }).catch(() => false);
    inflight.then((v) => { if (!cancelled) setLive(v); });
    return () => { cancelled = true; };
  }, []);
  return live;
}
