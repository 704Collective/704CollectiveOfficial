import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

// ─── Tickets ────────────────────────────────────────────────────────────────

export function useTickets(userId: string) {
  return useQuery({
    queryKey: ['tickets', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          id,
          event_id,
          status,
          checked_in_at,
          events (
            id,
            title,
            start_time,
            end_time,
            location_name,
            image_url,
            is_members_only
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'confirmed');

      if (error) throw error;
      return data ?? [];
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
        .eq('status', 'confirmed')
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

// ─── Upcoming events (for guest pass dropdown) ───────────────────────────────

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ['upcomingEvents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_time')
        .gte('start_time', new Date().toISOString())
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
        .eq('status', 'confirmed');
      return (count ?? 0) > 0;
    },
    staleTime: 10 * 60 * 1000,
    enabled: !!userId,
  });
}