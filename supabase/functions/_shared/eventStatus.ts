// Event lifecycle guard for the write doors.
//
// events.status: 'scheduled' | 'cancelled' | 'rescheduled'. A closed event
// (cancelled or rescheduled) takes no new RSVPs, guest passes, +1s, waitlist
// claims, checkouts or intake submissions. The refusal is the kind shape
// (HTTP 200 + { success:false, code }) so browsers never log it as an error.

export const EVENT_CANCELLED = "EVENT_CANCELLED";
export const CLOSED_EVENT_STATUSES = ["cancelled", "rescheduled"] as const;

export type EventStatusRow = { status?: string | null; rescheduled_to_event_id?: string | null; title?: string | null };

export function isEventClosed(ev: EventStatusRow | null | undefined): boolean {
  return !!ev && (CLOSED_EVENT_STATUSES as readonly string[]).includes(ev.status ?? "scheduled");
}

export function eventClosedBody(ev: EventStatusRow) {
  const moved = ev.status === "rescheduled" && ev.rescheduled_to_event_id;
  return {
    success: false,
    code: EVENT_CANCELLED,
    status: ev.status ?? "cancelled",
    rescheduled_to_event_id: ev.rescheduled_to_event_id ?? null,
    error: moved
      ? "This event has moved to a new date. RSVP for the new date instead."
      : "This event has been cancelled.",
  };
}

export function eventClosedResponse(corsHeaders: Record<string, string>, ev: EventStatusRow): Response {
  return new Response(JSON.stringify(eventClosedBody(ev)), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
