import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// ─── Tickets ────────────────────────────────────────────────────────────────

export function useTickets(userId: string) {
  return useQuery({
    queryKey: ['tickets', userId],
    queryFn: async () => {
      // Reads the canonical attendance_credentials layer via a SECURITY DEFINER
      // RPC resolved server-side for the authed user. Returns rows shaped like
      // the old tickets query: { id, event_id, status, checked_in_at, events: {...} }.
      const { data, error } = await supabase.rpc('get_my_events');

      if (error) throw error;
      return (data ?? []) as typeof data;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });
}

// ─── Next upcoming event ─────────────────────────────────────────────────────

export function useNextEvent(userId: string) {
  return useQuery({
    queryKey: ['nextEvent', userId],
    queryFn: async () => {
      const now = new Date().toISOString();

      // Canonical attendance_credentials via get_my_events (rows ordered by
      // events.start_time ASC). First upcoming RSVP wins, mirroring the old
      // tickets-table read.
      const { data: myEvents } = await supabase.rpc('get_my_events');

      type MyEventRow = {
        id: string; event_id: string; status: string; checked_in_at: string | null;
        events: {
          id: string; title: string; start_time: string; end_time: string | null;
          location_name: string | null; image_url: string | null;
        } | null;
      };

      const nextRsvp = ((myEvents ?? []) as unknown as MyEventRow[])
        .find(r => r.events && r.events.start_time > now);

      if (nextRsvp?.events) {
        const ev = nextRsvp.events;
        return {
          id: ev.id,
          title: ev.title,
          start_time: ev.start_time,
          location_name: ev.location_name,
          image_url: ev.image_url,
          isRsvpd: true,
        };
      }

      const { data: nextEvent } = await supabase
        .from('events')
        .select('id, title, start_time, location_name, image_url')
        .gt('start_time', now)
        .eq('is_published', true)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextEvent) return { ...nextEvent, isRsvpd: false };
      return null;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });
}

// ─── Guest passes ────────────────────────────────────────────────────────────

export function useGuestPasses(userId: string) {
  return useQuery({
    queryKey: ['guestPasses', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('guest_passes')
        .select('*')
        .eq('member_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });
}

// ─── Guest pass tickets (new flow — sourced from tickets table) ───────────────

export interface GuestPassTicket {
  id: string;
  guest_email: string | null;
  guest_name: string | null;
  status: string;
  checked_in_at: string | null;
  created_at: string;
  event_id: string | null;
  metadata: Record<string, unknown> | null;
}

export function useGuestPassTickets(userId: string) {
  return useQuery({
    queryKey: ['guestPassTickets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, guest_email, guest_name, status, checked_in_at, created_at, event_id, metadata')
        .eq('source', 'guest_pass')
        .filter('metadata->>inviter_user_id', 'eq', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as GuestPassTicket[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });
}

// ─── Member's RSVPd upcoming events (for guest pass invite dropdown) ─────────

export interface RsvpdEvent {
  id: string;
  title: string;
  start_time: string;
  location_name: string | null;
}

export function useMyRsvpdEvents(userId: string) {
  return useQuery({
    queryKey: ['myRsvpdEvents', userId],
    queryFn: async () => {
      // Canonical attendance_credentials via get_my_events (rows ordered by
      // events.start_time ASC), replacing the legacy tickets-table read.
      const { data: myEvents, error } = await supabase.rpc('get_my_events');

      if (error) throw error;

      type MyEventRow = {
        events: {
          id: string; title: string; start_time: string;
          location_name: string | null;
        } | null;
      };

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const upcoming: RsvpdEvent[] = [];
      for (const row of (myEvents ?? []) as unknown as MyEventRow[]) {
        const ev = row.events;
        if (!ev || ev.start_time < now || seen.has(ev.id)) continue;
        seen.add(ev.id);
        upcoming.push({
          id: ev.id,
          title: ev.title,
          start_time: ev.start_time,
          location_name: ev.location_name,
        });
      }
      return upcoming;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });
}

// ─── Upcoming events (for guest pass dropdown) ───────────────────────────────

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ['upcomingEvents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_time')
        .gte('start_time', new Date().toISOString())
        .eq('is_published', true)
        .eq('allows_guest_passes', true)
        .order('start_time', { ascending: true })
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Notifications ───────────────────────────────────────────────────────────
// Mark-as-read runs ONCE per session using a ref, not on every cache refresh.

const markedReadSessions = new Set<string>();

export function useNotifications(userId: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      const notifications = data ?? [];

      // Only mark as read once per session, not on every refetch
      if (!markedReadSessions.has(userId)) {
        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length > 0) {
          await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', unreadIds);
          // Update cache to reflect read status without refetching
          queryClient.setQueryData(
            ['notifications', userId],
            notifications.map(n => ({ ...n, is_read: true }))
          );
        }
        markedReadSessions.add(userId);
      }

      return notifications;
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!userId,
  });
}

// ─── Onboarding (ticket count check) ─────────────────────────────────────────

export function useHasTickets(userId: string) {
  return useQuery({
    queryKey: ['hasTickets', userId],
    queryFn: async () => {
      // Canonical attendance_credentials via get_my_events, replacing the
      // legacy tickets count.
      const { data } = await supabase.rpc('get_my_events');
      return (((data ?? []) as unknown) as unknown[]).length > 0;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!userId,
  });
}

/** True if user has an RSVP/ticket for at least one future (or in-progress) published event. */
export function useHasUpcomingEventRsvp(userId: string) {
  return useQuery({
    queryKey: ['upcomingEventRsvp', userId],
    queryFn: async () => {
      // Canonical attendance_credentials via get_my_events, replacing the
      // legacy tickets -> events two-step read.
      const now = new Date().toISOString();
      const { data, error } = await supabase.rpc('get_my_events');
      if (error) throw error;
      type Row = { events: { start_time: string } | null };
      return (((data ?? []) as unknown) as Row[]).some(
        (r) => r.events && r.events.start_time >= now,
      );
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!userId,
  });
}