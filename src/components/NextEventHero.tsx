'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { MapPin, Clock, Check, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

interface HeroEvent {
  id: string;
  title: string;
  start_time: string;
  location_name: string | null;
  image_url: string | null;
  isRsvpd: boolean;
}

interface NextEventHeroProps {
  userId: string;
  onEventLoaded?: (eventId: string | null) => void;
}

export function NextEventHero({ userId, onEventLoaded }: NextEventHeroProps) {
  const [event, setEvent] = useState<HeroEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNextEvent();
  }, [userId]);

  const fetchNextEvent = async () => {
    const now = new Date().toISOString();

    const { data: ticket } = await supabase
      .from('tickets')
      .select('event_id, events (id, title, start_time, location_name, image_url)')
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .gt('events.start_time', now)
      .order('start_time', { referencedTable: 'events', ascending: true })
      .limit(1)
      .maybeSingle();

    const ev = ticket?.events as unknown as { id: string; title: string; start_time: string; location_name: string | null; image_url: string | null } | null;

    if (ev && !Array.isArray(ticket?.events)) {
      setEvent({
        id: ev.id,
        title: ev.title,
        start_time: ev.start_time,
        location_name: ev.location_name,
        image_url: ev.image_url,
        isRsvpd: true,
      });
      onEventLoaded?.(ev.id);
      setLoading(false);
      return;
    }

    const { data: nextEvent } = await supabase
      .from('events')
      .select('id, title, start_time, location_name, image_url')
      .gt('start_time', now)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextEvent) {
      setEvent({
        ...nextEvent,
        isRsvpd: false,
      });
      onEventLoaded?.(nextEvent.id);
    } else {
      onEventLoaded?.(null);
    }
    setLoading(false);
  };

  if (loading) {
    return <Skeleton className="h-48 sm:h-56 w-full rounded-xl" />;
  }

  if (!event) {
    return (
      <div className="card-elevated p-8 text-center">
        <Calendar className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
        <h3 className="font-semibold mb-1">No upcoming events</h3>
        <p className="text-sm text-muted-foreground mb-4">Check back soon for new events.</p>
        <Button variant="outline" asChild>
          <Link href="/dashboard/events">Browse Events</Link>
        </Button>
      </div>
    );
  }

  const dateFormatted = format(new Date(event.start_time), 'EEEE, MMM d • h:mm a');

  return (
    <Link href={`/events/${event.id}`} className="block group">
      <div className="relative overflow-hidden rounded-2xl h-48 sm:h-56 border border-white/[0.10] shadow-none transition-all duration-300 ease-out group-hover:scale-[1.01] transform-gpu">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />

        <div className="relative h-full flex flex-col justify-end p-5 sm:p-6">
          <p className="text-xs uppercase tracking-wider text-white/60 font-medium mb-1">Next Up</p>
          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2 line-clamp-1">{event.title}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {dateFormatted}
            </span>
            {event.location_name && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event.location_name}
              </span>
            )}
          </div>
          <div className="mt-3">
            {event.isRsvpd ? (
              <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                <Check className="w-3 h-3 mr-1" />
                You're Going
              </Badge>
            ) : (
              <Button size="sm" variant="default" className="pointer-events-none">
                RSVP Now
              </Button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}