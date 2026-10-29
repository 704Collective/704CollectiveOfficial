// Site-wide ad attribution.
//
// Latest tagged click lives in localStorage for 30 days so it survives a new
// tab. The first tagged click is stored beside it and never overwritten.
// An untagged page does not erase either one. A new tagged click replaces
// latest_touch only.
//
// The old sessionStorage key is read once, when localStorage has no latest
// touch, and then removed.

export const ATTRIBUTION_KEY = 'attribution';
const FIRST_KEY = 'attribution_first';
const LATEST_KEY = 'attribution_latest';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const CLICK_FIELDS = ['fbclid'] as const;

export type AttributionTouch = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  landing_path: string | null;
  referrer: string | null;
  captured_at: string;
};

/** Shape older callers and Stripe metadata still use. */
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

const MAX_LEN = 200;

function clean(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t || t.length > MAX_LEN) return null;
  return t;
}

function tagged(a: { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null; fbclid: string | null }): boolean {
  return [...UTM_FIELDS, ...CLICK_FIELDS].some((f) => a[f] !== null);
}

function referrerDomain(): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  try {
    const raw = document.referrer;
    if (!raw) return null;
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    const here = window.location.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host === here || host === '704collective.com') return null;
    return clean(host);
  } catch {
    return null;
  }
}

function fromSearch(search: string, pathname: string, capturedAt: string): AttributionTouch {
  const p = new URLSearchParams(search);
  return {
    utm_source: clean(p.get('utm_source')),
    utm_medium: clean(p.get('utm_medium')),
    utm_campaign: clean(p.get('utm_campaign')),
    utm_content: clean(p.get('utm_content')),
    utm_term: clean(p.get('utm_term')),
    fbclid: clean(p.get('fbclid')),
    landing_path: clean(pathname),
    referrer: referrerDomain(),
    captured_at: capturedAt,
  };
}

function asTouch(parsed: Partial<AttributionTouch> & Partial<Attribution>, capturedAt: string): AttributionTouch | null {
  const touch: AttributionTouch = {
    utm_source: clean(parsed.utm_source),
    utm_medium: clean(parsed.utm_medium),
    utm_campaign: clean(parsed.utm_campaign),
    utm_content: clean(parsed.utm_content),
    utm_term: clean(parsed.utm_term),
    fbclid: clean(parsed.fbclid),
    landing_path: clean(parsed.landing_path),
    referrer: clean(parsed.referrer),
    captured_at: clean(parsed.captured_at) ?? capturedAt,
  };
  return tagged(touch) ? touch : null;
}

function readJson(storage: Storage, key: string): unknown {
  const raw = storage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw) as unknown;
}

function writeJson(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}

type LatestStored = AttributionTouch & { expires_at: string };

function readLatest(): AttributionTouch | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = readJson(window.localStorage, LATEST_KEY) as Partial<LatestStored> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const expires = typeof parsed.expires_at === 'string' ? Date.parse(parsed.expires_at) : NaN;
    if (!Number.isFinite(expires) || expires <= Date.now()) {
      try { window.localStorage.removeItem(LATEST_KEY); } catch { /* ignore */ }
      return null;
    }
    return asTouch(parsed, new Date().toISOString());
  } catch {
    return null;
  }
}

function readFirst(): AttributionTouch | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = readJson(window.localStorage, FIRST_KEY);
    if (!parsed || typeof parsed !== 'object') return null;
    return asTouch(parsed as Partial<AttributionTouch>, new Date().toISOString());
  } catch {
    return null;
  }
}

/** One-time read of the pre-localStorage session key. Copies it, then deletes it. */
function migrateSessionOnce(): AttributionTouch | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = readJson(window.sessionStorage, ATTRIBUTION_KEY);
    try { window.sessionStorage.removeItem(ATTRIBUTION_KEY); } catch { /* ignore */ }
    if (!parsed || typeof parsed !== 'object') return null;
    const touch = asTouch(parsed as Partial<Attribution>, new Date().toISOString());
    if (!touch) return null;
    const expires_at = new Date(Date.parse(touch.captured_at) + THIRTY_DAYS_MS).toISOString();
    writeJson(window.localStorage, LATEST_KEY, { ...touch, expires_at });
    if (!readFirst()) writeJson(window.localStorage, FIRST_KEY, touch);
    return touch;
  } catch {
    return null;
  }
}

function toAttribution(touch: AttributionTouch | null): Attribution | null {
  if (!touch) return null;
  return {
    utm_source: touch.utm_source,
    utm_medium: touch.utm_medium,
    utm_campaign: touch.utm_campaign,
    utm_content: touch.utm_content,
    fbclid: touch.fbclid,
    landing_path: touch.landing_path,
  };
}

export function readSourceTouches(): { first: AttributionTouch | null; latest: AttributionTouch | null } {
  let latest = readLatest();
  if (!latest) latest = migrateSessionOnce();
  return { first: readFirst(), latest };
}

export function readAttribution(): Attribution | null {
  return toAttribution(readSourceTouches().latest);
}

/**
 * Captures utm_* and fbclid off the current URL. Safe to call on every route
 * change; only a URL with real params writes. A new tagged click replaces
 * latest_touch. first_touch is written only when empty.
 */
export function captureAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  const now = new Date().toISOString();
  const incoming = fromSearch(window.location.search, window.location.pathname, now);
  if (!tagged(incoming)) return readAttribution();
  try {
    const expires_at = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
    writeJson(window.localStorage, LATEST_KEY, { ...incoming, expires_at });
    if (!readFirst()) writeJson(window.localStorage, FIRST_KEY, incoming);
  } catch {
    // Private-mode Safari and storage-disabled browsers throw. Attribution is
    // never worth breaking a signup over.
  }
  return toAttribution(incoming);
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
