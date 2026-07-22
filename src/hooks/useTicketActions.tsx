'use client';

import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarConnectPrompt } from '@/components/CalendarConnectPrompt';
import type { ThankYouEvent } from '@/components/ThankYouModal';
import { resolvePersonId } from '@/lib/resolvePersonId';

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
  ticket_mode: string | null;
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

  // Fetch user's RSVP'd events whenever the user changes.
  // Reads attendance_credentials (credential_type='member_rsvp', status
  // active|used) instead of the old tickets table. person_id is a people.id;
  // resolve it from the auth user id first. On any failure the set is empty
  // so hasTicket degrades to false rather than throwing.
  const refreshUserTickets = useCallback(async () => {
    if (!user) {
      setUserTicketIds(new Set());
      return;
    }
    const personId = await resolvePersonId(user.id);
    if (!personId) {
      setUserTicketIds(new Set());
      return;
    }
    const { data } = await supabase
      .from('attendance_credentials')
      .select('event_id')
      .eq('person_id', personId)
      .eq('credential_type', 'member_rsvp')
      .in('status', ['active', 'used']);

    if (data) {
      setUserTicketIds(new Set(data.map(c => c.event_id).filter(Boolean) as string[]));
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

      // ── Ticket mode gate ───────────────────────────────────────────────────
      // 'all' mode events require purchase through the checkout flow, not a free RSVP.
      if (event.ticket_mode === 'all' && !isAdminUser) {
        toast.info('This event is ticketed for all members. Purchase your ticket to attend.');
        return false;
      }

      setRsvpLoadingId(event.id);

      try {
        // Member RSVP now goes through the create-member-rsvp edge function,
        // which creates a member_rsvp attendance_credential. invoke() attaches
        // the logged-in user's JWT automatically.
        const { data: rsvpData, error: rsvpError } = await supabase.functions.invoke(
          'create-member-rsvp',
          { body: { event_id: event.id } }
        );

        if (rsvpError) {
          // invoke() treats non-2xx as an error. 409 = event at capacity.
          let isCapacity = false;
          try {
            const ctx = (rsvpError as { context?: Response }).context;
            if (ctx && typeof ctx.status === 'number' && ctx.status === 409) {
              isCapacity = true;
            }
          } catch { /* ignore */ }
          if (isCapacity) {
            toast('This event just sold out! Check back for future events.', { icon: '🎟️' });
            return false;
          }
          throw rsvpError;
        }

        if (rsvpData?.already_rsvped) {
          toast.info('You already have a ticket for this event');
          return false;
        }

        // Credential token, used below in place of the old tickets row id.
        const credentialToken: string | null = rsvpData?.credential_token ?? null;

        // -- Business member +1 -- DEFERRED to sub-step 3.4d.
        // The old flow inserted a second 'business_plus_one' tickets row here.
        // In the credential model the +1 becomes a guest_pass attendance_credential
        // (issued_by_person_id = this member). That is its own scoped sub-step;
        // it is intentionally NOT issued here. Business members do not get an
        // auto +1 until 3.4d ships.

        // Optimistic update
        setUserTicketIds(prev => new Set([...prev, event.id]));
        setThankYouType('member');
        setThankYouEvent({
          id: event.id,
          title: event.title,
          startTime: event.start_time,
          endTime: event.end_time,
          location: event.location_name || '',
        });
        setShowThankYou(true);

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
                  ticket_id: credentialToken,
                  plusOne: false,
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
