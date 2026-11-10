import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HUMAN_CHECK_MESSAGE,
  SITEVERIFY_URL,
  hashTurnstileIp,
  normalizeTurnstileForm,
  turnstileMode,
  verifyTurnstile,
} from './verify';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.TURNSTILE_SECRET_KEY = originalEnv.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_MODE = originalEnv.TURNSTILE_MODE;
  vi.unstubAllGlobals();
});

describe('turnstile helpers', () => {
  it('defaults mode to log', () => {
    delete process.env.TURNSTILE_MODE;
    expect(turnstileMode()).toBe('log');
    process.env.TURNSTILE_MODE = 'BLOCK';
    expect(turnstileMode()).toBe('block');
    process.env.TURNSTILE_MODE = 'nope';
    expect(turnstileMode()).toBe('log');
  });

  it('normalizes form names', () => {
    expect(normalizeTurnstileForm(' SignUp ')).toBe('signup');
    expect(normalizeTurnstileForm('login magic!!!')).toBe('loginmagic');
    expect(normalizeTurnstileForm('')).toBe('unknown');
  });

  it('hashes IPs stably without returning the raw value', () => {
    const hash = hashTurnstileIp('203.0.113.9');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('203.0.113.9');
    expect(hash).toBe(hashTurnstileIp('203.0.113.9'));
  });

  it('skips when the secret is unset', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const result = await verifyTurnstile('tok', '1.1.1.1');
    expect(result).toEqual({ ok: true, errorCodes: [], reason: 'skipped' });
  });

  it('returns missing_token when secret is set and token is blank', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const result = await verifyTurnstile('  ', '1.1.1.1');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_token');
  });

  it('skips on Cloudflare 5xx and network failure', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 503 })) as typeof fetch;
    expect(await verifyTurnstile('tok', '1.1.1.1')).toMatchObject({ ok: true, reason: 'skipped' });

    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    expect(await verifyTurnstile('tok', '1.1.1.1')).toMatchObject({
      ok: true,
      reason: 'skipped',
      errorCodes: ['internal-unreachable'],
    });
  });

  it('posts secret, token, and remoteip to siteverify', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe(SITEVERIFY_URL);
      expect(init?.method).toBe('POST');
      const body = String(init?.body);
      expect(body).toContain('secret=secret');
      expect(body).toContain('response=good-token');
      expect(body).toContain('remoteip=203.0.113.9');
      return new Response(JSON.stringify({ success: true, 'error-codes': [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const result = await verifyTurnstile('good-token', '203.0.113.9');
    expect(result).toEqual({ ok: true, errorCodes: [], reason: 'ok' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('maps Cloudflare failure to ok=false', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
          status: 200,
        }),
    ) as typeof fetch;
    const result = await verifyTurnstile('tampered', '1.1.1.1');
    expect(result).toEqual({
      ok: false,
      errorCodes: ['invalid-input-response'],
      reason: 'failed',
    });
  });

  it('keeps the public block copy stable', () => {
    expect(HUMAN_CHECK_MESSAGE).toBe('Please complete the human check');
  });
});
