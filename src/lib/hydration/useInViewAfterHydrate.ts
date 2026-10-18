'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useInView } from 'framer-motion';

/**
 * Framer `useInView` can flip true during the first client layout (hero on
 * mobile especially, with a negative margin). Server HTML is always the
 * "not in view" initial styles, so that flip is a React #418 hydration
 * mismatch. Keep false until after hydrate, then allow the real value.
 */
export function useInViewAfterHydrate(
  ref: RefObject<Element | null>,
  opts?: Parameters<typeof useInView>[1],
): boolean {
  const inView = useInView(ref, opts);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated && inView;
}
