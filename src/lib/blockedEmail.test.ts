import { describe, expect, it } from 'vitest';
import { JOIN_BLOCKED_EMAIL_MESSAGE, normalizeJoinEmail } from './blockedEmail';

describe('blockedEmail', () => {
  it('normalizes trim and case', () => {
    expect(normalizeJoinEmail('  A@B.Com ')).toBe('a@b.com');
  });

  it('keeps the public rejection copy stable', () => {
    expect(JOIN_BLOCKED_EMAIL_MESSAGE).toBe("This email can't be used to join 704 Collective.");
  });
});
