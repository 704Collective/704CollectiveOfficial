'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, MapPin, Users, ArrowLeft, Check, Ticket, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTicketActions } from '@/hooks/useTicketActions';
import { SEOJsonLd } from '@/components/SEOJsonLd';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Header } from '@/components/Header';
import { ThankYouModal } from '@/components/ThankYouModal';
import { WhosGoing } from '@/components/WhosGoing';
import { CategoryBadge, EventCategory } from '@/components/CategoryBadge';
import { AddToCalendarButtons } from '@/components/AddToCalendarButtons';
import { WaitlistBadge } from '@/components/WaitlistBadge';

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
  ticket_price: number | null;
  category: string | null;
  allows_guest_passes: boolean | null;
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, isActiveMember, isAdmin, loading: authLoading } = useAuth();

  const {
    hasTicket: checkHasTicket,
    rsvpLoadingId,
    showThankYou,
    setShowThankYou,
    thankYouType,
    registerMemberTicket,
    refreshUserTickets,
  } = useTicketActions();
  
  const [event, setEvent] = useState<Event | null>(null);
  usePageTitle(event ? event.title : 'Event Details');
  const [loading, setloading] = useState(true);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [ticketCount, setTicketCount] = useState(0);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [waitlistId, setWaitlistId] = useState<string | null>(null);

  const hasTicket = id ? checkHasTicket(id) : false;

  useEffect(() => {
    if (id) {
      fetchEvent();
    }
  }, [id]);

  useEffect(() => {
    if (user && id) {
      fetchTicketId();
      checkWaitlistStatus();
    }
  }, [user, id]);

  useEffect(() => {
    if (id) {
      fetchTicketCount();
    }
  }, [id]);

  const fetchEvent = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      toast.error('Failed to load event');
      router.push('/events');
      return;
    }

    if (!data) {
      toast.error('Event not found');
      router.push('/events');
      return;
    }

    setEvent(data);
    setloading(false);
  };

  /** We only need the ticket ID locally for cancel functionality */
  const fetchTicketId = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('tickets')
      .select('id')
      .eq('event_id', id)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .maybeSingle();

    setTicketId(data?.id || null);
  };

  const fetchTicketCount = async () => {
    const { count } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('status', 'confirmed');
    
    setTicketCount(count || 0);
  };

  const checkWaitlistStatus = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('event_waitlist')
      .select('id, position')
      .eq('event_id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (data) {
      setWaitlistPosition(data.position);
      setWaitlistId(data.id);
    }
  };

  const isAtCapacity = event?.capacity != null && ticketCount >= event.capacity;

  const handleMemberRegister = async () => {
    if (!event) return;
    const success = await registerMemberTicket(event);
    if (success) {
      fetchTicketCount();
      fetchTicketId();
    }
  };

  const handleCancelRSVP = async () => {
    if (!ticketId) return;
    
    setIsCancelling(true);
    
    const { error } = await supabase
      .from('tickets')
      .update({ status: 'cancelled' })
      .eq('id', ticketId);
    
    if (error) {
      toast.error('Failed to cancel RSVP');
      setIsCancelling(false);
      return;
    }
    
    setTicketId(null);
    setIsCancelling(false);
    toast.success('RSVP cancelled');
    fetchTicketCount();
    refreshUserTickets();
  };

  const handleJoinWaitlist = async () => {
    if (!user || !event) return;
    
    setIsRegistering(true);
    
    const { data: maxPos } = await supabase
      .from('event_waitlist')
      .select('position')
      .eq('event_id', event.id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const newPosition = (maxPos?.position || 0) + 1;
    
    const { data, error } = await supabase
      .from('event_waitlist')
      .insert({
        event_id: event.id,
        user_id: user.id,
        position: newPosition,
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        toast.error('You are already on the waitlist');
      } else {
        toast.error('Failed to join waitlist');
      }
      setIsRegistering(false);
      return;
    }
    
    setWaitlistPosition(newPosition);
    setWaitlistId(data.id);
    setIsRegistering(false);
    toast.success(`You're #${newPosition} on the waitlist!`);
  };

  const handleLeaveWaitlist = async () => {
    if (!waitlistId) return;
    
    const { error } = await supabase
      .from('event_waitlist')
      .delete()
      .eq('id', waitlistId);
    
    if (error) {
      toast.error('Failed to leave waitlist');
      return;
    }
    
    setWaitlistPosition(null);
    setWaitlistId(null);
    toast.success('Left the waitlist');
  };

  const handlePurchaseTicket = async () => {
    if (!event) return;
    
    setIsRegistering(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-ticket-checkout', {
        body: {
          eventId: event.id,
          eventTitle: event.title,
        },
      });

      if (error) {
        console.error('Supabase error:', error);
        toast.error('Failed to create checkout session');
        setIsRegistering(false);
        return;
      }

      if (data?.error) {
        console.error('Function error:', data.error);
        toast.error(data.error);
        setIsRegistering(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('No checkout URL received');
        setIsRegistering(false);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Something went wrong. Please try again.');
      setIsRegistering(false);
    }
  };

  const handleGuestPurchase = async () => {
    if (!event) return;
    
    setIsRegistering(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-ticket-checkout', {
        body: {
          eventId: event.id,
          eventTitle: event.title,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || 'Failed to create checkout session');
        setIsRegistering(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('No checkout URL received');
        setIsRegistering(false);
      }
    } catch (err) {
      toast.error('Something went wrong. Please try again.');
      setIsRegistering(false);
    }
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(0)}`;
  };

  // Use rsvpLoadingId from hook OR local isRegistering for purchase flows
  const isActionLoading = (rsvpLoadingId === id) || isRegistering;

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container py-8">
          <Skeleton className="h-64 w-full rounded-xl mb-8" />
          <Skeleton className="h-10 w-2/3 mb-4" />
          <Skeleton className="h-6 w-1/3 mb-4" />
          <Skeleton className="h-4 w-1/4 mb-8" />
          <Skeleton className="h-32 w-full mb-6" />
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
    );
  }

  if (!event) {
    return null;
  }

  const eventDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const ticketPrice = event.ticket_price ?? 1000;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SEOJsonLd
        type="event"
        name={event.title}
        description={event.description || undefined}
        startDate={event.start_time}
        endDate={event.end_time}
        locationName={event.location_name || undefined}
        locationAddress={event.location_address || undefined}
        ticketPrice={event.ticket_price ?? undefined}
        imageUrl={event.image_url || undefined}
        eventUrl={`https://704collective.com/events/${event.id}`}
      />
      {/* Hero Section */}
      <div className="relative">
        {event.image_url && (
          <>
            <div className="absolute inset-0 h-[200px] sm:h-[320px] lg:h-[400px]">
              <img 
                src={event.image_url} 
                alt={`${event.title} event photo`}
                loading="lazy"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
            </div>
          </>
        )}
        
        <div className="container relative pt-6 pb-8">
          <Link href="/events" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            All Events
          </Link>

          <div className="max-w-3xl space-y-4">
            {event.category && event.category !== 'other' ? (
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">
                {event.category.replace(/_/g, ' ')}
              </p>
            ) : (
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Event</p>
            )}
            
            <div className="flex flex-wrap items-center gap-2">
              {event.category && event.category !== 'other' && (
                <CategoryBadge category={event.category as EventCategory} />
              )}
              {event.is_members_only && (
                <Badge variant="secondary" className="bg-secondary/80 backdrop-blur-sm">Members Only</Badge>
              )}
              {isAtCapacity && (
                <Badge variant="destructive">Sold Out</Badge>
              )}
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight">
              {event.title}
            </h1>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-muted-foreground pt-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary/70" />
                <span className="font-medium text-foreground">{format(eventDate, 'EEE, MMM d')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary/70" />
                <span>{format(eventDate, 'h:mm a')}</span>
              </div>
              {event.location_name && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary/70" />
                  <span>{event.location_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <main className="container pb-16">
        <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
          <div className="lg:col-span-2 space-y-8">
            {event.capacity && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Attendees</span>
                    <span className="font-medium">{ticketCount} / {event.capacity}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    {(() => {
                      const pct = Math.min((ticketCount / event.capacity) * 100, 100);
                      const barColor = pct >= 100 ? 'bg-destructive' : pct >= 80 ? 'bg-orange-500' : 'bg-primary';
                      return (
                        <div 
                          className={`h-full ${barColor} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="card-elevated p-6">
              <WhosGoing eventId={id!} />
            </div>

            {event.description && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">About</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.description}</p>
              </div>
            )}

            {event.location_address && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Location</h2>
                <div className="p-4 rounded-lg bg-card border border-border">
                  <p className="font-medium">{event.location_name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{event.location_address}</p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Ticket Card */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24 border-border/50 shadow-lg">
              <CardContent className="p-6 space-y-6">
                {hasTicket ? (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                      <Check className="w-8 h-8 text-green-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">You're RSVP'd!</h3>
                      <p className="text-muted-foreground mt-1">
                        We'll see you there on {format(eventDate, 'MMMM d')}.
                      </p>
                    </div>
                    
                    <AddToCalendarButtons 
                      event={{
                        title: event.title,
                        description: event.description || '',
                        startTime: event.start_time,
                        endTime: event.end_time,
                        location: event.location_name || '',
                      }}
                    />
                    
                    <Button variant="outline" className="w-full" asChild>
                      <Link href="/dashboard">
                        <Ticket className="w-4 h-4 mr-2" />
                        View My Tickets
                      </Link>
                    </Button>
                    
                    <Button 
                      variant="ghost" 
                      className="w-full text-destructive hover:text-destructive"
                      onClick={handleCancelRSVP}
                      disabled={isCancelling}
                    >
                      <X className="w-4 h-4 mr-2" />
                      {isCancelling ? 'Cancelling...' : 'Cancel RSVP'}
                    </Button>
                  </div>
                ) : waitlistPosition ? (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-8 h-8 text-yellow-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold">You're on the Waitlist</h3>
                      <WaitlistBadge 
                        position={waitlistPosition} 
                        onLeave={handleLeaveWaitlist}
                        className="mt-2"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      We'll notify you if a spot opens up.
                    </p>
                  </div>
                ) : !user ? (
                  event.is_members_only ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <Badge variant="secondary" className="mb-2">Members Only</Badge>
                        <h3 className="text-xl font-semibold">Member Event</h3>
                        <p className="text-muted-foreground mt-1">
                          Sign in to RSVP for this event
                        </p>
                      </div>
                      <Button className="w-full" asChild>
                        <Link href="/login">Sign In</Link>
                      </Button>
                      <p className="text-center text-sm text-muted-foreground">
                        Don't have an account?{' '}
                        <Link href="/join" className="text-primary hover:underline">
                          Become a member
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold">{formatPrice(ticketPrice)}</div>
                        <p className="text-muted-foreground mt-1">One-time ticket</p>
                      </div>
                      <Button 
                        className="w-full" 
                        onClick={handleGuestPurchase}
                        disabled={isActionLoading}
                      >
                        {isActionLoading ? 'Redirecting...' : 'Purchase Ticket'}
                      </Button>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">or</span>
                        </div>
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Already a member? Login to RSVP for this event
                        </p>
                        <Button variant="outline" className="w-full" asChild>
                          <Link href="/login">Sign In</Link>
                        </Button>
                      </div>
                    </div>
                  )
                ) : isActiveMember ? (
                  isAtCapacity ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <Badge variant="destructive" className="mb-2">Event Full</Badge>
                        <h3 className="text-xl font-semibold">Join Waitlist</h3>
                        <p className="text-muted-foreground mt-1">
                          Get notified if a spot opens up
                        </p>
                      </div>
                      <Button 
                        className="w-full" 
                        variant="outline"
                        onClick={handleJoinWaitlist}
                        disabled={isActionLoading}
                      >
                        {isActionLoading ? 'Joining...' : 'Join Waitlist'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-center">
                        <Badge variant="secondary" className="mb-2">Member Benefit</Badge>
                        <h3 className="text-xl font-semibold">Free Entry</h3>
                        <p className="text-muted-foreground mt-1">
                          RSVP for this event for free
                        </p>
                      </div>
                      <Button 
                        className="w-full" 
                        variant="default"
                        onClick={handleMemberRegister}
                        disabled={isActionLoading}
                      >
                        {isActionLoading ? 'RSVPing...' : 'RSVP for Free'}
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold">{formatPrice(ticketPrice)}</div>
                      <p className="text-muted-foreground mt-1">One-time ticket</p>
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={handlePurchaseTicket}
                      disabled={isActionLoading}
                    >
                      {isActionLoading ? 'Redirecting...' : 'Purchase Ticket'}
                    </Button>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Get unlimited free access to all events
                      </p>
                      <Button variant="outline" className="w-full" asChild>
                        <Link href="/join">Join 704 Collective</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Sticky mobile RSVP bar */}
      {!hasTicket && !waitlistPosition && (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-background/95 backdrop-blur-sm border-t border-border p-4 safe-area-pb">
          <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
            <div className="text-sm">
              {isActiveMember || ticketPrice <= 0 ? (
                <span className="font-semibold text-primary">Free</span>
              ) : (
                <span className="font-semibold">{formatPrice(ticketPrice)}</span>
              )}
            </div>
            {!user ? (
              event.is_members_only ? (
                <Button className="min-h-[44px] flex-1" asChild>
                  <Link href="/login">Sign In to RSVP</Link>
                </Button>
              ) : (
                <Button 
                  className="min-h-[44px] flex-1" 
                  onClick={handleGuestPurchase}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? 'Redirecting...' : 'Purchase Ticket'}
                </Button>
              )
            ) : isActiveMember ? (
              isAtCapacity ? (
                <Button 
                  className="min-h-[44px] flex-1" 
                  variant="outline"
                  onClick={handleJoinWaitlist}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? 'Joining...' : 'Join Waitlist'}
                </Button>
              ) : (
                <Button 
                  className="min-h-[44px] flex-1" 
                  onClick={handleMemberRegister}
                  disabled={isActionLoading}
                >
                  {isActionLoading ? 'RSVPing...' : 'RSVP for Free'}
                </Button>
              )
            ) : (
              <Button 
                className="min-h-[44px] flex-1" 
                onClick={handlePurchaseTicket}
                disabled={isActionLoading}
              >
                {isActionLoading ? 'Redirecting...' : 'Purchase Ticket'}
              </Button>
            )}
          </div>
        </div>
      )}

      {!hasTicket && !waitlistPosition && (
        <div className="h-20 lg:hidden" />
      )}

      <ThankYouModal 
        open={showThankYou} 
        onOpenChange={setShowThankYou} 
        type={thankYouType} 
      />
    </div>
  );
}
