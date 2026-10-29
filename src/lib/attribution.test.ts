import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTRIBUTION_KEY, captureAttribution, readAttributionPayload, readSourceTouches } from './attribution';

function memStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    dump: () => data,
  };
}

function install(search: string, referrer = '') {
  const local = memStorage();
  const session = memStorage();
  const win = {
    localStorage: local,
    sessionStorage: session,
    location: { search, pathname: '/join', hostname: '704collective.com' },
    document: { referrer },
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', win.document);
  return { local, session };
}

describe('attribution storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores first and latest on one page and a later click', () => {
    const { local } = install('?utm_source=instagram&utm_medium=social&utm_campaign=one&utm_content=bio&utm_term=term&fbclid=fb');
    captureAttribution();
    const first = readSourceTouches().first;
    expect(first?.utm_source).toBe('instagram');
    expect(first?.utm_term).toBe('term');
    window.location.search = '?utm_source=facebook&utm_campaign=two';
    captureAttribution();
    const touches = readSourceTouches();
    expect(touches.first?.utm_source).toBe('instagram');
    expect(touches.latest?.utm_source).toBe('facebook');
    expect(touches.latest?.utm_campaign).toBe('two');
    expect(readAttributionPayload()).toEqual({
      utm_source: 'facebook',
      utm_medium: null,
      utm_campaign: 'two',
      utm_content: null,
      fbclid: null,
    });
    expect(local.dump().has('attribution_first')).toBe(true);
  });

  it('reads the old sessionStorage key once', () => {
    const { session } = install('');
    session.setItem(ATTRIBUTION_KEY, JSON.stringify({
      utm_source: 'ig', utm_medium: 'social', utm_campaign: 'old', utm_content: 'bio', fbclid: null, landing_path: '/events',
    }));
    const touches = readSourceTouches();
    expect(touches.latest?.utm_source).toBe('ig');
    expect(touches.first?.utm_campaign).toBe('old');
    expect(session.getItem(ATTRIBUTION_KEY)).toBeNull();
    const again = readSourceTouches();
    expect(again.latest?.utm_source).toBe('ig');
  });

  it('drops an expired latest touch', () => {
    const { local } = install('');
    local.setItem('attribution_latest', JSON.stringify({
      utm_source: 'ig', utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
      fbclid: null, landing_path: '/', referrer: null, captured_at: '2020-01-01T00:00:00.000Z',
      expires_at: '2020-02-01T00:00:00.000Z',
    }));
    expect(readSourceTouches().latest).toBeNull();
  });

  it('saves only the external referrer domain', () => {
    install('?utm_source=ig', 'https://www.instagram.com/some/path');
    captureAttribution();
    expect(readSourceTouches().latest?.referrer).toBe('instagram.com');
    (document as { referrer: string }).referrer = 'https://704collective.com/events';
    window.location.search = '?utm_source=fb';
    captureAttribution();
    expect(readSourceTouches().latest?.referrer).toBeNull();
    expect(readSourceTouches().first?.referrer).toBe('instagram.com');
  });
});
