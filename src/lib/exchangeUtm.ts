// Ad attribution for the Exchange funnel.
//
// Now a thin shim over the site-wide store in src/lib/attribution.ts, which
// captures on every landing (not just the Exchange pages) and adds fbclid.
// The Exchange callers keep their names and their four-field shape; the intake
// function's sanitiser ignores the extra fields.

import { captureAttribution, readAttribution, ATTRIBUTION_KEY } from '@/lib/attribution';

export const EXCHANGE_UTM_KEY = ATTRIBUTION_KEY;

export type ExchangeUtm = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
};

function toExchange(a: ReturnType<typeof readAttribution>): ExchangeUtm | null {
  if (!a) return null;
  const set: ExchangeUtm = {
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    utm_content: a.utm_content,
  };
  return set.utm_source || set.utm_medium || set.utm_campaign || set.utm_content ? set : null;
}

export function readExchangeUtm(): ExchangeUtm | null {
  return toExchange(readAttribution());
}

export function captureExchangeUtm(): ExchangeUtm | null {
  return toExchange(captureAttribution());
}
