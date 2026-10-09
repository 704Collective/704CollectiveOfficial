// Business member +1 — client-side mirror of the eligibility rule the
// add-business-plus-one function enforces. The server is the authority; this
// only decides whether to show the control.
export type PlusOneEvent = { event_type?: string | null; required_tier?: string | null; start_time: string };

export const PLUS_ONE_SOURCE = 'business_plus_one';

export function isPlusOneEligibleEvent(ev: PlusOneEvent): boolean {
  const type = ev.event_type ?? null;
  const tier = ev.required_tier ?? null;
  if (type === 'social') return true;
  if (type === 'business') return !['business', 'founder'].includes(tier ?? '');
  return false;
}

export function plusOneEventStarted(ev: PlusOneEvent, now = Date.now()): boolean {
  return new Date(ev.start_time).getTime() <= now;
}

export type PlusOneSummary = { id: string; guest_name: string | null; guest_email: string | null; checked_in_at: string | null; created_at: string };
export type PlusOneStatus = { eligible: boolean; has_rsvp: boolean; started: boolean; plus_one: PlusOneSummary | null };

/** Label for a guest_pass credential on rosters: "+1 of Bea Business" when it is a business +1, else the default. */
export function plusOneLabel(metadata: Record<string, unknown> | null | undefined, fallback: string): string {
  if (metadata && metadata.source === PLUS_ONE_SOURCE) {
    const m = typeof metadata.member_name === 'string' && metadata.member_name.trim() ? metadata.member_name.trim() : 'a business member';
    return `+1 of ${m}`;
  }
  return fallback;
}
