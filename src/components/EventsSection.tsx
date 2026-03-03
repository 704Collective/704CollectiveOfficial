'use client';

import Link from 'next/link';
import { ArrowRight, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EventGridCard } from '@/components/EventGridCard';

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
  is_members_only: boolean;
  ticket_price: number;
  tags?: string[] | null;
}

interface EventsSectionProps {
  events: Event[];
  loading: boolean;
  title: string;
  isActiveMember: boolean;
  isLoggedIn: boolean;
  userTicketEventIds: Set<string>;
  rsvpLoadingId?: string | null;
  onGuestPurchase: (eventId: string) => void;
  onGetTicket: (event: Event) => void;
}

function LoadingSkeleton() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Loading events">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card-elevated animate-pulse" aria-hidden="true">
          <div className="aspect-video bg-muted" />
          <div className="p-4 space-y-3">
            <div className="h-5 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12" role="status">
      <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
      <p className="text-muted-foreground">No upcoming events yet. Check back soon!</p>
    </div>
  );
}

export function EventsSection({ 
  events, 
  loading, 
  title, 
  isActiveMember, 
  isLoggedIn, 
  userTicketEventIds,
  rsvpLoadingId,
  onGuestPurchase,
  onGetTicket,
}: EventsSectionProps) {
  return (
    <section className="py-12 md:py-20 border-t border-border" aria-labelledby="events-heading">
      <div className="container max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 md:mb-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Upcoming Events</p>
            <h2 id="events-heading" className="text-2xl md:text-3xl font-semibold">{title}</h2>
            <p className="text-muted-foreground mt-1">See what's happening</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/events" aria-label="View all upcoming events">
              View All
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <LoadingSkeleton />
        ) : events.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {events.map((event) => (
              <EventGridCard
                key={event.id}
                id={event.id}
                title={event.title}
                description={event.description || undefined}
                startTime={event.start_time}
                endTime={event.end_time}
                locationName={event.location_name || undefined}
                imageUrl={event.image_url || undefined}
                ticketPrice={event.ticket_price}
                isActiveMembersOnly={event.is_members_only}
                userHasTicket={userTicketEventIds.has(event.id)}
                isUserMember={isActiveMember}
                isLoggedIn={isLoggedIn}
                capacity={event.capacity}
                ticketCount={0}
                tags={event.tags}
                loading={rsvpLoadingId === event.id}
                onGetTicket={() => onGetTicket(event)}
                onGuestPurchase={() => onGuestPurchase(event.id)}
                onClick={() => window.location.href = `/events/${event.id}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </section>
  );
}
