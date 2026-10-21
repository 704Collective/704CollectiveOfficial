import { describe, expect, it } from 'vitest';
import { parseCheckEmailStatusBody } from '../../supabase/functions/_shared/parseCheckEmailStatusBody';

describe('parseCheckEmailStatusBody', () => {
  it('rejects malformed JSON with 400 wording', () => {
    expect(parseCheckEmailStatusBody('{')).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(parseCheckEmailStatusBody('not-json')).toEqual({ ok: false, error: 'Invalid JSON body' });
    expect(parseCheckEmailStatusBody('')).toEqual({ ok: false, error: 'Invalid JSON body' });
  });

  it('rejects a missing email', () => {
    expect(parseCheckEmailStatusBody('{}')).toEqual({
      ok: false,
      error: 'Missing required field: email',
    });
    expect(parseCheckEmailStatusBody('{"email":"  "}')).toEqual({
      ok: false,
      error: 'Missing required field: email',
    });
    expect(parseCheckEmailStatusBody('null')).toEqual({
      ok: false,
      error: 'Missing required field: email',
    });
  });

  it('returns a trimmed email and leaves format checks to the function', () => {
    expect(parseCheckEmailStatusBody('{"email":"  Person@Example.com  "}')).toEqual({
      ok: true,
      email: 'Person@Example.com',
    });
  });
});
