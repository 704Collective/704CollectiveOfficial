// Site-wide ad attribution. Generalises the Exchange funnel's UTM capture
// (src/lib/exchangeUtm.ts, which now re-exports from here) to every landing.
//
// The journey that has to survive is: ad click (any page) -> maybe a signup or
// login redirect -> registration / checkout. sessionStorage is the right store:
// it survives same-tab navigation and full page loads, including the auth
// callback round-trip, but dies with the tab so one visitor's attribution
// never leaks into the next.
//
// Rule: an all-empty read is never stored (an untagged page after a tagged one
// does not erase attribution), and a genuinely new tagged click wins.

export const ATTRIBUTION_KEY = 'attribution';

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
const CLICK_FIELDS = ['fbclid'] as const;

export type Attribution = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  fbclid: string | null;
  landing_path: string | null;
};

/** What the server writers accept (contacts.utm_* + Stripe metadata). */
export type AttributionPayload = Pick<Attribution, 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'fbclid'>;

// Mirrors the server-side cap so a value that survives here also survives the write.
const MAX_LEN = 200;

function clean(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > MAX_LEN) return null;
  return t;
}

function hasAny(a: Attribution): boolean {
  return [...UTM_FIELDS, ...CLICK_FIELDS].some((f) => a[f] !== null);
}

function fromSearch(search: string, pathname: string): Attribution {
  const p = new URLSearchParams(search);
  return {
    utm_source: clean(p.get('utm_source')),
    utm_medium: clean(p.get('utm_medium')),
    utm_campaign: clean(p.get('utm_campaign')),
    utm_content: clean(p.get('utm_content')),
    fbclid: clean(p.get('fbclid')),
    landing_path: clean(pathname),
  };
}

export function readAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Attribution>;
    const set: Attribution = {
      utm_source: clean(parsed.utm_source),
      utm_medium: clean(parsed.utm_medium),
      utm_campaign: clean(parsed.utm_campaign),
      utm_content: clean(parsed.utm_content),
      fbclid: clean(parsed.fbclid),
      landing_path: clean(parsed.landing_path),
    };
    return hasAny(set) ? set : null;
  } catch {
    return null;
  }
}

/**
 * Captures utm_* and fbclid off the current URL into sessionStorage. Safe to
 * call on every route change; only a URL with real params writes.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  const incoming = fromSearch(window.location.search, window.location.pathname);
  if (!hasAny(incoming)) return readAttribution();
  try {
    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(incoming));
  } catch {
    // Private-mode Safari and storage-disabled browsers throw. Attribution is
    // never worth breaking a signup over.
  }
  return incoming;
}

/** The five fields the servers accept, or null when nothing is worth sending. */
export function readAttributionPayload(): AttributionPayload | null {
  const a = readAttribution();
  if (!a) return null;
  return {
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    utm_content: a.utm_content,
    fbclid: a.fbclid,
  };
}
