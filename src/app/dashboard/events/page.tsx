'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Calendar, Check, MapPin, Clock, History, ArrowRight, Ticket } from 'lucide-react';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTickets } from '@/hooks/queries';

interface EventTicket {
  id: string;
  event_id: string;
  status: string;
  checked_in_at: string | null;
  events: {
    id: string;
    title: string;
    start_time: string;
    end_time: string | null;
    location_name: string | null;
    image_url: string | null;
  };
}

export default function DashboardEventsPage() {
  const { user } = useAuth();
  usePageTitle('My Events');

  const { data: rawData, isLoading } = useTickets(user?.id ?? '');

  const now = new Date();
  const allTickets = (rawData ?? []) as unknown as EventTicket[];

  // Keep an event in "upcoming" until 30 minutes after its end_time (or start_time if no end_time)
  const effectiveCutoff = (t: EventTicket): number => {
    const base = t.events.end_time ?? t.events.start_time;
    return new Date(base).getTime() + 30 * 60 * 1000;
  };

  const upcomingTickets = allTickets
    .filter(t => t.events && effectiveCutoff(t) > now.getTime())
    .sort((a, b) => new Date(a.events.start_time).getTime() - new Date(b.events.start_time).getTime());

  const pastTickets = allTickets
    .filter(t => t.events && effectiveCutoff(t) <= now.getTime())
    .sort((a, b) => new Date(b.events.start_time).getTime() - new Date(a.events.start_time).getTime());

  const renderTicketRow = (ticket: EventTicket, isPast: boolean) => {
    const date = new Date(ticket.events.start_time);
    const endDate = ticket.events.end_time ? new Date(ticket.events.end_time) : null;
    const checkedIn = !!ticket.checked_in_at;

    return (
      <Link
        key={ticket.id}
        href={`/events/${ticket.event_id}`}
        className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
      >
        <div className="w-14 h-14 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {format(date, 'MMM')}
          </span>
          <span className="text-xl font-bold leading-none">{format(date, 'd')}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{ticket.events.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {format(date, 'h:mm a')}{endDate ? ` – ${format(endDate, 'h:mm a')}` : ''}
            </span>
            {ticket.events.location_name && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {ticket.events.location_name}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0">
          {isPast ? (
            checkedIn ? (
              <Badge variant="outline" className="border-green-500/50 text-green-500 text-xs">
                <Check className="w-3 h-3 mr-0.5" />Attended
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">Missed</Badge>
            )
          ) : (
            <Badge variant="outline" className="border-green-500/50 text-green-500 text-xs">
              <Ticket className="w-3 h-3 mr-0.5" />Going
            </Badge>
          )}
        </div>
      </Link>
    );
  };

  const EmptyState = ({ isPast }: { isPast: boolean }) => (
    <div className="text-center py-12">
      {isPast
        ? <History className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        : <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      }
      <h3 className="font-medium text-foreground mb-1">
        {isPast ? 'No past events yet' : 'No upcoming RSVPs'}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {isPast
          ? 'Your event history will appear here after you attend events.'
          : 'Browse events and RSVP to get started.'}
      </p>
      {!isPast && (
        <Button variant="outline" asChild>
          <Link href="/dashboard/browse-events">Browse Events <ArrowRight className="w-4 h-4 ml-1" /></Link>
        </Button>
      )}
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <DashboardNav />

      <main id="main-content" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 sm:py-8">

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold mb-1">My Events</h1>
            <p className="text-sm text-muted-foreground">
              {upcomingTickets.length} upcoming · {pastTickets.length} attended
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/browse-events">Browse Events <ArrowRight className="w-4 h-4 ml-1" /></Link>
          </Button>
        </div>

        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcomingTickets.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({pastTickets.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : upcomingTickets.length === 0 ? (
              <EmptyState isPast={false} />
            ) : (
              <div className="space-y-3">
                {upcomingTickets.map(t => renderTicketRow(t, false))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : pastTickets.length === 0 ? (
              <EmptyState isPast={true} />
            ) : (
              <div className="space-y-3">
                {pastTickets.map(t => renderTicketRow(t, true))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
