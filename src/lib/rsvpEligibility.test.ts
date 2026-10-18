import { describe, expect, it } from 'vitest';
import { isRsvpEligibleMember } from './rsvpEligibility';

const NOW = Date.parse('2026-10-18T19:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';

describe('isRsvpEligibleMember', () => {
  it('refuses inactive + comp_reason only (no override)', () => {
    const p = { subscription_status: 'inactive', comp_reason: 'Founding seat' };
    expect(isRsvpEligibleMember(p, NOW)).toBe(false);
  });

  it('refuses canceled + ended + comp_reason (Annslee case)', () => {
    const p = {
      subscription_status: 'canceled',
      subscription_ends_at: PAST,
      comp_reason: 'Comp ended',
    };
    expect(isRsvpEligibleMember(p, NOW)).toBe(false);
  });

  it('allows inactive + membership_override', () => {
    expect(
      isRsvpEligibleMember({ subscription_status: 'inactive', membership_override: true }, NOW),
    ).toBe(true);
  });

  it('allows canceled still in paid window', () => {
    expect(
      isRsvpEligibleMember(
        { subscription_status: 'canceled', subscription_ends_at: FUTURE },
        NOW,
      ),
    ).toBe(true);
  });
});
