import { describe, expect, it } from 'vitest';
import { emailCheckStatus } from './emailCheckStatus';

const NOW = Date.parse('2026-10-18T19:00:00.000Z');
const FUTURE = '2026-12-01T00:00:00.000Z';
const PAST = '2026-09-01T00:00:00.000Z';

describe('emailCheckStatus', () => {
  it('treats override_paying + inactive as an existing contact (Audrey case)', () => {
    expect(
      emailCheckStatus({
        profile: { subscription_status: 'inactive', membership_override: false },
        hasPerson: true,
        nowMs: NOW,
      }),
    ).toBe('existing_contact');
  });

  it('treats an active profile as an active member', () => {
    expect(
      emailCheckStatus({
        profile: { subscription_status: 'active' },
        hasPerson: true,
        nowMs: NOW,
      }),
    ).toBe('active_member');
  });

  it('treats membership_override as an active member', () => {
    expect(
      emailCheckStatus({
        profile: { subscription_status: 'inactive', membership_override: true },
        hasPerson: true,
        nowMs: NOW,
      }),
    ).toBe('active_member');
  });

  it('treats canceled but paid through as an active member', () => {
    expect(
      emailCheckStatus({
        profile: { subscription_status: 'canceled', subscription_ends_at: FUTURE },
        hasPerson: true,
        nowMs: NOW,
      }),
    ).toBe('active_member');
  });

  it('treats canceled and ended as an existing contact', () => {
    expect(
      emailCheckStatus({
        profile: { subscription_status: 'canceled', subscription_ends_at: PAST },
        hasPerson: true,
        nowMs: NOW,
      }),
    ).toBe('existing_contact');
  });

  it('leaves a brand new email unchanged', () => {
    expect(emailCheckStatus({ profile: null, hasPerson: false, nowMs: NOW })).toBe('new');
  });
});
