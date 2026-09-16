'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Meta (Facebook) browser pixel. Env-gated like Sentry: when
 * NEXT_PUBLIC_META_PIXEL_ID is absent nothing is injected and every helper is
 * a no-op, so develop/CI never load fbevents.js.
 *
 * - Base script is injected lazily on the first eligible pathname, never on
 *   admin surfaces, so an admin who opens /admin first loads nothing.
 * - PageView fires on mount and on every SPA route change (App Router does not
 *   reload the document, so the standard snippet's single PageView is not enough).
 * - trackPurchase fires once per Checkout Session id: the cs_ id is both the
 *   eventID (browser/CAPI dedupe) and order_id, and a sessionStorage marker
 *   stops a refresh of the success page from firing twice.
 */

const PIXEL_ID = (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '').trim();
export const META_PIXEL_ENABLED = /^\d{6,20}$/.test(PIXEL_ID);

const EXCLUDED_PREFIXES = ['/admin', '/partners/admin', '/api', '/auth/callback'];

export function isPixelExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

type FbqFn = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: FbqFn;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

const SCRIPT_ID = 'meta-pixel-base';

/** Installs the standard fbq stub + fbevents.js once. Returns true when fbq is callable. */
function ensureBase(): boolean {
  if (!META_PIXEL_ENABLED || typeof window === 'undefined') return false;
  if (window.fbq) return true;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue.push(args);
  } as FbqFn;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  if (!document.getElementById(SCRIPT_ID)) {
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq('init', PIXEL_ID);
  return true;
}

export interface PurchaseArgs {
  /** Dollars, e.g. 24.5 */
  value: number;
  /** ISO code, e.g. 'usd' */
  currency: string;
  /** Stripe Checkout Session id (cs_...) — used as eventID and order_id. */
  eventId: string;
  contentName?: string;
}

const firedKey = (id: string) => `meta_purchase_fired:${id}`;

/** Fires Purchase once per session id. Returns true when a call was made. */
export function trackPurchase({ value, currency, eventId, contentName = '704 Social Membership' }: PurchaseArgs): boolean {
  if (!META_PIXEL_ENABLED || typeof window === 'undefined') return false;
  if (!eventId || !eventId.startsWith('cs_')) return false;
  if (isPixelExcludedPath(window.location.pathname)) return false;
  try {
    if (window.sessionStorage.getItem(firedKey(eventId))) return false;
  } catch {
    /* storage unavailable: fire anyway */
  }
  if (!ensureBase()) return false;
  window.fbq!(
    'track',
    'Purchase',
    {
      value: Number(value.toFixed(2)),
      currency: currency.toUpperCase(),
      content_type: 'product',
      content_name: contentName,
      order_id: eventId,
    },
    { eventID: eventId },
  );
  try {
    window.sessionStorage.setItem(firedKey(eventId), '1');
  } catch {
    /* ignore */
  }
  return true;
}

export function MetaPixel() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!META_PIXEL_ENABLED) return;
    if (isPixelExcludedPath(pathname)) return;
    if (!ensureBase()) return;
    if (lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    window.fbq!('track', 'PageView');
  }, [pathname]);

  return null;
}

export default MetaPixel;
