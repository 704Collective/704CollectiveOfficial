'use client';

import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarConnectPrompt } from '@/components/CalendarConnectPrompt';

/**
 * Minimal event shape needed by ticket actions.
 * All consumer Event types are supersets of this.
 */
export interface TicketActionEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location_name: string | null;
  location_address?: string | null;
  is_members_only: boolean | null;
}

interface UseTicketActionsReturn {
  /** Set of event IDs the current user has confirmed tickets for */
  userTicketIds: Set<string>;
  /** The event ID currently being processed (for loading spinners) */
  rsvpLoadingId: string | null;
  /** Whether the thank-you modal should be shown */
  showThankYou: boolean;
  setShowThankYou: (v: boolean) => void;
  /** 'member' or 'guest' — controls thank-you modal copy */
  thankYouType: 'member' | 'guest';
  /** Register (RSVP) for an event as a member. Handles insert + email. */
  registerMemberTicket: (event: TicketActionEvent) => Promise<boolean>;
  /** Refresh the user's ticket set (e.g. after external changes) */
  refreshUserTickets: () => Promise<void>;
  /** Check if user has a ticket for a specific event */
  hasTicket: (eventId: string) => boolean;
}

/**
 * Centralised hook for ticket RSVP logic.
 * Replaces duplicated handleGetTicket / email-send code
 * across Index.tsx, Events.tsx, and EventDetail.tsx.
 */
export function useTicketActions(): UseTicketActionsReturn {
  const { user, profile, isActiveMember, refreshProfile } = useAuth();
  const [userTicketIds, setUserTicketIds] = useState<Set<string>>(new Set());
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouType, setThankYouType] = useState<'member' | 'guest'>('member');

  const p = profile as any;

  // Fetch user's confirmed tickets whenever the user changes
  const refreshUserTickets = useCallback(async () => {
    if (!user) {
      setUserTicketIds(new Set());
      return;
    }
    const { data } = await supabase
      .from('tickets')
      .select('event_id')
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'rsvp']);

    if (data) {
      setUserTicketIds(new Set(data.map(t => t.event_id).filter(Boolean) as string[]));
    }
  }, [user]);

  useEffect(() => {
    refreshUserTickets();
  }, [refreshUserTickets]);

  const hasTicket = useCallback(
    (eventId: string) => userTicketIds.has(eventId),
    [userTicketIds],
  );

  /**
   * Core RSVP flow for members:
   * 1. Insert member ticket row
   * 2. If business member → insert automatic +1 guest ticket
   * 3. Handle duplicate / capacity errors
   * 4. Fire-and-forget confirmation email
   * 5. Open thank-you modal
   *
   * Returns `true` on success, `false` on handled error.
   */
  const registerMemberTicket = useCallback(
    async (event: TicketActionEvent): Promise<boolean> => {
      if (!user) return false;

      if (userTicketIds.has(event.id)) {
        toast.info('You already have a ticket for this event');
        return false;
      }

      if (!isActiveMember) {
        toast.info('Join as a member for free tickets!');
        return false;
      }

      setRsvpLoadingId(event.id);

      try {
        // Insert member's own ticket (select id for confirmation email)
        const { data: insertedTicket, error } = await supabase
          .from('tickets')
          .insert({
            event_id: event.id,
            user_id: user.id,
            ticket_type: 'member_free',
            status: 'confirmed',
            source: 'member_rsvp',
          })
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505') {
            toast.info('You already have a ticket for this event');
            return false;
          }
          if (error.message?.includes('capacity') || error.code === 'P0001') {
            toast('This event just sold out! Check back for future events.', { icon: '🎟️' });
            return false;
          }
          throw error;
        }

        // ── Business member +1 ──────────────────────────────────────────────
        // Business members automatically get a free +1 scan-in for any social
        // event they RSVP to. No guest info required — just an extra ticket.
        const isBusinessMember = p?.member_type === 'business';
        if (isBusinessMember) {
          await supabase.from('tickets').insert({
            event_id: event.id,
            user_id: user.id,
            ticket_type: 'business_plus_one',
            status: 'confirmed',
            source: 'business_plus_one',
            guest_name: 'Guest (+1)',
          }).then(({ error: plusOneError }) => {
            if (plusOneError) {
              // Silently fail — member's own ticket is already confirmed
              console.warn('[useTicketActions] +1 ticket insert failed:', plusOneError.message);
            }
          });
        }

        // Optimistic update
        setUserTicketIds(prev => new Set([...prev, event.id]));
        setThankYouType('member');
        setShowThankYou(true);

        // Toast for business +1
        if (isBusinessMember) {
          toast.success('RSVP confirmed! Your +1 guest ticket is included.', { duration: 4000 });
        }

        // ── Fire-and-forget confirmation email ─────────────────────────────
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const session = sessionData?.session;
          if (session) {
            const eventDate = new Date(event.start_time);
            const endDate = new Date(event.end_time);
            supabase.functions
              .invoke('send-email', {
                body: {
                  template: 'rsvp-confirmation',
                  to: session.user.email,
                  data: {
                    name: p?.full_name || 'there',
                    event_id: event.id,
                    event_title: event.title,
                    event_date: event.start_time,
                    eventDate: format(eventDate, 'EEEE, MMMM d, yyyy'),
                    eventTime: `${format(eventDate, 'h:mm a')} - ${format(endDate, 'h:mm a')}`,
                    event_location: event.location_name || '',
                    event_address: event.location_address || '',
                    eventLocation: event.location_name || 'TBA',
                    eventUrl: `${window.location.origin}/events/${event.id}`,
                    ticket_id: insertedTicket?.id ?? null,
                    calendar_token: p?.calendar_token ?? null,
                    plusOne: isBusinessMember,
                  },
                },
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                },
              })
              .catch((emailErr) => {
                console.warn('[useTicketActions] Confirmation email failed:', emailErr);
              });
          }
        } catch (emailErr) {
          console.warn('[useTicketActions] Could not send confirmation email:', emailErr);
        }

        // ── Calendar connect prompt ─────────────────────────────────────────
        // Fetch a fresh profile so calendar_token reflects any recent changes
        void (async () => {
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData?.session;
            if (!session) return;

            const { data: freshProfile } = await supabase
              .from('profiles')
              .select('calendar_token')
              .eq('id', session.user.id)
              .single();

            if (freshProfile?.calendar_token) return; // already connected

            const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
            const res = await fetch('/api/calendar/ensure-token', {
              method: 'POST',
              credentials: 'include',
            });
            const tokenData = (await res.json()) as { token?: string; error?: string };
            if (!res.ok || !tokenData.token) return;
            await refreshProfile();
            toast.custom(
              (tid) => (
                <CalendarConnectPrompt
                  calendarToken={tokenData.token!}
                  baseUrl={base}
                  title="Add this event to your calendar"
                  compact
                  userId={user.id}
                  onDismiss={() => toast.dismiss(tid)}
                />
              ),
              { duration: 60000 }
            );
          } catch {
            /* non-blocking */
          }
        })();

        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to get ticket';
        toast.error(message);
        return false;
      } finally {
        setRsvpLoadingId(null);
      }
    },
    [user, p, isActiveMember, userTicketIds, refreshProfile],
  );

  return {
    userTicketIds,
    rsvpLoadingId,
    showThankYou,
    setShowThankYou,
    thankYouType,
    registerMemberTicket,
    refreshUserTickets,
    hasTicket,
  };
}
