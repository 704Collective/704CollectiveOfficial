import { describe, expect, it } from 'vitest';
import { postAuthDestination } from './postAuthRedirect';

const dest = (
  profile: Parameters<typeof postAuthDestination>[0],
  options?: Parameters<typeof postAuthDestination>[1],
) => postAuthDestination(profile, options);

describe('postAuthDestination blast radius', () => {
  it('sends admins to /admin (byte-identical)', () => {
    expect(dest({ role: 'admin', subscription_status: 'past_due' })).toBe('/admin');
    expect(dest({ role: 'super_admin', subscription_status: 'canceled' })).toBe('/admin');
  });

  it('sends partners to /partner-portal (byte-identical)', () => {
    expect(dest({ member_type: 'partner', subscription_status: 'inactive' })).toBe(
      '/partner-portal',
    );
  });

  it('sends active / trialing / override to /dashboard (byte-identical)', () => {
    expect(dest({ subscription_status: 'active' })).toBe('/dashboard');
    expect(dest({ subscription_status: 'trialing' })).toBe('/dashboard');
    expect(dest({ subscription_status: 'canceled', membership_override: true })).toBe(
      '/dashboard',
    );
  });

  it('sends non-members to /dashboard (byte-identical)', () => {
    expect(dest({ member_type: 'social_non_member', subscription_status: 'inactive' })).toBe(
      '/dashboard',
    );
    expect(dest({ member_type: 'business_non_member' })).toBe('/dashboard');
    expect(dest({ member_type: 'non_member' })).toBe('/dashboard');
  });

  it('sends canceled to /membership-ended (byte-identical)', () => {
    expect(dest({ subscription_status: 'canceled' })).toBe('/membership-ended');
    expect(dest({ subscription_status: 'cancelled' })).toBe('/membership-ended');
  });

  it('sends never-members and missing profile to the prior targets (byte-identical)', () => {
    expect(dest({ subscription_status: null })).toBe('/dashboard');
    expect(dest({ subscription_status: 'inactive' })).toBe('/dashboard');
    expect(dest(null)).toBe('/signup');
    expect(dest(undefined, { fallbackNoAccess: '/join' })).toBe('/join');
  });

  it('honors a safe explicit redirect (byte-identical)', () => {
    expect(
      dest({ subscription_status: 'canceled' }, { redirectTo: '/events/abc' }),
    ).toBe('/events/abc');
    expect(
      dest({ subscription_status: 'active' }, { redirectTo: '//evil.com' }),
    ).toBe('/dashboard');
  });

  it('sends unpaid and other unknown bad states to /membership-ended (byte-identical)', () => {
    expect(dest({ subscription_status: 'unpaid' })).toBe('/membership-ended');
    expect(dest({ subscription_status: 'paused' })).toBe('/membership-ended');
  });

  it('sends past_due members to /dashboard so they can update billing', () => {
    expect(dest({ subscription_status: 'past_due' })).toBe('/dashboard');
    expect(
      dest({ subscription_status: 'past_due', member_type: 'social' }),
    ).toBe('/dashboard');
  });
});
