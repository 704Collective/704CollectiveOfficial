'use client';

import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const { user, profile, isMember } = useAuth();
  const [userTicketIds, setUserTicketIds] = useState<Set<string>>(new Set());
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const [thankYouType, setThankYouType] = useState<'member' | 'guest'>('member');

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
      .eq('status', 'confirmed');

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
   * 1. Insert ticket row
   * 2. Handle duplicate / capacity errors
   * 3. Fire-and-forget confirmation email
   * 4. Open thank-you modal
   *
   * Returns `true` on success, `false` on handled error.
   * Throws on unexpected errors so callers can decide what to do.
   */
  const registerMemberTicket = useCallback(
    async (event: TicketActionEvent): Promise<boolean> => {
      if (!user) return false;

      if (userTicketIds.has(event.id)) {
        toast.info('You already have a ticket for this event');
        return false;
      }

      if (!isMember) {
        toast.info('Join as a member for free tickets!');
        return false;
      }

      setRsvpLoadingId(event.id);

      try {
        const { error } = await supabase.from('tickets').insert({
          event_id: event.id,
          user_id: user.id,
          ticket_type: 'member_free',
          status: 'confirmed',
        });

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

        // Optimistic update
        setUserTicketIds(prev => new Set([...prev, event.id]));
        setThankYouType('member');
        setShowThankYou(true);

        // Fire-and-forget confirmation email
        if (profile?.email) {
          const eventDate = new Date(event.start_time);
          const endDate = new Date(event.end_time);
          supabase.functions
            .invoke('send-email', {
              body: {
                to: profile.email,
                template: 'rsvp-confirmation',
                data: {
                  name: profile.full_name || 'there',
                  eventName: event.title,
                  eventDate: format(eventDate, 'EEEE, MMMM d, yyyy'),
                  eventTime: `${format(eventDate, 'h:mm a')} – ${format(endDate, 'h:mm a')}`,
                  eventLocation: event.location_name || 'TBA',
                  eventUrl: `${window.location.origin}/events/${event.id}`,
                },
              },
            })
            .catch(() => {
              // Silently fail — RSVP is already confirmed
            });
        }

        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to get ticket';
        toast.error(message);
        return false;
      } finally {
        setRsvpLoadingId(null);
      }
    },
    [user, profile, isMember, userTicketIds],
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
