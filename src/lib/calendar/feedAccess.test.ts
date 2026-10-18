import { describe, expect, it } from 'vitest';
import { calendarFeedMembershipHttpStatus } from './feedAccess';

const NOW = Date.parse('2026-10-18T19:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';

describe('calendarFeedMembershipHttpStatus', () => {
  it('keeps today\'s 200 for active', () => {
    expect(calendarFeedMembershipHttpStatus({ subscription_status: 'active' }, NOW)).toBe(200);
  });

  it('past_due / paused / trialing stay 403 (same as today)', () => {
    expect(calendarFeedMembershipHttpStatus({ subscription_status: 'past_due' }, NOW)).toBe(403);
    expect(calendarFeedMembershipHttpStatus({ subscription_status: 'paused' }, NOW)).toBe(403);
    expect(calendarFeedMembershipHttpStatus({ subscription_status: 'trialing' }, NOW)).toBe(403);
  });

  it('comped/override member with inactive status stays 403 (same as today)', () => {
    expect(
      calendarFeedMembershipHttpStatus(
        { subscription_status: 'inactive', membership_override: true },
        NOW,
      ),
    ).toBe(403);
    expect(
      calendarFeedMembershipHttpStatus(
        { subscription_status: 'inactive', comp_reason: 'Founding seat' },
        NOW,
      ),
    ).toBe(403);
  });

  it('canceled with subscription_ends_at in the future is NOT 410', () => {
    expect(
      calendarFeedMembershipHttpStatus(
        { subscription_status: 'canceled', subscription_ends_at: FUTURE },
        NOW,
      ),
    ).toBe(403);
  });

  it('canceled + ended is 410', () => {
    expect(
      calendarFeedMembershipHttpStatus(
        { subscription_status: 'canceled', subscription_ends_at: PAST },
        NOW,
      ),
    ).toBe(410);
    expect(
      calendarFeedMembershipHttpStatus(
        { subscription_status: 'canceled', subscription_ends_at: null },
        NOW,
      ),
    ).toBe(410);
  });
});
