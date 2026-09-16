'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { captureAttribution } from '@/lib/attribution';

/** Records utm params and fbclid from any landing into sessionStorage. Renders nothing. */
export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  useEffect(() => {
    captureAttribution();
  }, [pathname, search]);
  return null;
}

export default AttributionCapture;
