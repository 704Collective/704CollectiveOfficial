'use client';

import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Check, Ticket, X, AlertCircle, Loader2 } from 'lucide-react';
import Nav from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTicketActions } from '@/hooks/useTicketActions';
import { SEOJsonLd } from '@/components/SEOJsonLd';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThankYouModal } from '@/components/ThankYouModal';
import { WhosGoing } from '@/components/WhosGoing';
import { CategoryBadge, EventCategory, MembersOnlyEventBadge } from '@/components/CategoryBadge';
import { AddToCalendarButtons } from '@/components/AddToCalendarButtons';
import { WaitlistBadge } from '@/components/WaitlistBadge';
import { MarketingPageRoot } from '@/components/MarketingPageRoot';

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
  category: string | null;
  allows_guest_passes: boolean | null;
  access_type?: 'members_only' | 'public_ticketed' | 'public_free';
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, isActiveMember, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();
  const { hasTicket: checkHasTicket, rsvpLoadingId, showThankYou, setShowThankYou, thankYouType, thankYouEvent, registerMemberTicket, refreshUserTickets } = useTicketActions();

  const [event, setEvent] = useState<Event | null>(null);
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

  const hasTicket = id ? checkHasTicket(id) : false;

  useEffect(() => { if (id) fetchEvent(); }, [id]);
  useEffect(() => { if (user && id) { fetchTicketId(); checkWaitlistStatus(); } }, [user, id]);
  useEffect(() => { if (id) fetchTicketCount(); }, [id]);

  const fetchEvent = async () => {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (error) { toast.error('Failed to load event'); router.push('/events'); return; }
    if (!data) { toast.error('Event not found'); router.push('/events'); return; }
    setEvent(data); setloading(false);
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
    const { data } = await supabase.from('tickets')
      .select('id, status, checked_in_at')
      .eq('event_id', id)
      .eq('user_id', user.id)
      .in('status', ['confirmed', 'rsvp', 'attended'])
      .maybeSingle();
    setTicketId(data?.id || null);
    setTicketStatus(data?.status || null);
    setCheckedInAt(data?.checked_in_at || null);
  };
  const fetchTicketCount = async () => {
    const { count } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('event_id', id).in('status', ['confirmed', 'rsvp']);
    setTicketCount(count || 0);
  };
  const checkWaitlistStatus = async () => {
    if (!user) return;
    const { data } = await supabase.from('event_waitlist').select('id, position').eq('event_id', id).eq('user_id', user.id).maybeSingle();
    if (data) { setWaitlistPosition(data.position); setWaitlistId(data.id); }
  };

  const isAtCapacity = event?.capacity != null && ticketCount >= event.capacity;

  const handleMemberRegister = async () => { if (!event) return; const s = await registerMemberTicket(event); if (s) { fetchTicketCount(); fetchTicketId(); } };
  const handleCancelRSVP = async () => {
    if (!ticketId) return; setIsCancelling(true);
    const { error } = await supabase.from('tickets').update({ status: 'cancelled' }).eq('id', ticketId);
    if (error) { toast.error('Failed to cancel RSVP'); setIsCancelling(false); return; }
    setTicketId(null); setIsCancelling(false); toast.success('RSVP cancelled'); fetchTicketCount(); refreshUserTickets();
  };
  const handleJoinWaitlist = async () => {
    if (!user || !event) return; setIsRegistering(true);
    const { data, error } = await supabase.from('event_waitlist').insert({ event_id: event.id, user_id: user.id, position: 0 }).select('id, position').single();
    if (error) { toast.error(error.code === '23505' ? 'Already on waitlist' : 'Failed to join'); setIsRegistering(false); return; }
    setWaitlistPosition(data.position); setWaitlistId(data.id); setIsRegistering(false); toast.success(`You're #${data.position} on the waitlist!`);
  };
  const handleLeaveWaitlist = async () => {
    if (!waitlistId) return;
    const { error } = await supabase.from('event_waitlist').delete().eq('id', waitlistId);
    if (error) { toast.error('Failed to leave waitlist'); return; }
    setWaitlistPosition(null); setWaitlistId(null); toast.success('Left the waitlist');
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
        setPublicRsvpError(data.error || 'Something went wrong. Please try again.');
        setPublicRsvpLoading(false);
        return;
      }

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

  const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '13px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: isActionLoading ? 'wait' : 'pointer', opacity: isActionLoading ? 0.6 : 1, transition: 'all 200ms ease', backgroundColor: '#FFFFFF', color: '#000000', border: 'none' };
  const ghostBtn: React.CSSProperties = { ...primaryBtn, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' };
  const dangerBtn: React.CSSProperties = { ...primaryBtn, backgroundColor: 'transparent', color: '#E57373', border: '1px solid rgba(229,115,115,0.15)' };
  const linkBtn: React.CSSProperties = { display: 'block', width: '100%', padding: '11px 24px', borderRadius: '10px', fontSize: '0.8125rem', fontWeight: 600, textAlign: 'center', textDecoration: 'none', transition: 'all 200ms ease' };

  const renderTicketCard = () => {
    // STATE 7: Attended — past event with checked_in_at OR status='attended'
    const isAttended = ticketStatus === 'attended' || checkedInAt;
    if (hasTicket && isAttended) return (
      <div style={{ textAlign: 'center' }}>
        <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#C6A664', backgroundColor: 'rgba(198,166,100,0.08)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Attended</span>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>You attended this one.</h3>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>{checkedInAt ? `Checked in ${format(new Date(checkedInAt), 'MMMM d, yyyy')}` : `Event on ${format(eventDate, 'MMMM d, yyyy')}`}</p>
        <Link href="/events" style={{ ...linkBtn, backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar style={{ width: '13px', height: '13px' }} /> Browse Other Events</span></Link>
      </div>
    );
    if (hasTicket) return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(76,175,80,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <Check style={{ width: '22px', height: '22px', color: '#4CAF50' }} />
        </div>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>You{"'"}re RSVP{"'"}d!</h3>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>See you on {format(eventDate, 'MMMM d')}.</p>
        <div style={{ marginBottom: '10px' }}><AddToCalendarButtons event={{ title: event.title, description: event.description || '', startTime: event.start_time, endTime: event.end_time, location: event.location_name || '' }} /></div>
        <Link href="/events" style={{ ...linkBtn, backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar style={{ width: '13px', height: '13px' }} /> Browse Other Events</span></Link>
        <Link href="/dashboard" style={{ ...linkBtn, color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: '8px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Ticket style={{ width: '13px', height: '13px' }} /> View My Tickets</span></Link>
        <button onClick={handleCancelRSVP} disabled={isCancelling} style={dangerBtn}><X style={{ width: '14px', height: '14px' }} />{isCancelling ? 'Cancelling...' : 'Cancel RSVP'}</button>
      </div>
    );
    if (waitlistPosition) return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <AlertCircle style={{ width: '22px', height: '22px', color: 'rgba(255,255,255,0.5)' }} />
        </div>
        <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>On the Waitlist</h3>
        <WaitlistBadge position={waitlistPosition} onLeave={handleLeaveWaitlist} />
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginTop: '12px' }}>We{"'"}ll notify you if a spot opens.</p>
      </div>
    );
    if (!user) {
      if (event.access_type === 'public_free') return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>RSVP — no account needed</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '18px' }}>Free event, open to everyone.</p>
          {publicRsvpState === 'success' ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: '8px' }}>✓</div>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>See you there.</p>
              <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginBottom: '20px' }}>Confirmation sent to {publicRsvpEmail}.</p>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
                <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.5)', marginBottom: '10px' }}>Curious about membership?</p>
                <Link href="/join" style={{ ...linkBtn, border: '1px solid #C6A664', color: '#C6A664' }}>Learn about 704 Collective →</Link>
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
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>{ticketPrice > 0 ? formatPrice(ticketPrice) : 'Free'}</div>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>{ticketPrice > 0 ? 'One-time ticket' : 'Sign in to get your ticket'}</p>
          <button onClick={ticketPrice === 0 ? () => router.push('/login') : handleGuestPurchase} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : ticketPrice === 0 ? 'Sign In to RSVP' : 'Purchase Ticket'}</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /><span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /></div>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>Already a member? Login to RSVP for free.</p>
          <Link href="/login" style={{ ...linkBtn, color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>Sign In</Link>
        </div>
      );
    }
    if (isActiveMember) {
      if (isAtCapacity) return (
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#E57373', backgroundColor: 'rgba(229,115,115,0.06)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Event Full</span>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Join the Waitlist</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>Get notified if a spot opens.</p>
          <button onClick={handleJoinWaitlist} disabled={isActionLoading} style={ghostBtn}>{isActionLoading ? 'Joining...' : 'Join Waitlist'}</button>
        </div>
      );
      return (
        <div style={{ textAlign: 'center' }}>
          <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.06)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Member Benefit</span>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Free Entry</h3>
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>RSVP - it{"'"}s on us.</p>
          <button onClick={handleMemberRegister} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> RSVPing...</> : 'RSVP for Free'}</button>
        </div>
      );
    }
    if (event.access_type === 'public_free') return (
      <div style={{ textAlign: 'center' }}>
        <span style={{ display: 'inline-block', fontSize: '0.6875rem', fontWeight: 600, color: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.06)', padding: '4px 12px', borderRadius: '100px', marginBottom: '12px' }}>Free Event</span>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>Free Entry</h3>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', marginBottom: '18px' }}>RSVP — open to everyone.</p>
        <button onClick={handleMemberRegister} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> RSVPing...</> : 'RSVP for Free'}</button>
      </div>
    );
    return (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '2px' }}>{formatPrice(ticketPrice)}</div>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '18px' }}>One-time ticket</p>
        <button onClick={handlePurchaseTicket} disabled={isActionLoading} style={primaryBtn}>{isActionLoading ? <><Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} /> Redirecting...</> : 'Purchase Ticket'}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /><span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>or</span><div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} /></div>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '10px' }}>Get unlimited free access to all events.</p>
        <Link href="/social" style={{ ...linkBtn, color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>Join 704 Social - $35/mo</Link>
      </div>
    );
  };

  const getMobileCTAText = () => {
    if (event.access_type === 'public_free') {
      if (!user) return 'RSVP — No Account Needed';
      return isAtCapacity ? 'Join Waitlist' : 'RSVP for Free';
    }
    if (!user) return event.is_members_only ? 'Sign In to RSVP' : 'Purchase Ticket';
    if (isActiveMember) return isAtCapacity ? 'Join Waitlist' : 'RSVP for Free';
    return 'Purchase Ticket';
  };
  const handleMobileCTA = () => {
    if (event.access_type === 'public_free') {
      if (!user) {
        const form = document.querySelector('form');
        if (form) form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (isAtCapacity) handleJoinWaitlist();
      else handleMemberRegister();
      return;
    }
    if (!user) { if (event.is_members_only || ticketPrice === 0) router.push('/login'); else handleGuestPurchase(); return; }
    if (isActiveMember) { if (isAtCapacity) handleJoinWaitlist(); else handleMemberRegister(); return; }
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
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{format(eventDate, 'h:mm a')} – {format(endDate, 'h:mm a')}</span>
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
              <div style={{ backgroundColor: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px 22px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
                {renderTicketCard()}
              </div>
            </div>
          </div>
        </div>

        {!hasTicket && !waitlistPosition && (
          <div className="mobile-sticky-cta" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '14px 24px', display: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', maxWidth: '500px', margin: '0 auto' }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: (isActiveMember || event.access_type === 'public_free') ? '#4CAF50' : '#FFFFFF' }}>{isActiveMember || ticketPrice <= 0 || event.access_type === 'public_free' ? 'Free' : formatPrice(ticketPrice)}</div>
              <button onClick={handleMobileCTA} disabled={isActionLoading} style={{ flex: 1, padding: '14px 24px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, backgroundColor: '#FFF', color: '#000', border: 'none', cursor: isActionLoading ? 'wait' : 'pointer', opacity: isActionLoading ? 0.6 : 1 }}>
                {isActionLoading ? 'Loading...' : getMobileCTAText()}
              </button>
            </div>
          </div>
        )}
        {!hasTicket && !waitlistPosition && <div className="mobile-spacer" style={{ height: '80px', display: 'none' }} />}

        <ThankYouModal open={showThankYou} onOpenChange={setShowThankYou} type={thankYouType} event={thankYouEvent ?? undefined} />
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