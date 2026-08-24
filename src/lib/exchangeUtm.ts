// Ad attribution for the Exchange funnel.
//
// The journey that has to survive is: ad click (any landing page) -> maybe a
// signup or login redirect -> registration. sessionStorage is the right store
// because it survives same-tab navigation and full page loads, including the
// auth callback round-trip, but dies with the tab so one visitor's attribution
// never leaks into the next.

export const EXCHANGE_UTM_KEY = 'exchange_utm';

const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

export type ExchangeUtm = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
};

// Mirrors the server-side cap so a value that survives here also survives the write.
const MAX_LEN = 200;

function clean(raw: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;
  return trimmed;
}

function hasAny(set: ExchangeUtm): boolean {
  return FIELDS.some((f) => Boolean(set[f]));
}

/** Reads the four params off a query string. URLSearchParams handles both `%20` and `+`. */
function fromSearch(search: string): ExchangeUtm {
  const params = new URLSearchParams(search);
  return {
    utm_source: clean(params.get('utm_source')),
    utm_medium: clean(params.get('utm_medium')),
    utm_campaign: clean(params.get('utm_campaign')),
    utm_content: clean(params.get('utm_content')),
  };
}

export function readExchangeUtm(): ExchangeUtm | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(EXCHANGE_UTM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExchangeUtm>;
    const set: ExchangeUtm = {
      utm_source: clean(parsed.utm_source ?? null),
      utm_medium: clean(parsed.utm_medium ?? null),
      utm_campaign: clean(parsed.utm_campaign ?? null),
      utm_content: clean(parsed.utm_content ?? null),
    };
    return hasAny(set) ? set : null;
  } catch {
    return null;
  }
}

/**
 * Captures utm_* off the current URL into sessionStorage. Safe to call on every
 * mount of every page in the funnel.
 *
 * An all-empty read is never stored, so navigating from an ad-tagged landing
 * page to an untagged form does not erase the attribution that got them there.
 * A genuinely new tagged click does win: a later ad with real params overwrites
 * the earlier set rather than being ignored.
 */
export function captureExchangeUtm(): ExchangeUtm | null {
  if (typeof window === 'undefined') return null;
  const incoming = fromSearch(window.location.search);
  if (!hasAny(incoming)) return readExchangeUtm();
  try {
    window.sessionStorage.setItem(EXCHANGE_UTM_KEY, JSON.stringify(incoming));
  } catch {
    // Private-mode Safari and storage-disabled browsers throw. Attribution is
    // never worth breaking a registration over.
  }
  return incoming;
}
