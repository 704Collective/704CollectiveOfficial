'use client';

import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarConnectPrompt } from '@/components/CalendarConnectPrompt';
import type { ThankYouEvent } from '@/components/ThankYouModal';

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
  access_level: string | null;
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
  /** Event details for the thank-you modal calendar buttons */
  thankYouEvent: ThankYouEvent | null;
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
  const [thankYouEvent, setThankYouEvent] = useState<ThankYouEvent | null>(null);

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
      .in('status', ['confirmed', 'rsvp', 'attended']);

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

      // ── Access level gate ──────────────────────────────────────────────────
      // Runs after the isActiveMember + duplicate checks, before any DB write.
      const memberType = (p?.member_type ?? null) as string | null;
      const userRole = (p?.role ?? null) as string | null;
      const isAdminUser = userRole === 'admin' || userRole === 'super_admin';
      if (!isAdminUser) {
        const al = event.access_level;
        if (al === 'business_only') {
          if (memberType !== 'business') {
            toast.error('This event is for business members only');
            return false;
          }
        } else if (al === 'social_only') {
          if (memberType !== 'social' && memberType !== 'business') {
            toast.error('This event is for members only');
            return false;
          }
        } else if (memberType === 'partner') {
          // Partners use a separate event flow; exclude silently from all-access events.
          return false;
        }
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
            amount_paid_cents: 0,
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
            amount_paid_cents: 0,
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
        setThankYouEvent({
          title: event.title,
          startTime: event.start_time,
          endTime: event.end_time,
          location: event.location_name || '',
        });
        setShowThankYou(true);

        // Toast for business +1
        if (isBusinessMember) {
          toast.success('RSVP confirmed! Your +1 guest ticket is included.', { duration: 4000 });
        }

        // ── Confirmation email + calendar connect prompt ────────────────────
        // Fetch session + fresh profile once; use both for email and prompt.
        void (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const { data: freshProfile } = await supabase
              .from('profiles')
              .select('calendar_token')
              .eq('id', session.user.id)
              .single();

            // ── Confirmation email ──────────────────────────────────────────
            console.log('Sending RSVP confirmation email for event:', event.id, 'to:', session.user.email);
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://704collective.com';
            const eventDate = new Date(event.start_time);
            const endDate = new Date(event.end_time);
            await supabase.functions.invoke('send-email', {
              body: {
                template: 'rsvp-confirmation',
                to: session.user.email,
                data: {
                  name: p?.full_name || 'there',
                  eventName: event.title,
                  eventDate: format(eventDate, 'EEEE, MMMM d, yyyy'),
                  eventTime: `${format(eventDate, 'h:mm a')} - ${format(endDate, 'h:mm a')}`,
                  eventLocation: event.location_name || 'TBA',
                  eventUrl: `${origin}/events/${event.id}`,
                  startTimeIso: event.start_time,
                  endTimeIso: event.end_time || event.start_time,
                  calendarToken: freshProfile?.calendar_token || null,
                  origin,
                  ticket_id: insertedTicket?.id ?? null,
                  plusOne: isBusinessMember,
                },
              },
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }).catch((emailErr: unknown) => {
              console.warn('[useTicketActions] Confirmation email failed:', emailErr);
            });

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
    thankYouEvent,
    registerMemberTicket,
    refreshUserTickets,
    hasTicket,
  };
}
