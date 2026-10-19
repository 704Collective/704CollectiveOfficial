import { describe, expect, it } from 'vitest';
import {
  checkInPatch,
  decideDoorCheckIn,
  formatBulkSummary,
  isWalletProfileScan,
  overrideReasonOk,
  pickWalletCredential,
  type DoorCredential,
  type DoorEvent,
  type DoorProfile,
} from './doorCheckIn';

const NOW = Date.parse('2026-10-19T22:00:00Z');
const EVENT = 'event-1';
const OTHER = 'event-2';

const socialEvent: DoorEvent = { id: EVENT, required_tier: 'social', status: 'scheduled' };
const businessEvent: DoorEvent = { id: EVENT, required_tier: 'business', status: 'scheduled' };

const eligible: DoorProfile = {
  subscription_status: 'active',
  member_type: 'social',
  membership_override: false,
};
const eligibleNullType: DoorProfile = {
  subscription_status: 'active',
  member_type: null,
  membership_override: false,
};
const eligibleBusiness: DoorProfile = {
  subscription_status: 'active',
  member_type: 'business',
  membership_override: false,
};
const exMember: DoorProfile = {
  subscription_status: 'inactive',
  member_type: 'business',
  membership_override: false,
};

function cred(overrides: Partial<DoorCredential> = {}): DoorCredential {
  return {
    id: 'cred-1',
    person_id: 'person-1',
    event_id: EVENT,
    credential_type: 'member_rsvp',
    status: 'active',
    checked_in_at: null,
    ...overrides,
  };
}

function decide(overrides: {
  credential?: Partial<DoorCredential>;
  event?: Partial<DoorEvent>;
  profile?: DoorProfile;
} = {}) {
  return decideDoorCheckIn({
    credential: cred(overrides.credential),
    event: { ...socialEvent, ...overrides.event },
    profile: overrides.profile === undefined ? eligible : overrides.profile,
    nowMs: NOW,
  });
}

describe('decideDoorCheckIn', () => {
  it('hard-blocks a pass for a different event, with no override', () => {
    const decision = decide({ credential: { event_id: OTHER } });
    expect(decision).toEqual({
      outcome: 'hard_block',
      code: 'wrong_event',
      message: 'This pass is for a different event',
    });
  });

  it('hard-blocks a voided pass before membership', () => {
    expect(decide({ credential: { status: 'voided' }, profile: exMember }).outcome).toBe('hard_block');
    expect(decide({ credential: { status: 'voided' } })).toMatchObject({ code: 'voided' });
  });

  it('hard-blocks an expired pass', () => {
    expect(decide({ credential: { status: 'expired' } })).toMatchObject({
      outcome: 'hard_block',
      code: 'expired',
    });
  });

  it('stops when already checked in and does not produce a write', () => {
    const decision = decide({
      credential: { checked_in_at: '2026-10-19T21:00:00Z' },
      event: { status: 'cancelled' },
      profile: exMember,
    });
    expect(decision).toMatchObject({ outcome: 'stop', code: 'already_checked_in' });
    expect(decision.outcome === 'allow').toBe(false);
  });

  it('asks for an override when the event is cancelled or rescheduled', () => {
    const cancelled = decide({ event: { status: 'cancelled' } });
    expect(cancelled).toMatchObject({
      outcome: 'override',
      failedChecks: ['event_cancelled'],
      message: 'This event is cancelled',
    });
    expect(decide({ event: { status: 'canceled' } })).toMatchObject({ failedChecks: ['event_cancelled'] });
    expect(decide({ event: { status: 'rescheduled' } })).toMatchObject({
      outcome: 'override',
      failedChecks: ['event_rescheduled'],
    });
  });

  it('admits an eligible member whose people tier is irrelevant, including a null member type', () => {
    expect(decide({ profile: eligibleNullType })).toEqual({ outcome: 'allow' });
    expect(decide()).toEqual({ outcome: 'allow' });
  });

  it('refuses an ex-member who still has a business member type', () => {
    const decision = decide({ profile: exMember, event: businessEvent });
    expect(decision).toMatchObject({
      outcome: 'override',
      failedChecks: ['not_a_member'],
      message: 'Not an active member',
    });
  });

  it('refuses an eligible social member at a business event', () => {
    expect(decide({ event: businessEvent })).toMatchObject({
      outcome: 'override',
      failedChecks: ['wrong_tier'],
      message: 'Business members only',
    });
  });

  it('admits an eligible business member to a business or social event', () => {
    expect(decide({ profile: eligibleBusiness, event: businessEvent })).toEqual({ outcome: 'allow' });
    expect(decide({ profile: eligibleBusiness })).toEqual({ outcome: 'allow' });
  });

  it('admits a standing member pass when the profile is eligible', () => {
    expect(decide({
      credential: { credential_type: 'member', event_id: null },
    })).toEqual({ outcome: 'allow' });
  });

  it('skips the membership check for a guest pass, a business +1, and a public RSVP', () => {
    expect(decide({
      credential: { credential_type: 'guest_pass' },
      profile: null,
    })).toEqual({ outcome: 'allow' });
    expect(decide({
      credential: { credential_type: 'public_rsvp' },
      profile: exMember,
    })).toEqual({ outcome: 'allow' });
  });

  it('still requires this event and an active credential for a guest', () => {
    expect(decide({
      credential: { credential_type: 'guest_pass', event_id: OTHER },
      profile: null,
    })).toMatchObject({ outcome: 'hard_block', code: 'wrong_event' });
    expect(decide({
      credential: { credential_type: 'guest_pass', status: 'voided' },
    })).toMatchObject({ code: 'voided' });
    expect(decide({
      credential: { credential_type: 'public_rsvp', status: 'expired' },
    })).toMatchObject({ code: 'expired' });
    expect(decide({
      credential: { credential_type: 'guest_pass', status: 'used' },
    })).toMatchObject({ outcome: 'hard_block', code: 'inactive_credential' });
  });

  it('records both a closed event and a failed membership check', () => {
    expect(decide({ profile: exMember, event: { status: 'cancelled' } })).toMatchObject({
      outcome: 'override',
      failedChecks: ['event_cancelled', 'not_a_member'],
    });
  });
});

describe('wallet QR', () => {
  const profileId = 'd5a2f089-2d5f-4366-8d61-2e02693da1f8';

  it('recognizes a profile id and ignores a credential token', () => {
    expect(isWalletProfileScan(profileId)).toBe(true);
    expect(isWalletProfileScan('C-abc123def0')).toBe(false);
  });

  it('uses this event credential, otherwise the standing member pass', () => {
    const eventPass = cred({ id: 'rsvp' });
    const standing = cred({ id: 'stand', credential_type: 'member', event_id: null });
    expect(pickWalletCredential([standing, eventPass], EVENT)?.id).toBe('rsvp');
    expect(pickWalletCredential([standing], EVENT)?.id).toBe('stand');
  });

  it('keeps an already checked-in event credential so the timestamp is not rewritten', () => {
    const used = cred({ id: 'used', checked_in_at: '2026-10-19T21:00:00Z', status: 'used' });
    const standing = cred({ id: 'stand', credential_type: 'member', event_id: null });
    expect(pickWalletCredential([used, standing], EVENT)?.id).toBe('used');
  });

  it('falls through a voided event RSVP to an active standing pass', () => {
    const voided = cred({ id: 'voided', status: 'voided' });
    const standing = cred({ id: 'stand', credential_type: 'member', event_id: null });
    expect(pickWalletCredential([voided, standing], EVENT)?.id).toBe('stand');
  });

  it('admits an eligible member with a null member type from the standing pass', () => {
    const standing = cred({ credential_type: 'member', event_id: null });
    const picked = pickWalletCredential([standing], EVENT)!;
    expect(decideDoorCheckIn({
      credential: picked,
      event: socialEvent,
      profile: eligibleNullType,
      nowMs: NOW,
    })).toEqual({ outcome: 'allow' });
  });

  it('refuses an ex-member standing pass that still says business', () => {
    const standing = cred({ credential_type: 'member', event_id: null });
    expect(decideDoorCheckIn({
      credential: standing,
      event: socialEvent,
      profile: exMember,
      nowMs: NOW,
    })).toMatchObject({ outcome: 'override', failedChecks: ['not_a_member'] });
  });
});

describe('override and bulk', () => {
  it('requires a short reason and records the failed checks on the patch', () => {
    expect(overrideReasonOk('')).toBe(false);
    expect(overrideReasonOk('no')).toBe(false);
    expect(overrideReasonOk('  ok  ')).toBe(false);
    expect(overrideReasonOk('guest of host')).toBe(true);
    const patch = checkInPatch('2026-10-19T22:05:00Z', {
      reason: '  guest of host  ',
      failedChecks: ['not_a_member'],
    });
    expect(patch).toEqual({
      checked_in_at: '2026-10-19T22:05:00Z',
      status: 'used',
      checkin_override_reason: 'guest of host',
      checkin_failed_checks: ['not_a_member'],
    });
    expect(checkInPatch('2026-10-19T22:05:00Z', null).checkin_override_reason).toBeNull();
  });

  it('skips already-checked-in and hard-block rows and summarizes the rest', () => {
    const rows = [
      decide(),
      decide(),
      decide({ credential: { checked_in_at: '2026-10-19T21:00:00Z' } }),
      decide({ credential: { status: 'voided' } }),
      decide({ profile: exMember }),
    ];
    const admit = rows.filter(d => d.outcome === 'allow');
    const skipped = rows.filter(d => d.outcome !== 'allow');
    expect(admit).toHaveLength(2);
    expect(formatBulkSummary(8, [
      { message: skipped[0].message },
      { message: skipped[1].message },
    ])).toBe('8 checked in, 2 skipped: Already checked in; This pass is no longer valid');
    expect(skipped.some(d => d.outcome === 'override')).toBe(true);
  });
});
