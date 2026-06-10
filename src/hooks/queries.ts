import { useQuery, useQueryClient } from '@tanstack/react-query';
import { subMinutes } from 'date-fns';
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

      const { data: ticket } = await supabase
        .from('tickets')
        .select('event_id, events (id, title, start_time, location_name, image_url)')
        .eq('user_id', userId)
        .in('status', ['confirmed', 'rsvp'])
        .gt('events.start_time', now)
        .order('start_time', { referencedTable: 'events', ascending: true })
        .limit(1)
        .maybeSingle();

      const ev = ticket?.events as unknown as {
        id: string; title: string; start_time: string;
        location_name: string | null; image_url: string | null;
      } | null;

      if (ev && !Array.isArray(ticket?.events)) {
        return { ...ev, isRsvpd: true };
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
      const { data: tickets, error: ticketErr } = await supabase
        .from('tickets')
        .select('event_id')
        .eq('user_id', userId)
        .in('status', ['confirmed', 'rsvp']);

      if (ticketErr || !tickets?.length) return [] as RsvpdEvent[];

      const eventIds = tickets.map(t => t.event_id).filter(Boolean) as string[];

      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_time, location_name')
        .in('id', eventIds)
        .gte('start_time', new Date().toISOString())
        .eq('is_published', true)
        .order('start_time', { ascending: true });

      if (error) throw error;
      return (data ?? []) as RsvpdEvent[];
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
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['confirmed', 'rsvp']);
      return (count ?? 0) > 0;
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
      const now = new Date().toISOString();
      const { data: tickets, error: tErr } = await supabase
        .from('tickets')
        .select('event_id')
        .eq('user_id', userId)
        .in('status', ['confirmed', 'rsvp']);
      if (tErr) throw tErr;
      const ids = [...new Set((tickets ?? []).map((t) => t.event_id).filter(Boolean))] as string[];
      if (ids.length === 0) return false;
      const thirtyMinsAgo = subMinutes(new Date(), 30).toISOString();
      const { data: evs, error: eErr } = await supabase
        .from('events')
        .select('id')
        .in('id', ids)
        .eq('is_published', true)
        .or(`end_time.gte.${thirtyMinsAgo},and(end_time.is.null,start_time.gte.${thirtyMinsAgo})`)
        .limit(1);
      if (eErr) throw eErr;
      return (evs?.length ?? 0) > 0;
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!userId,
  });
}