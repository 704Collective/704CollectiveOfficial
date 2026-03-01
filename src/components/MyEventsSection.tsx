'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, Check, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
    location_name: string | null;
    image_url: string | null;
  };
}

interface MyEventsSectionProps {
  userId: string;
  excludeEventId?: string | null;
}

export function MyEventsSection({ userId, excludeEventId }: MyEventsSectionProps) {
  const [upcomingTickets, setUpcomingTickets] = useState<EventTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendedCount, setAttendedCount] = useState(0);

  useEffect(() => {
    fetchTickets();
  }, [userId]);

  const fetchTickets = async () => {
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
          location_name,
          image_url
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'confirmed');

    if (!error && data) {
      const now = new Date();
      const upcoming = data.filter(t => t.events && new Date(t.events.start_time) > now) as EventTicket[];
      upcoming.sort((a, b) => new Date(a.events.start_time).getTime() - new Date(b.events.start_time).getTime());
      const past = data.filter(t => t.events && new Date(t.events.start_time) <= now) as EventTicket[];
      const attended = past.filter(t => t.checked_in_at).length;

      setUpcomingTickets(upcoming);
      setAttendedCount(attended);
    }
    setLoading(false);
  };

  // Filter out hero event
  const displayTickets = excludeEventId
    ? upcomingTickets.filter(t => t.event_id !== excludeEventId)
    : upcomingTickets;

  const visibleTickets = displayTickets.slice(0, 4);

  if (loading) {
    return (
      <div className="card-elevated p-4 sm:p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Skeleton className="w-12 h-12 rounded-lg" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-14" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="card-elevated p-4 sm:p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Upcoming Events ({displayTickets.length})
        </h3>
        {attendedCount > 0 && (
          <span className="text-xs text-muted-foreground">{attendedCount} attended</span>
        )}
      </div>

      {visibleTickets.length === 0 ? (
        <div className="text-center py-6">
          <Calendar className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No upcoming RSVPs</p>
          <Link href="/events" className="text-sm text-primary hover:underline">
            Browse Events →
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {visibleTickets.map(ticket => {
            const date = new Date(ticket.events.start_time);
            return (
              <Link
                key={ticket.id}
                href={`/events/${ticket.event_id}`}
                className="flex items-center gap-3 py-3 hover:bg-muted/50 -mx-2 px-2 rounded-lg transition-colors"
              >
                {/* Date badge */}
                <div className="w-12 h-12 rounded-lg bg-muted flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {format(date, 'MMM')}
                  </span>
                  <span className="text-lg font-bold leading-none">{format(date, 'd')}</span>
                </div>
                {/* Event info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ticket.events.title}</p>
                  <p className="text-xs text-muted-foreground">{format(date, 'h:mm a')}</p>
                </div>
                {/* Status */}
                <Badge variant="outline" className="border-green-500/50 text-green-500 text-xs shrink-0">
                  <Check className="w-3 h-3 mr-0.5" />
                  Going
                </Badge>
              </Link>
            );
          })}
        </div>
      )}

      <Link href="/events"
        className="flex items-center justify-center gap-1 text-sm text-primary hover:underline pt-3 mt-1 border-t border-border"
      >
        View All Events
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
