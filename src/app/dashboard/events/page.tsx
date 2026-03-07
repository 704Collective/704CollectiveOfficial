'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { supabase } from '@/integrations/supabase/client';

interface EventTicket {
  id: string;
  event_id: string;
  status: string;
  checked_in_at: string | null;
  events: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    location_name: string | null;
    image_url: string | null;
    is_members_only: boolean | null;
  };
}

export default function DashboardEventsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  usePageTitle('My Events');

  const [upcomingTickets, setUpcomingTickets] = useState<EventTicket[]>([]);
  const [pastTickets, setPastTickets] = useState<EventTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) fetchTickets();
  }, [user]);

  const fetchTickets = async () => {
    if (!user) return;

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
      .eq('user_id', user.id)
      .eq('status', 'confirmed');

    if (!error && data) {
      const now = new Date();
      const upcoming = (data as unknown as EventTicket[])
        .filter(t => t.events && new Date(t.events.start_time) > now)
        .sort((a, b) => new Date(a.events.start_time).getTime() - new Date(b.events.start_time).getTime());

      const past = (data as unknown as EventTicket[])
        .filter(t => t.events && new Date(t.events.start_time) <= now)
        .sort((a, b) => new Date(b.events.start_time).getTime() - new Date(a.events.start_time).getTime());

      setUpcomingTickets(upcoming);
      setPastTickets(past);
    }
    setLoading(false);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    );
  }

  const renderTicketRow = (ticket: EventTicket, isPast: boolean) => {
    const date = new Date(ticket.events.start_time);
    const endDate = new Date(ticket.events.end_time);
    const checkedIn = !!ticket.checked_in_at;

    return (
      <Link
        key={ticket.id}
        href={`/events/${ticket.event_id}`}
        className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-muted/30 transition-colors"
      >
        {/* Date block */}
        <div className="w-14 h-14 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {format(date, 'MMM')}
          </span>
          <span className="text-xl font-bold leading-none">{format(date, 'd')}</span>
        </div>

        {/* Event info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{ticket.events.title}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {format(date, 'h:mm a')} – {format(endDate, 'h:mm a')}
            </span>
            {ticket.events.location_name && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {ticket.events.location_name}
              </span>
            )}
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {isPast ? (
            checkedIn ? (
              <Badge variant="outline" className="border-green-500/50 text-green-500 text-xs">
                <Check className="w-3 h-3 mr-0.5" />
                Attended
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                Missed
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="border-green-500/50 text-green-500 text-xs">
              <Ticket className="w-3 h-3 mr-0.5" />
              Going
            </Badge>
          )}
        </div>
      </Link>
    );
  };

  const EmptyState = ({ isPast }: { isPast: boolean }) => (
    <div className="text-center py-12">
      {isPast ? (
        <History className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      ) : (
        <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
      )}
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
          <Link href="/dashboard/events">
            Browse Events
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <DashboardNav />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold mb-1">My Events</h1>
            <p className="text-sm text-muted-foreground">
              {upcomingTickets.length} upcoming · {pastTickets.length} attended
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/dashboard/events">
              Browse Events
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingTickets.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past ({pastTickets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
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
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
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