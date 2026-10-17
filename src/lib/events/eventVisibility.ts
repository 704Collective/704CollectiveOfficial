export const CANCELLED_PREFIX_COLOR = '#E57373';

export type CancelMode = 'standard' | 'not_hosting';

export function isNotHostingLive(
  e: { status?: string | null; cancel_mode?: string | null; end_time?: string | null },
  nowMs = Date.now(),
): boolean {
  return e.status === 'cancelled'
    && e.cancel_mode === 'not_hosting'
    && !!e.end_time
    && new Date(e.end_time).getTime() > nowMs;
}

export function showCancelledPrefix(
  e: { status?: string | null; cancel_mode?: string | null },
): boolean {
  return e.status === 'cancelled' && e.cancel_mode === 'not_hosting';
}

/** Composer stays open for a live event, or a not_hosting cancel before end_time. */
export function discussionComposerOpen(
  e: { status?: string | null; cancel_mode?: string | null; end_time?: string | null },
  nowMs = Date.now(),
): boolean {
  if (e.status === 'rescheduled') return false;
  if (e.status === 'cancelled') return isNotHostingLive(e, nowMs);
  return true;
}

/** PostgREST `.or()` value: scheduled, or a still-open not_hosting cancel. */
export function visibleUpcomingOrFilter(nowIso = new Date().toISOString()): string {
  return `status.eq.scheduled,and(status.eq.cancelled,cancel_mode.eq.not_hosting,end_time.gt.${nowIso})`;
}

type EventsClient = {
  from: (table: 'events') => {
    select: (cols: string) => any;
  };
};

/** Upcoming published events: scheduled (today) plus live not_hosting cancels. Two queries so `.or()` never overwrites the time window. */
export async function fetchVisibleUpcomingEvents<T>(
  supabase: EventsClient,
  opts: { thirtyMinsAgoIso: string; untilIso: string; nowIso?: string },
): Promise<T[]> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const base = () =>
    supabase.from('events').select('*').eq('is_published', true).lte('start_time', opts.untilIso);
  const [scheduled, kept] = await Promise.all([
    base()
      .eq('status', 'scheduled')
      .or(`end_time.gte.${opts.thirtyMinsAgoIso},and(end_time.is.null,start_time.gte.${opts.thirtyMinsAgoIso})`)
      .order('start_time', { ascending: true }),
    base()
      .eq('status', 'cancelled')
      .eq('cancel_mode', 'not_hosting')
      .gt('end_time', nowIso)
      .order('start_time', { ascending: true }),
  ]);
  if (scheduled.error) throw scheduled.error;
  if (kept.error) throw kept.error;
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of [...(scheduled.data ?? []), ...(kept.data ?? [])] as Array<T & { id: string; start_time: string }>) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  out.sort((a, b) => new Date((a as { start_time: string }).start_time).getTime() - new Date((b as { start_time: string }).start_time).getTime());
  return out;
}
