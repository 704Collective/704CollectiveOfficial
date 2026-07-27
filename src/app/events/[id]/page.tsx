'use client';

import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { SOCIAL_TIER } from '@/lib/pricing';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Check, Ticket, X, AlertCircle, Loader2, MessageSquare } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTicketActions, sendRsvpConfirmationEmail } from '@/hooks/useTicketActions';
import { SEOJsonLd } from '@/components/SEOJsonLd';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThankYouModal } from '@/components/ThankYouModal';
import { QRCodeSVG } from 'qrcode.react';
import { WhosGoing } from '@/components/WhosGoing';
import { CategoryBadge, EventCategory, MembersOnlyEventBadge } from '@/components/CategoryBadge';
import { AddToCalendarButtons } from '@/components/AddToCalendarButtons';
import { WaitlistBadge } from '@/components/WaitlistBadge';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';
import { resolvePersonId } from '@/lib/resolvePersonId';

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location_name: string | null;
  location_address: string | null;
  image_url: string | null;
  capacity: number | null;
  is_members_only: boolean | null;
  is_published?: boolean | null;
  ticket_price: number | null;
  social_member_price?: number | null;
  business_member_price?: number | null;
  category: string | null;
  allows_guest_passes: boolean | null;
  host_id?: string | null;
  access_type?: 'members_only' | 'public_ticketed' | 'public_free';
  access_level: string | null;
  ticket_mode: 'none' | 'public_only' | 'all' | null;
  required_tier?: string | null;
  price_cents?: number | null;
  member_price_cents?: number | null;
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Read ?claim=1 client-side (avoids the useSearchParams Suspense requirement).
  const [claimParam, setClaimParam] = useState(false);
  const { user, profile, isActiveMember, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const { hasTicket: checkHasTicket, rsvpLoadingId, showThankYou, setShowThankYou, thankYouType, thankYouEvent, registerMemberTicket, refreshUserTickets } = useTicketActions();

  const [event, setEvent] = useState<Event | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [hostDialogOpen, setHostDialogOpen] = useState(false);
  const [hostMessage, setHostMessage] = useState('');
  const [hostSending, setHostSending] = useState(false);
  usePageTitle(event ? event.title : 'Event Details');
  const [loading, setloading] = useState(true);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketStatus, setTicketStatus] = useState<string | null>(null);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [ticketCount, setTicketCount] = useState(0);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [waitlistId, setWaitlistId] = useState<string | null>(null);

  const [publicRsvpFirstName, setPublicRsvpFirstName] = useState('');
  const [publicRsvpLastName, setPublicRsvpLastName] = useState('');
  const [publicRsvpEmail, setPublicRsvpEmail] = useState('');
  const [publicRsvpPhone, setPublicRsvpPhone] = useState('');
  const [publicRsvpLoading, setPublicRsvpLoading] = useState(false);
  const [publicRsvpError, setPublicRsvpError] = useState('');
  const [publicRsvpState, setPublicRsvpState] = useState<'idle' | 'success'>('idle');
  const [publicRsvpFull, setPublicRsvpFull] = useState(false);
  const [publicRsvpToken, setPublicRsvpToken] = useState<string | null>(null);

  // Item 7 - signed-out repeat-buyer email gate (paid public_ticketed only).
  // 'collect' shows the email field; 'member' shows the log-in prompt when the
  // email matches an active member (hard-block, no Stripe).
  const [guestGateMode, setGuestGateMode] = useState<'button' | 'collect' | 'member' | 'details'>('button');
  const [guestFirstName, setGuestFirstName] = useState('');
  const [guestLastName, setGuestLastName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestGateEmail, setGuestGateEmail] = useState('');
  const [guestGateError, setGuestGateError] = useState('');
  const [guestGateLoading, setGuestGateLoading] = useState(false);

  const hasTicket = id ? checkHasTicket(id) : false;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setClaimParam(new URLSearchParams(window.location.search).get('claim') === '1');
    }
  }, []);
  useEffect(() => { if (id) fetchEvent(); }, [id]);
  useEffect(() => { if (user && id) { fetchTicketId(); checkWaitlistStatus(); } }, [user, id]);
  useEffect(() => { if (id) fetchTicketCount(); }, [id]);

  const fetchEvent = async () => {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error) { toast.error('Failed to load event'); router.push('/events'); return; }
    if (!data) { toast.error('Event not found'); router.push('/events'); return; }

    // Derive old-shaped fields from the new canonical schema columns so the
    // page's existing branching logic keeps working. New schema: required_tier,
    // price_cents, member_price_cents. Old fields the page still reads:
    // access_type, is_members_only, access_level, ticket_price, ticket_mode.
    const tier: string = data.required_tier ?? 'public';
    const isPublic = tier === 'public';
    const publicPriceCents = data.price_cents ?? 0;
    const memberPriceCents = data.member_price_cents ?? 0;

    // Sweep-aware derivation: 3 access types instead of 2.
    // public + price>0 = public_ticketed (public pays, members maybe free)
    // public + price=0 = public_free (free RSVP for all)
    // non-public      = members_only (members-only access)
    let access_type: 'public_free' | 'public_ticketed' | 'members_only';
    if (!isPublic) {
      access_type = 'members_only';
    } else if (publicPriceCents > 0) {
      access_type = 'public_ticketed';
    } else {
      access_type = 'public_free';
    }

    // ticket_mode mirrors access_type intent for downstream branching:
    // public_ticketed + members free = 'public_only' (only public pays)
    // public_ticketed + members pay  = 'all' (everyone pays, possibly different prices)
    // anything else                   = 'none' (no payment flow)
    let ticket_mode: 'none' | 'public_only' | 'all';
    if (access_type === 'public_ticketed') {
      ticket_mode = memberPriceCents > 0 ? 'all' : 'public_only';
    } else {
      ticket_mode = 'none';
    }

    const derived = {
      ...data,
      access_type,
      is_members_only: !isPublic,
      access_level:
        (tier === 'business' || tier === 'founder') ? 'business_only' : 'all',
      ticket_price: publicPriceCents,
      social_member_price: memberPriceCents,
      business_member_price: memberPriceCents,
      ticket_mode,
    };

    setEvent(derived as Event);
    setloading(false);

    // Resolve the host's display name (members can read profile names, same as
    // the discussion author join). Kept separate from the event row.
    if (data.host_id) {
      const { data: hostRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.host_id)
        .maybeSingle();
      setHostName(hostRow?.full_name ?? null);
    } else {
      setHostName(null);
    }
  };

  const handleSendHostMessage = async () => {
    if (!event?.host_id) return;
    const trimmed = hostMessage.trim();
    if (!trimmed) { toast.error('Please write a message first.'); return; }
    if (trimmed.length > 1000) { toast.error('Message must be 1000 characters or fewer.'); return; }
    setHostSending(true);
    try {
      const { error } = await supabase.functions.invoke('message-event-host', {
        body: { event_id: event.id, message: trimmed },
      });
      if (error) {
        const status = (error as { context?: { status?: number } })?.context?.status;
        if (status === 429) {
          toast.error("You've sent a message recently — please wait a few minutes.");
        } else {
          toast.error('Could not send your message. Please try again.');
        }
        return;
      }
      const firstName = (hostName || 'the host').split(' ')[0];
      toast.success(`Message sent to ${firstName}`);
      setHostMessage('');
      setHostDialogOpen(false);
    } catch {
      toast.error('Could not send your message. Please try again.');
    } finally {
      setHostSending(false);
    }
  };

  useEffect(() => {
    if (!event || authLoading) return;
    if (event.is_published === false && !isAdmin && !isSuperAdmin) {
      toast.error('This event is not available');
      router.push('/events');
    }
  }, [event, authLoading, isAdmin, isSuperAdmin, router]);
  const fetchTicketId = async () => {
    if (!user) return;
    // Member "do I have an RSVP" state now reads attendance_credentials.
    // A member RSVP is credential_type='member_rsvp' scoped to this event.
    // person_id is a people.id; resolve it from the auth user id first.
    const personId = await resolvePersonId(user.id);
    if (!personId) { setTicketId(null); setTicketStatus(null); setCheckedInAt(null); return; }
    const { data } = await supabase.from('attendance_credentials')
      .select('id, status, checked_in_at')
      .eq('event_id', id)
      .eq('person_id', personId)
      .eq('credential_type', 'member_rsvp')
      .in('status', ['active', 'used'])
      .maybeSingle();
    setTicketId(data?.id || null);
    // Derive the old-shaped ticketStatus the render logic expects:
    // a checked-in credential -> 'attended', otherwise -> 'confirmed'.
    setTicketStatus(data ? (data.checked_in_at ? 'attended' : 'confirmed') : null);
    setCheckedInAt(data?.checked_in_at || null);
  };
  const fetchTicketCount = async () => {
    // Capacity count comes from a SECURITY DEFINER RPC that counts
    // attendance_credentials (status active|used) for the event. The RPC
    // bypasses RLS so logged-out and non-admin visitors get the true count.
    const { data, error } = await supabase.rpc('get_event_attendance_count', {
      p_event_id: id,
    });
    if (error) {
      console.warn('[EventDetail] get_event_attendance_count failed:', error.message);
      return;
    }
    setTicketCount(typeof data === 'number' ? data : 0);
  };
  const checkWaitlistStatus = async () => {
    if (!user) return;
    const { data } = await supabase.from('event_waitlist').select('id, position').eq('event_id', id).eq('user_id', user.id).maybeSingle();
    if (data) { setWaitlistPosition(data.position); setWaitlistId(data.id); }
  };

  const isAtCapacity = event?.capacity != null && ticketCount >= event.capacity;
  // Super admins can RSVP past capacity (server + DB honor an admin override).
  // Only affects CTA rendering; the attendee count display stays honest.
  const ctaAtCapacity = isAtCapacity && !isSuperAdmin;

  const handleMemberRegister = async () => { if (!event) return; const s = await registerMemberTicket(event); if (s) { fetchTicketCount(); fetchTicketId(); } };
  const handleCancelRSVP = async () => {
    if (!event) return;
    setIsCancelling(true);
    // Cancellation now voids the member_rsvp attendance_credential via the
    // void-credential edge function. invoke() attaches the user's JWT.
    const { data, error } = await supabase.functions.invoke('void-credential', {
      body: { event_id: event.id },
    });
    if (error || !data?.success) {
      toast.error('Failed to cancel RSVP');
      setIsCancelling(false);
      return;
    }
    setTicketId(null);
    setTicketStatus(null);
    setCheckedInAt(null);
    setIsCancelling(false);
    toast.success('RSVP cancelled');
    fetchTicketCount();
    refreshUserTickets();
  };
  const handleJoinWaitlist = async () => {
    if (!user || !event) return; setIsRegistering(true);
    const { data, error } = await supabase.from('event_waitlist').insert({ event_id: event.id, user_id: user.id, position: 0 }).select('id, position').single();
    if (error) { toast.error(error.code === '23505' ? 'Already on waitlist' : 'Failed to join'); setIsRegistering(false); return; }
    setWaitlistPosition(data.position); setWaitlistId(data.id); setIsRegistering(false); toast.success(`You're #${data.position} on the waitlist!`);
  };
  const handleMemberRegisterWithWaitlistFallback = async () => {
    if (!user || !event) return;
    setIsRegistering(true);
    try {
      // Member RSVP now goes through the create-member-rsvp edge function,
      // which creates a member_rsvp attendance_credential. invoke() attaches
      // the logged-in user's JWT automatically.
      const { data, error } = await supabase.functions.invoke('create-member-rsvp', {
        body: { event_id: event.id },
      });

      if (error) {
        // invoke() treats non-2xx as an error. A 409 means the event is full -
        // fall back to the waitlist, mirroring the old P0001 capacity path.
        let isCapacity = false;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.status === 'number' && ctx.status === 409) {
            isCapacity = true;
          }
        } catch { /* ignore */ }

        if (isCapacity) {
          const { data: wl, error: wlErr } = await supabase
            .from('event_waitlist')
            .insert({ event_id: event.id, user_id: user.id, position: 0 })
            .select('id, position')
            .single();
          setIsRegistering(false);
          if (wlErr) {
            toast.error(wlErr.code === '23505' ? "You're already on the waitlist." : 'Failed to join waitlist.');
            return;
          }
          setWaitlistPosition(wl.position);
          setWaitlistId(wl.id);
          toast.success(`Event is full - you're #${wl.position} on the waitlist!`);
          return;
        }

        toast.error('Failed to RSVP. Please try again.');
        setIsRegistering(false);
        return;
      }

      if (data?.already_rsvped) {
        toast.error('You already have an RSVP for this event.');
      } else {
        toast.success("You're RSVP'd!");
        // Confirmation email — identical payload to registerMemberTicket.
        // Fire-and-forget; never fatal. Waitlist branch above does NOT send
        // (waitlisted ≠ RSVP'd).
        void sendRsvpConfirmationEmail({
          event,
          memberName: profile?.full_name,
          credentialToken: data?.credential_token ?? null,
        });
      }
      await refreshUserTickets();
      await fetchTicketId();
      fetchTicketCount();
      setIsRegistering(false);
    } catch {
      toast.error('Something went wrong.');
      setIsRegistering(false);
    }
  };
  const handleLeaveWaitlist = async () => {
    if (!waitlistId) return;
    const { error } = await supabase.from('event_waitlist').delete().eq('id', waitlistId);
    if (error) { toast.error('Failed to leave waitlist'); return; }
    setWaitlistPosition(null); setWaitlistId(null); toast.success('Left the waitlist');
  };
  const handleClaimSeat = async () => {
    if (!user || !event) return;
    setIsRegistering(true);
    try {
      // Claim an opened waitlist seat via the claim-waitlist-seat edge function.
      // invoke() attaches the logged-in user's JWT automatically.
      const { data, error } = await supabase.functions.invoke('claim-waitlist-seat', {
        body: { event_id: event.id },
      });

      if (error) {
        // invoke() treats non-2xx as an error. Surface a distinct toast per status,
        // preferring the server's specific message when we can read it.
        let status = 0;
        let serverMsg = '';
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx && typeof ctx.status === 'number') status = ctx.status;
          if (ctx && typeof ctx.json === 'function') {
            const bodyJson = await ctx.json();
            if (bodyJson?.error) serverMsg = String(bodyJson.error);
          }
        } catch { /* ignore parse errors */ }

        const msg =
          status === 404 ? (serverMsg || "You're not on the waitlist for this event.") :
          status === 403 ? (serverMsg || "Your claim window isn't open, or it has expired.") :
          status === 409 ? (serverMsg || 'That seat was just taken.') :
          (serverMsg || 'Could not claim the spot. Please try again.');
        toast.error(msg);
        setIsRegistering(false);
        return;
      }

      // Success: seat claimed, waitlist row removed server-side.
      setWaitlistPosition(null);
      setWaitlistId(null);
      toast.success("You're RSVP'd! Your spot is confirmed.");
      await refreshUserTickets();
      await fetchTicketId();
      fetchTicketCount();
      setIsRegistering(false);
    } catch {
      toast.error('Something went wrong.');
      setIsRegistering(false);
    }
  };
  const handlePublicRsvp = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublicRsvpError('');

    if (!publicRsvpFirstName.trim() || !publicRsvpLastName.trim() || !publicRsvpEmail.trim()) {
      setPublicRsvpError('Please fill in name and email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(publicRsvpEmail.trim())) {
      setPublicRsvpError('Please enter a valid email.');
      return;
    }

    setPublicRsvpLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/capture-public-rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey || '',
          Authorization: `Bearer ${anonKey || ''}`,
        },
        body: JSON.stringify({
          event_id: event!.id,
          first_name: publicRsvpFirstName.trim(),
          last_name: publicRsvpLastName.trim(),
          email: publicRsvpEmail.trim(),
          phone: publicRsvpPhone.trim() || null,
          origin: window.location.origin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = (data.error || '').toLowerCase();
        if (res.status === 409 || errMsg.includes('capacity') || errMsg.includes('full')) {
          setPublicRsvpFull(true);
          setPublicRsvpLoading(false);
          return;
        }
        setPublicRsvpError(data.error || 'Something went wrong. Please try again.');
        setPublicRsvpLoading(false);
        return;
      }

      setPublicRsvpToken(data.credential_token ?? null);
      setPublicRsvpState('success');
      setPublicRsvpLoading(false);
    } catch {
      setPublicRsvpError('Something went wrong. Please try again.');
      setPublicRsvpLoading(false);
    }
  };
  const handlePurchaseTicket = async () => {
    if (!event) return; setIsRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ticket-checkout', { body: { eventId: event.id, eventTitle: event.title } });
      if (error || data?.error) { toast.error(data?.error || 'Failed to create checkout'); setIsRegistering(false); return; }
      if (data?.url) { window.location.href = data.url; } else { toast.error('No checkout URL'); setIsRegistering(false); }
    } catch { toast.error('Something went wrong.'); setIsRegistering(false); }
  };
  // Item 7: signed-out buyer enters email -> check-email-status -> branch.
  // active_member  = hard-block, show log-in prompt (no charge)
  // existing/new   = proceed to Stripe, passing buyerEmail so verify-ticket-payment
  //                  reuses their people row + Stripe customer (no duplicates)
  const handleGuestEmailContinue = async () => {
    if (!event) return;
    setGuestGateError('');
    const email = guestGateEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) { setGuestGateError('Please enter a valid email.'); return; }

    setGuestGateLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/check-email-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey || '', Authorization: `Bearer ${anonKey || ''}` },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setGuestGateError(data.error || 'Something went wrong. Please try again.'); setGuestGateLoading(false); return; }

      if (data.status === 'active_member') {
        setGuestGateMode('member');
        setGuestGateLoading(false);
        return;
      }

      // new -> collect first/last/phone for marketing before checkout
      if (data.status === 'new') {
        setGuestGateMode('details');
        setGuestGateLoading(false);
        return;
      }
      // existing_contact -> we already have their info; straight to Stripe w/ email
      const { data: co, error } = await supabase.functions.invoke('create-ticket-checkout', {
        body: { eventId: event.id, eventTitle: event.title, buyerEmail: email },
      });
      if (error || co?.error || !co?.url) {
        setGuestGateError(co?.error || 'Failed to start checkout. Please try again.');
        setGuestGateLoading(false);
        return;
      }
      window.location.href = co.url;
    } catch {
      setGuestGateError('Something went wrong. Please try again.');
      setGuestGateLoading(false);
    }
  };

  // New buyer: submit captured name/phone, then go to Stripe with all four fields.
  const handleGuestDetailsContinue = async () => {
    if (!event) return;
    setGuestGateError('');
    if (!guestFirstName.trim() || !guestLastName.trim()) {
      setGuestGateError('Please enter your first and last name.');
      return;
    }
    setGuestGateLoading(true);
    try {
      const { data: co, error } = await supabase.functions.invoke('create-ticket-checkout', {
        body: {
          eventId: event.id,
          eventTitle: event.title,
          buyerEmail: guestGateEmail.trim().toLowerCase(),
          buyerFirstName: guestFirstName.trim(),
          buyerLastName: guestLastName.trim(),
          buyerPhone: guestPhone.trim(),
        },
      });
      if (error || co?.error || !co?.url) {
        setGuestGateError(co?.error || 'Failed to start checkout. Please try again.');
        setGuestGateLoading(false);
        return;
      }
      window.location.href = co.url;
    } catch {
      setGuestGateError('Something went wrong. Please try again.');
      setGuestGateLoading(false);
    }
  };

  const handleGuestPurchase = handlePurchaseTicket;
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;
  const isActionLoading = (rsvpLoadingId === id) || isRegistering;

  if (loading || authLoading) {
    return (
      <>
        <Nav />
        <div style={{ paddingTop: '64px', minHeight: '100vh', backgroundColor: '#000' }}>
          <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 24px' }}>
            <div style={{ height: '14px', width: '80px', backgroundColor: '#1A1A1A', borderRadius: '4px', marginBottom: '24px' }} />
            <div style={{ height: '42px', width: '50%', backgroundColor: '#1A1A1A', borderRadius: '8px', marginBottom: '14px', animation: 'pulse 2s infinite' }} />
            <div style={{ height: '16px', width: '35%', backgroundColor: '#1A1A1A', borderRadius: '6px', marginBottom: '48px' }} />
          </div>
        </div>
        <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
      </>
    );
  }

  if (!event) return null;

  const eventDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const ticketPrice = event.ticket_price ?? 1000;
  const fillPct = event.capacity && event.capacity > 0 ? (ticketCount / event.capacity) * 100 : 0;

  // --- Tier eligibility (shared by the desktop ticket card AND the mobile
  // sticky CTA — the mobile bar previously skipped this check entirely) ---
  const userMemberType = (profile?.member_type ?? '') as string;
  const userRole = (profile?.role ?? '') as string;
  const isAdminOverride = userRole === 'admin' || userRole === 'super_admin';
  const isBusinessOnly = event.access_level === 'business_only';
  const isSocialOnly = event.access_level === 'social_only';
  const isAccessAll = !event.access_level || event.access_level === 'all';
  const canRsvp =
    isAdminOverride ||
    (isAccessAll && userMemberType !== 'partner') ||
    (isBusinessOnly && userMemberType === 'business') ||
    (isSocialOnly && (userMemberType === 'social' || userMemberType === 'business'));

  const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '13px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: isActionLoading ? 'wait' : 'pointer', opacity: isActionLoading ? 0.6 : 1, transition: 'all 200ms ease', backgroundColor: '#FFFFFF', color: '#000000', border: 'none' };
  const ghostBtn: React.CSSProperties = { ...primaryBtn, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' };
  const dangerBtn: React.CSSProperties = { ...primaryBtn, backgroundColor: 'transparent', color: '#E57373', border: '1px solid rgba(229,115,115,0.15)' };
  const linkBtn: React.CSSProperties = { display: 'block', width: '100%', padding: '11px 24px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none', transition: 'all 200ms ease' };

  // State 3: resolve member-tier ticket price based on the user's member_type
  const resolveMemberPrice = (): number | null => {
    if (!event) return null;
    const memberType = (profile?.member_type ?? '') as string;
    const role = (profile?.role ?? '') as string;

    // Admins always attend free
    if (role === 'admin' || role === 'super_admin') return null;

    // 'none' and 'public_only' modes: members RSVP free
    if (!event.ticket_mode || event.ticket_mode === 'none' || event.ticket_mode === 'public_only') return null;

    // 'all' mode: everyone pays at their tier price
    if (memberType === 'business' || memberType === 'partner') {
      return event.business_member_price ?? event.social_member_price ?? event.ticket_price ?? 0;
    }
    if (memberType === 'social') {
      return event.social_member_price ?? event.ticket_price ?? 0;
    }
    return event.ticket_price ?? 0;
  };

  const renderTicketCard = () => {
    // STATE 7: Attended - past event with checked_in_at OR status='attended'
    const isAttended = ticketStatus === 'attended' || checkedInAt;
    if (hasTicket && isAttended) return (
      <div style={{ textAlign: 'center' }}>
        <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#C6A664', backgroundColor: 'rgba(198,166,100,0.08)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Attended</span>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>You attended this one.</h3>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>{checkedInAt ? `Checked in ${format(new Date(checkedInAt), 'MMMM d, yyyy')}` : `Event on ${format(eventDate, 'MMMM d, yyyy')}`}</p>
        <Link href="/events" style={{ ...linkBtn, backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar style={{ width: '13px', height: '13px' }} /> Browse Other Events</span></Link>
        <Link href={`/events/${event.id}/discussion`} style={{ display: 'block', width: '100%', marginTop: '12px', padding: '13px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: 'rgba(198,166,100,0.12)', color: '#C6A664', border: '1px solid rgba(198,166,100,0.35)', textAlign: 'center', textDecoration: 'none' }}>
          View the Discussion
        </Link>
      </div>
    );
    if (hasTicket) return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(76,175,80,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <Check style={{ width: '22px', height: '22px', color: '#4CAF50' }} />
        </div>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>You{"'"}re RSVP{"'"}d!</h3>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>See you on {format(eventDate, 'MMMM d')}.</p>
        <div style={{ marginBottom: '10px' }}><AddToCalendarButtons event={{ id: event.id, title: event.title, description: event.description || '', startTime: event.start_time, endTime: event.end_time, location: event.location_name || '' }} /></div>
        {event.host_id && hostName && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '12px', marginBottom: '10px', padding: '16px', borderRadius: '12px', background: 'rgba(198,166,100,0.08)', border: '1px solid rgba(198,166,100,0.35)', textAlign: 'left' }}>
            <div>
              <p style={{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(198,166,100,0.9)', margin: '0 0 4px' }}>Your host</p>
              <p style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>Hosted by {hostName}</p>
            </div>
            <button
              onClick={() => setHostDialogOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '11px 20px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: 'rgba(198,166,100,0.15)', color: '#C6A664', border: '1px solid rgba(198,166,100,0.4)', cursor: 'pointer' }}
            >
              <MessageSquare style={{ width: '15px', height: '15px' }} /> Message Host
            </button>
          </div>
        )}
        <Link href="/events" style={{ ...linkBtn, backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar style={{ width: '13px', height: '13px' }} /> Browse Other Events</span></Link>
        <Link href="/dashboard" style={{ ...linkBtn, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '8px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Ticket style={{ width: '13px', height: '13px' }} /> View My Tickets</span></Link>
        <button onClick={handleCancelRSVP} disabled={isCancelling} style={dangerBtn}><X style={{ width: '14px', height: '14px' }} />{isCancelling ? 'Cancelling...' : 'Cancel RSVP'}</button>
        {(() => {
          const opensAtMs = new Date(event.start_time).getTime() - 120 * 60 * 60 * 1000;
          const discussionOpen = Boolean((event as unknown as { discussion_opened_at?: string | null }).discussion_opened_at) || Date.now() >= opensAtMs;
          return discussionOpen ? (
            <Link href={`/events/${event.id}/discussion`} style={{ display: 'block', width: '100%', marginTop: '10px', padding: '13px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: 'rgba(198,166,100,0.12)', color: '#C6A664', border: '1px solid rgba(198,166,100,0.35)', textAlign: 'center', textDecoration: 'none' }}>
              Join the Discussion
            </Link>
          ) : (
            <div style={{ width: '100%', marginTop: '10px', padding: '13px 24px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 500, backgroundColor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', cursor: 'default' }}>
              Discussion opens 5 days before the event
            </div>
          );
        })()}
      </div>
    );
    if (waitlistPosition) return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <AlertCircle style={{ width: '22px', height: '22px', color: 'rgba(255,255,255,0.5)' }} />
        </div>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>On the Waitlist</h3>
        {claimParam && (
          <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(198,166,100,0.08)', border: '1px solid rgba(198,166,100,0.3)', borderRadius: '8px' }}>
            <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#C6A664', marginBottom: '4px' }}>A spot opened up!</p>
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', marginBottom: '14px', lineHeight: 1.5 }}>Claim it now before it{"'"}s offered to the next member.</p>
            <button onClick={handleClaimSeat} disabled={isActionLoading} style={{ display: 'inline-block', width: '100%', padding: '13px 24px', backgroundColor: '#C6A664', color: '#1A1A1A', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: isActionLoading ? 'not-allowed' : 'pointer', fontSize: '0.9375rem', minHeight: '44px', opacity: isActionLoading ? 0.6 : 1 }}>{isActionLoading ? 'Claiming...' : 'Claim My Spot'}</button>
          </div>
        )}
        <WaitlistBadge position={waitlistPosition} onLeave={handleLeaveWaitlist} />
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginTop: '12px' }}>We{"'"}ll notify you if a spot opens.</p>
      </div>
    );
    if (!user) {
      if (event.access_type === 'public_free') return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>RSVP - no account needed</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '18px' }}>Open to everyone.</p>
          {publicRsvpFull ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.06)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Event Full</span>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '8px' }}>Sorry, we{"'"}re at capacity.</p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginBottom: '20px' }}>
                704 Collective members get priority access to events and can join the waitlist when something fills up.
              </p>
              <Link href="/join" style={{ display: 'inline-block', padding: '13px 24px', backgroundColor: '#C6A664', color: '#1A1A1A', fontWeight: 700, borderRadius: '8px', textDecoration: 'none', fontSize: '0.9375rem', minHeight: '44px' }}>
                Join 704 Collective
              </Link>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: '14px' }}>
                Membership starts at {SOCIAL_TIER.monthlyPriceShort}. Cancel anytime.
              </p>
            </div>
          ) : publicRsvpState === 'success' ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>You{"'"}re in.</p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '18px' }}>Confirmation sent to {publicRsvpEmail}.</p>

              {publicRsvpToken ? (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'inline-block', backgroundColor: '#FFFFFF', padding: '12px', borderRadius: '12px' }}>
                    <QRCodeSVG
                      value={publicRsvpToken}
                      size={140}
                      level="L"
                      bgColor="#FFFFFF"
                      fgColor="#000000"
                    />
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', marginTop: '12px' }}>
                    Show this code at the door for check-in.
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
                    A copy is in your confirmation email.
                  </p>
                </div>
              ) : null}

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
                <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>Curious about membership?</p>
                <Link href="/join" style={{ ...linkBtn, border: '1px solid #C6A664', color: '#C6A664' }}>Learn about 704 Collective</Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handlePublicRsvp} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', width: '100%', boxSizing: 'border-box' }}>
                <input
                  type="text"
                  placeholder="First name"
                  value={publicRsvpFirstName}
                  onChange={(e) => setPublicRsvpFirstName(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={publicRsvpLastName}
                  onChange={(e) => setPublicRsvpLastName(e.target.value)}
                  required
                  style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }}
                />
              </div>
              <input
                type="email"
                placeholder="Email"
                value={publicRsvpEmail}
                onChange={(e) => setPublicRsvpEmail(e.target.value)}
                required
                style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }}
              />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={publicRsvpPhone}
                onChange={(e) => setPublicRsvpPhone(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }}
              />
              {publicRsvpError && (
                <p style={{ fontSize: '0.8125rem', color: '#E57373', margin: 0 }}>{publicRsvpError}</p>
              )}
              <button
                type="submit"
                disabled={publicRsvpLoading}
                style={{ width: '100%', boxSizing: 'border-box', padding: '13px 24px', minHeight: '44px', backgroundColor: publicRsvpLoading ? 'rgba(198,166,100,0.5)' : '#C6A664', color: '#1A1A1A', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: publicRsvpLoading ? 'not-allowed' : 'pointer', fontSize: '0.9375rem', transition: 'all 200ms ease' }}
              >
                {publicRsvpLoading ? 'Reserving...' : 'Reserve my spot'}
              </button>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 }}>
                Already a member? <Link href="/login" style={{ color: '#C6A664', textDecoration: 'underline' }}>Sign in instead</Link>
              </p>
            </form>
          )}
        </div>
      );
      if (event.is_members_only) return (
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '12px' }}><MembersOnlyEventBadge /></div>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Member Event</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>Sign in to RSVP.</p>
          <Link href="/login" style={{ ...linkBtn, backgroundColor: '#FFF', color: '#000', marginBottom: '10px' }}>Sign In</Link>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)' }}>Not a member? <Link href="/social" style={{ color: '#FFF', textDecoration: 'underline', textUnderlineOffset: '2px' }}>Join 704 Social</Link></p>
        </div>
      );
      return (
        <div style={{ textAlign: 'center' }}>
          {ticketPrice > 0 && (
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>{formatPrice(ticketPrice)}</div>
          )}
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>{ticketPrice > 0 ? 'One-time ticket' : 'Sign in to get your ticket'}</p>
          {ticketPrice === 0 ? (
            <button onClick={() => router.push('/login')} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : 'Sign In to RSVP'}</button>
          ) : guestGateMode === 'member' ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.875rem', color: '#FFFFFF', fontWeight: 600, marginBottom: '4px' }}>Looks like you have an account.</p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', marginBottom: '14px' }}>Log in to continue - members RSVP free.</p>
              <Link href={`/login?redirect=/events/${event.id}`} style={{ ...primaryBtn, textDecoration: 'none', display: 'flex' }}>Log In to RSVP</Link>
              <button onClick={() => { setGuestGateMode('collect'); setGuestGateError(''); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '10px', cursor: 'pointer' }}>Use a different email</button>
            </div>
          ) : guestGateMode === 'collect' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="email"
                placeholder="Your email"
                value={guestGateEmail}
                onChange={(e) => setGuestGateEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleGuestEmailContinue(); }}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }}
              />
              {guestGateError && <p style={{ fontSize: '0.8125rem', color: '#E57373', margin: 0 }}>{guestGateError}</p>}
              <button onClick={handleGuestEmailContinue} disabled={guestGateLoading} style={primaryBtn}>{guestGateLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Checking...</> : 'Continue'}</button>
            </div>
          ) : guestGateMode === 'details' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', margin: '0 0 2px' }}>Just a few details for your ticket.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input type="text" placeholder="First name" value={guestFirstName} onChange={(e) => setGuestFirstName(e.target.value)} autoFocus style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }} />
                <input type="text" placeholder="Last name" value={guestLastName} onChange={(e) => setGuestLastName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }} />
              </div>
              <input type="tel" placeholder="Phone (optional)" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleGuestDetailsContinue(); }} style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', minHeight: '44px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#FFFFFF', fontSize: '0.9375rem', outline: 'none' }} />
              {guestGateError && <p style={{ fontSize: '0.8125rem', color: '#E57373', margin: 0 }}>{guestGateError}</p>}
              <button onClick={handleGuestDetailsContinue} disabled={guestGateLoading} style={primaryBtn}>{guestGateLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : 'Continue to checkout'}</button>
            </div>
          ) : (
            <button onClick={() => { setGuestGateMode('collect'); setGuestGateError(''); }} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : 'Purchase Ticket'}</button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /><span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /></div>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>Already a member? Login to RSVP.</p>
          <Link href="/login" style={{ ...linkBtn, color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>Sign In</Link>
        </div>
      );
    }
    if (isActiveMember) {
      // --- Access level gate ---
      // canRsvp / isBusinessOnly are the shared component-level derivation
      // (also consumed by the mobile sticky CTA). Only shown when user does
      // not already have a ticket (hasTicket is checked above).
      if (!canRsvp) return (
        <div style={{ borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.04)', padding: '20px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#C6A664', backgroundColor: 'rgba(198,166,100,0.08)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>
            {isBusinessOnly ? 'Business Members Only' : 'Members Only'}
          </span>
          <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: (isBusinessOnly && userMemberType === 'social') ? '0 0 16px' : '0' }}>
            {isBusinessOnly
              ? 'This event is reserved for our business members.'
              : 'This event is reserved for paying members.'}
          </p>
          {isBusinessOnly && userMemberType === 'social' && (
            <Link href="/apply/business" style={{ fontSize: '0.8125rem', color: '#C6A664', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              Apply for business membership
            </Link>
          )}
        </div>
      );

      if (ctaAtCapacity) return (
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.06)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Event Full</span>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Join the Waitlist</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>Get notified if a spot opens.</p>
          <button onClick={handleJoinWaitlist} disabled={isActionLoading} style={ghostBtn}>{isActionLoading ? 'Joining...' : 'Join Waitlist'}</button>
        </div>
      );
      const memberPrice = resolveMemberPrice();
      const standardPrice = event.ticket_price ?? 0;

      if (!memberPrice || memberPrice === 0) return (
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.06)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Member Benefit</span>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Member Event</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>RSVP - it{"'"}s on us.</p>
          <button onClick={handleMemberRegisterWithWaitlistFallback} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> RSVPing...</> : 'RSVP'}</button>
          {isSuperAdmin && isAtCapacity && (
            <p style={{ fontSize: '0.75rem', color: '#C6A664', marginTop: '10px' }}>Admin override - event is full</p>
          )}
        </div>
      );

      // STATE 3: Member Paid - member price > 0
      return (
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#C6A664', backgroundColor: 'rgba(198,166,100,0.08)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Member Price</span>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>{formatPrice(memberPrice)}</div>
          {standardPrice > memberPrice && (
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>Standard price: {formatPrice(standardPrice)}</p>
          )}
          {standardPrice <= memberPrice && (
            <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>One-time ticket</p>
          )}
          <button onClick={handlePurchaseTicket} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : `Purchase ticket - ${formatPrice(memberPrice)}`}</button>
        </div>
      );
    }
    if (event.access_type === 'public_free') return (
      <div style={{ textAlign: 'center' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>RSVP</h3>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>Open to everyone.</p>
        <button onClick={handleMemberRegisterWithWaitlistFallback} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> RSVPing...</> : 'RSVP'}</button>
      </div>
    );
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>{formatPrice(ticketPrice)}</div>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>One-time ticket</p>
        <button onClick={handlePurchaseTicket} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : 'Purchase Ticket'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /><span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /></div>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>Get unlimited access to all events.</p>
        <Link href="/social" style={{ ...linkBtn, color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>Join 704 Social - {SOCIAL_TIER.monthlyPriceShort}</Link>
      </div>
    );
  };

  const getMobileCTAText = () => {
    if (event.access_type === 'public_free') {
      if (!user) return 'RSVP - No Account Needed';
      return ctaAtCapacity ? 'Join Waitlist' : 'RSVP';
    }
    if (!user) return event.is_members_only ? 'Sign In to RSVP' : 'Purchase Ticket';
    if (isActiveMember) return ctaAtCapacity ? 'Join Waitlist' : 'RSVP';
    return 'Purchase Ticket';
  };
  const handleMobileCTA = () => {
    if (event.access_type === 'public_free') {
      if (!user) {
        const form = document.querySelector('form');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (ctaAtCapacity) handleJoinWaitlist();
      else handleMemberRegisterWithWaitlistFallback();
      return;
    }
    if (!user) {
      if (event.is_members_only || ticketPrice === 0) { router.push('/login'); return; }
      // Paid + signed out: open the email gate on the ticket card (same flow as
      // desktop) instead of jumping straight to Stripe. Scroll the card into view.
      setGuestGateMode('collect');
      setGuestGateError('');
      const card = document.getElementById('ticket-card');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (isActiveMember) { if (ctaAtCapacity) handleJoinWaitlist(); else handleMemberRegisterWithWaitlistFallback(); return; }
    handlePurchaseTicket();
  };

  return (
    <>
      <Nav />
      <div style={{ paddingTop: '64px', minHeight: '100vh', backgroundColor: '#000' }}>
        <MarketingPageRoot>
        <SEOJsonLd type="event" name={event.title} description={event.description || undefined} startDate={event.start_time} endDate={event.end_time} locationName={event.location_name || undefined} locationAddress={event.location_address || undefined} ticketPrice={event.ticket_price ?? undefined} imageUrl={event.image_url || undefined} eventUrl={`https://704collective.com/events/${event.id}`} />

        {event.image_url && (
          <div style={{ position: 'relative', height: '280px', overflow: 'hidden' }}>
            <Image src={event.image_url} alt={event.title} fill style={{ objectFit: 'cover' }} unoptimized={!event.image_url?.includes('supabase')} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 60%, #000 100%)' }} />
          </div>
        )}

        <div style={{ maxWidth: '960px', margin: '0 auto', padding: event.image_url ? '0 24px 80px' : '48px 24px 80px' }}>

          <Link href="/events" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', textDecoration: 'none', marginBottom: '28px', transition: 'color 200ms' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#FFF'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          >
            <ArrowLeft style={{ width: '15px', height: '15px' }} /> All Events
          </Link>

          <div className="event-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '48px' }}>
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                {event.category && event.category !== 'other' && <CategoryBadge category={event.category as EventCategory} />}
                {event.is_members_only && <MembersOnlyEventBadge />}
                {isAtCapacity && <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.06)', padding: '4px 12px', borderRadius: '100px' }}>Sold Out</span>}
              </div>

              <h1 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 2.5rem)', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: '20px' }}>{event.title}</h1>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9375rem' }}>
                  <Calendar style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: '#FFFFFF' }}>{format(eventDate, 'EEEE, MMMM d, yyyy')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9375rem' }}>
                  <Clock style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{format(eventDate, 'h:mm a')} - {format(endDate, 'h:mm a')}</span>
                </div>
                {event.location_name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9375rem' }}>
                    <MapPin style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{event.location_name}</span>
                  </div>
                )}
              </div>

              {event.description && event.description.trim() !== '' && (
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>About This Event</h2>
                  <p style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>{event.description}</p>
                </div>
              )}

              {event.capacity && ticketCount > 0 && (
                <div style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Users style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.3)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '8px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>Attendees</span>
                        <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{ticketCount} / {event.capacity}</span>
                      </div>
                      <div style={{ height: '3px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(fillPct, 100)}%`, backgroundColor: fillPct >= 100 ? '#E57373' : fillPct >= 80 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)', borderRadius: '2px', transition: 'width 500ms ease' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <WhosGoing eventId={id!} />

              {event.location_address && (
                <div style={{ marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Location</h2>
                  <div style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '18px 20px' }}>
                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>{event.location_name}</p>
                    <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>{event.location_address}</p>
                  </div>
                </div>
              )}
            </div>

            <div style={{ alignSelf: 'start', position: 'sticky', top: '24px' }}>
              <div id="ticket-card" style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px 22px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
                {renderTicketCard()}
                {/* Admin discovery: backend already grants admins full discussion access;
                    this surfaces the link when they hold no ticket (same open-window rule as members). */}
                {(() => {
                  if (!isAdmin || hasTicket) return null;
                  const opensAtMs = new Date(event.start_time).getTime() - 120 * 60 * 60 * 1000;
                  const discussionOpen = Boolean((event as unknown as { discussion_opened_at?: string | null }).discussion_opened_at) || Date.now() >= opensAtMs;
                  if (!discussionOpen) return null;
                  return (
                    <Link href={`/events/${event.id}/discussion`} style={{ display: 'block', width: '100%', marginTop: '12px', padding: '13px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: 'rgba(198,166,100,0.12)', color: '#C6A664', border: '1px solid rgba(198,166,100,0.35)', textAlign: 'center', textDecoration: 'none' }}>
                      View the Discussion
                    </Link>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {!hasTicket && !waitlistPosition && (
          <div className="mobile-sticky-cta" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', display: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
              {isActiveMember && !canRsvp ? (
                /* Same eligibility the desktop card enforces — ineligible members
                   get a non-actionable state instead of a working RSVP button. */
                <div style={{ flex: 1, padding: '14px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: 'rgba(198,166,100,0.08)', color: '#C6A664', border: '1px solid rgba(198,166,100,0.25)', textAlign: 'center', cursor: 'default' }}>
                  {isBusinessOnly ? 'Business Members Only' : 'Members Only'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: (event.ticket_mode === 'all' && isActiveMember) ? '#C6A664' : (isActiveMember || event.access_type === 'public_free') ? '#4CAF50' : '#FFFFFF' }}>
                    {(event.ticket_mode === 'all' && isActiveMember)
                      ? formatPrice(resolveMemberPrice() ?? ticketPrice)
                      : (isActiveMember || ticketPrice <= 0 || event.access_type === 'public_free' ? '' : formatPrice(ticketPrice))}</div>
                  <button onClick={handleMobileCTA} disabled={isActionLoading} style={{ flex: 1, padding: '14px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: '#FFF', color: '#000', border: 'none', cursor: isActionLoading ? 'wait' : 'pointer', opacity: isActionLoading ? 0.6 : 1 }}>
                    {isActionLoading ? 'Loading...' : getMobileCTAText()}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {!hasTicket && !waitlistPosition && <div className="mobile-spacer" style={{ height: '80px', display: 'none' }} />}

        <ThankYouModal open={showThankYou} onOpenChange={setShowThankYou} type={thankYouType} event={thankYouEvent ?? undefined} />

        <Dialog open={hostDialogOpen} onOpenChange={(o) => { if (!hostSending) setHostDialogOpen(o); }}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Message {hostName ? hostName.split(' ')[0] : 'the host'}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-1">
              Your name and contact info are shared with the host so they can reply.
            </p>
            <textarea
              value={hostMessage}
              onChange={(e) => setHostMessage(e.target.value.slice(0, 1000))}
              maxLength={1000}
              rows={5}
              placeholder={`Ask ${hostName ? hostName.split(' ')[0] : 'the host'} a question about this event…`}
              disabled={hostSending}
              className="w-full rounded-lg border border-input bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div className="text-right text-xs text-muted-foreground">{hostMessage.length}/1000</div>
            <DialogFooter>
              <button
                onClick={handleSendHostMessage}
                disabled={hostSending || !hostMessage.trim()}
                style={{ ...primaryBtn, opacity: (hostSending || !hostMessage.trim()) ? 0.6 : 1, cursor: (hostSending || !hostMessage.trim()) ? 'not-allowed' : 'pointer' }}
              >
                {hostSending ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Sending…</> : 'Send'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </MarketingPageRoot>
      </div>
      <Footer />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @media (max-width: 768px) {
          .event-layout { grid-template-columns: 1fr !important; gap: 24px !important; }
          .event-layout > div:last-child { position: static !important; top: auto !important; }
          .mobile-sticky-cta { display: block !important; }
          .mobile-spacer { display: block !important; }
        }
      `}</style>
    </>
  );
}