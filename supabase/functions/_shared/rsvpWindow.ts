// Scheduled RSVP opening, shared by every door that can turn someone away.
//
// events.rsvp_opens_at is null on every event that does not use the feature, and
// null always means open. A future timestamp means every public door says no.
//
// The doors are the authority on this rule; the INSERT-only trigger on
// attendance_credentials is only a backstop for callers that skip a door.
//
// Times are formatted in Charlotte's zone on purpose: Deno runs in UTC, and a
// member reading "RSVPs open Friday, Aug 22 at 8:00 AM" for a noon opening is
// worse than no message at all.

const EVENT_TZ = "America/New_York";

/** True when this event has an opening time that has not arrived yet. */
export function rsvpNotOpen(rsvpOpensAt: string | null | undefined): boolean {
  if (!rsvpOpensAt) return false;
  const opens = new Date(rsvpOpensAt).getTime();
  if (Number.isNaN(opens)) return false;
  return Date.now() < opens;
}

/** "RSVPs open Friday, Aug 22 at 12:00 PM" — the copy every door returns. */
export function rsvpOpensCopy(rsvpOpensAt: string): string {
  const d = new Date(rsvpOpensAt);
  const datePart = d.toLocaleDateString("en-US", {
    timeZone: EVENT_TZ, weekday: "long", month: "short", day: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: EVENT_TZ, hour: "numeric", minute: "2-digit",
  });
  return `RSVPs open ${datePart} at ${timePart}`;
}
