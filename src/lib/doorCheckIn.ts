// One door decision for QR, name search, the roster button, and bulk select.
// Membership is the person's profile (isRsvpEligibleMember + member_type).
// people.member_tier is intentionally not an input.

import { isRsvpEligibleMember, type RsvpEligibilityProfile } from '@/lib/rsvpEligibility';

export type DoorCode =
  | 'wrong_event'
  | 'voided'
  | 'expired'
  | 'already_checked_in'
  | 'event_cancelled'
  | 'event_rescheduled'
  | 'not_a_member'
  | 'wrong_tier'
  | 'inactive_credential';

export type DoorCredential = {
  id: string;
  person_id: string;
  event_id: string | null;
  credential_type: string;
  status: string;
  checked_in_at: string | null;
};

export type DoorProfile = (RsvpEligibilityProfile & {
  member_type?: string | null;
}) | null;

export type DoorEvent = {
  id: string;
  required_tier?: string | null;
  status?: string | null;
};

export type DoorDecision =
  | { outcome: 'allow' }
  | { outcome: 'stop'; code: 'already_checked_in'; message: string }
  | { outcome: 'hard_block'; code: 'wrong_event' | 'voided' | 'expired' | 'inactive_credential'; message: string }
  | { outcome: 'override'; failedChecks: DoorCode[]; message: string };

const MESSAGES: Record<Exclude<DoorCode, 'wrong_tier'>, string> = {
  wrong_event: 'This pass is for a different event',
  voided: 'This pass is no longer valid',
  expired: 'This pass has expired',
  already_checked_in: 'Already checked in',
  event_cancelled: 'This event is cancelled',
  event_rescheduled: 'This event was rescheduled',
  not_a_member: 'Not an active member',
  inactive_credential: 'This pass is not active',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWalletProfileScan(raw: string): boolean {
  return UUID_RE.test(raw.trim());
}

function isGuestLike(credential: DoorCredential): boolean {
  const type = (credential.credential_type || '').toLowerCase();
  return type === 'guest_pass' || type === 'public_rsvp';
}

export function tierAllows(memberType: string | null | undefined, requiredTier: string | null | undefined): boolean {
  const tier = (requiredTier ?? 'public').toLowerCase();
  if (tier === 'public' || tier === 'social' || tier === '') return true;
  if (tier === 'business' || tier === 'founder') return (memberType ?? '').toLowerCase() === 'business';
  return false;
}

function tierMessage(requiredTier: string | null | undefined): string {
  const tier = (requiredTier ?? '').toLowerCase();
  if (tier === 'business' || tier === 'founder') return 'Business members only';
  return 'Not eligible for this event';
}

function codeMessage(code: DoorCode, requiredTier?: string | null): string {
  if (code === 'wrong_tier') return tierMessage(requiredTier);
  return MESSAGES[code];
}

function hard(code: 'wrong_event' | 'voided' | 'expired' | 'inactive_credential'): DoorDecision {
  return { outcome: 'hard_block', code, message: codeMessage(code) };
}

export function decideDoorCheckIn(input: {
  credential: DoorCredential;
  event: DoorEvent;
  profile: DoorProfile;
  nowMs?: number;
}): DoorDecision {
  const { credential, event, profile, nowMs } = input;
  if (credential.event_id && credential.event_id !== event.id) return hard('wrong_event');

  const status = (credential.status || '').toLowerCase();
  if (status === 'voided') return hard('voided');
  if (status === 'expired') return hard('expired');
  if (credential.checked_in_at) {
    return { outcome: 'stop', code: 'already_checked_in', message: MESSAGES.already_checked_in };
  }

  const failed: DoorCode[] = [];
  const eventStatus = (event.status ?? '').toLowerCase();
  if (eventStatus === 'cancelled' || eventStatus === 'canceled') failed.push('event_cancelled');
  else if (eventStatus === 'rescheduled') failed.push('event_rescheduled');

  if (isGuestLike(credential)) {
    if (status !== 'active') return hard('inactive_credential');
    if (failed.length) {
      return { outcome: 'override', failedChecks: failed, message: failed.map(c => codeMessage(c, event.required_tier)).join(' ') };
    }
    return { outcome: 'allow' };
  }

  if (status !== 'active' && status !== 'used') return hard('inactive_credential');

  if (!isRsvpEligibleMember(profile, nowMs)) failed.push('not_a_member');
  else if (!tierAllows(profile?.member_type, event.required_tier)) failed.push('wrong_tier');

  if (failed.length) {
    return { outcome: 'override', failedChecks: failed, message: failed.map(c => codeMessage(c, event.required_tier)).join(' ') };
  }
  return { outcome: 'allow' };
}

/** Wallet barcode is a profile id. Prefer this event's credential, then a standing member pass. */
export function pickWalletCredential(credentials: DoorCredential[], eventId: string): DoorCredential | null {
  const here = credentials.filter(c => c.event_id === eventId);
  const checkedIn = here.find(c => c.checked_in_at);
  if (checkedIn) return checkedIn;

  const activeHere = here.filter(c => (c.status || '').toLowerCase() === 'active');
  if (activeHere.length) {
    const prefer = ['member_rsvp', 'guest_pass', 'public_rsvp', 'member'];
    for (const type of prefer) {
      const hit = activeHere.find(c => (c.credential_type || '').toLowerCase() === type);
      if (hit) return hit;
    }
    return activeHere[0];
  }

  const usedMember = here.find(c =>
    !c.checked_in_at
    && (c.status || '').toLowerCase() === 'used'
    && (c.credential_type || '').toLowerCase() === 'member_rsvp',
  );
  if (usedMember) return usedMember;

  const standing = credentials.find(c =>
    !c.event_id
    && (c.credential_type || '').toLowerCase() === 'member'
    && (c.status || '').toLowerCase() === 'active'
    && !c.checked_in_at,
  );
  if (standing) return standing;

  const deadHere = here.find(c => {
    const status = (c.status || '').toLowerCase();
    return status === 'voided' || status === 'expired';
  });
  if (deadHere) return deadHere;

  return credentials.find(c => !c.event_id && (c.credential_type || '').toLowerCase() === 'member') ?? null;
}

export function overrideReasonOk(reason: string | null | undefined): boolean {
  return !!reason && reason.trim().length >= 3;
}

export type CheckInPatch = {
  checked_in_at: string;
  status: 'used';
  checkin_override_reason: string | null;
  checkin_failed_checks: string[] | null;
};

export function checkInPatch(
  nowIso: string,
  override: { reason: string; failedChecks: string[] } | null,
): CheckInPatch {
  return {
    checked_in_at: nowIso,
    status: 'used',
    checkin_override_reason: override ? override.reason.trim() : null,
    checkin_failed_checks: override ? [...override.failedChecks] : null,
  };
}

export function formatBulkSummary(checkedIn: number, skipped: { message: string }[]): string {
  if (skipped.length === 0) return `${checkedIn} checked in`;
  const reasons = [...new Set(skipped.map(s => s.message))].join('; ');
  return `${checkedIn} checked in, ${skipped.length} skipped: ${reasons}`;
}
