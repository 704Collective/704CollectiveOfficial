// Paid-window guard for pending-cancel members.
//
// A member who cancelled at period end keeps full access until
// profiles.subscription_ends_at - but may not take a seat at an event that
// starts AFTER that date. Members with cancel_at_period_end=false are never
// affected. The refusal is a kind one: HTTP 200 + { success:false, code } so
// the browser never logs it as an error (same shape as the +1 wave).

export const MEMBERSHIP_ENDS_BEFORE_EVENT = "MEMBERSHIP_ENDS_BEFORE_EVENT";

export type WindowProfile = { cancel_at_period_end?: boolean | null; subscription_ends_at?: string | null };

/** True when the member is pending-cancel and the event starts after their paid window ends. */
export function membershipEndsBeforeEvent(profile: WindowProfile | null | undefined, eventStartIso: string | null | undefined): boolean {
  if (!profile || profile.cancel_at_period_end !== true || !profile.subscription_ends_at || !eventStartIso) return false;
  return new Date(eventStartIso).getTime() > new Date(profile.subscription_ends_at).getTime();
}

export function membershipEndsLabel(endsAtIso: string): string {
  return new Date(endsAtIso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** The kind refusal body. */
export function membershipEndsBeforeEventBody(endsAtIso: string) {
  return {
    success: false,
    code: MEMBERSHIP_ENDS_BEFORE_EVENT,
    ends_at: endsAtIso,
    error: `Your membership ends ${membershipEndsLabel(endsAtIso)}, before this event.`,
  };
}

export function membershipEndsBeforeEventResponse(corsHeaders: Record<string, string>, endsAtIso: string): Response {
  return new Response(JSON.stringify(membershipEndsBeforeEventBody(endsAtIso)), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
