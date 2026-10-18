import { describe, expect, it } from 'vitest';
import { calendarFeedHttpStatus } from './feedAccess';

const NOW = Date.parse('2026-10-18T19:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';
const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function statusOf(
  profile: Parameters<typeof calendarFeedHttpStatus>[0]['profile'],
  extra: { token?: string; scope?: 'social' | 'business' | 'all' | 'rsvp_only' } = {},
) {
  return calendarFeedHttpStatus({
    token: extra.token ?? TOKEN,
    profile,
    scope: extra.scope ?? 'rsvp_only',
    nowMs: NOW,
  });
}

describe('calendarFeedHttpStatus (RSVP eligibility)', () => {
  it('active -> 200', () => {
    expect(statusOf({ subscription_status: 'active' })).toBe(200);
  });

  it('trialing -> 200', () => {
    expect(statusOf({ subscription_status: 'trialing' })).toBe(200);
  });

  it('past_due -> 200', () => {
    expect(statusOf({ subscription_status: 'past_due' })).toBe(200);
  });

  it('paused -> 200 (RSVP-live status; discussion SQL also includes paused)', () => {
    expect(statusOf({ subscription_status: 'paused' })).toBe(200);
  });

  it('canceled + ends_at future -> 200 (paid window)', () => {
    expect(
      statusOf({ subscription_status: 'canceled', subscription_ends_at: FUTURE }),
    ).toBe(200);
  });

  it('canceled + ended -> 410', () => {
    expect(
      statusOf({ subscription_status: 'canceled', subscription_ends_at: PAST }),
    ).toBe(410);
  });

  it('inactive + membership_override -> 200', () => {
    expect(
      statusOf({ subscription_status: 'inactive', membership_override: true }),
    ).toBe(200);
  });

  it('inactive + comp_reason only (no override) -> 410', () => {
    const profile = {
      subscription_status: 'inactive',
      membership_override: false,
      comp_reason: 'Founding seat',
    };
    expect(statusOf(profile)).toBe(410);
  });

  it('canceled + ended + comp_reason (Annslee) -> 410', () => {
    const profile = {
      subscription_status: 'canceled',
      subscription_ends_at: PAST,
      comp_reason: 'Comp ended',
    };
    expect(statusOf(profile)).toBe(410);
  });

  it('inactive, no override -> 410', () => {
    expect(statusOf({ subscription_status: 'inactive' })).toBe(410);
  });

  it('wrong tier -> 403', () => {
    expect(
      statusOf(
        { subscription_status: 'active', member_type: 'social' },
        { scope: 'business' },
      ),
    ).toBe(403);
  });

  it('unknown token (no profile) -> 404', () => {
    expect(statusOf(null)).toBe(404);
  });

  it('bad format -> 400', () => {
    expect(statusOf(null, { token: 'not-a-uuid' })).toBe(400);
  });
});
