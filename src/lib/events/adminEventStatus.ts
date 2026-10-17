/** Admin events list Status column: closed events beat the time-based Upcoming/Past pill. */
export type AdminEventStatusKind =
  | 'upcoming'
  | 'past'
  | 'cancelled'
  | 'cancelled_not_hosting'
  | 'rescheduled';

export type AdminEventStatusInput = {
  status?: string | null;
  cancel_mode?: string | null;
  start_time: string;
};

export function adminEventStatusLabel(
  e: AdminEventStatusInput,
  now = new Date(),
): { text: string; kind: AdminEventStatusKind } {
  if (e.status === 'cancelled') {
    return e.cancel_mode === 'not_hosting'
      ? { text: 'Cancelled - 704 not hosting', kind: 'cancelled_not_hosting' }
      : { text: 'Cancelled', kind: 'cancelled' };
  }
  if (e.status === 'rescheduled') {
    return { text: 'Rescheduled', kind: 'rescheduled' };
  }
  return new Date(e.start_time) > now
    ? { text: 'Upcoming', kind: 'upcoming' }
    : { text: 'Past', kind: 'past' };
}
