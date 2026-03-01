'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Users, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckInFullScreen } from '@/components/CheckInFullScreen';
import { supabase } from '@/integrations/supabase/client';

interface Event {
  id: string;
  title: string;
  start_time: string;
}

interface AdminCheckInProps {
  adminId: string;
}

export function AdminCheckIn({ adminId }: AdminCheckInProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [rsvpCount, setRsvpCount] = useState(0);
  const [checkInOpen, setCheckInOpen] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchRSVPCount();
    }
  }, [selectedEventId]);

  const fetchEvents = async () => {
    const { data } = await supabase
      .from('events')
      .select('id, title, start_time')
      .gte('start_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('start_time', { ascending: false });

    if (data) {
      const now = Date.now();
      data.sort((a, b) => 
        Math.abs(new Date(a.start_time).getTime() - now) - 
        Math.abs(new Date(b.start_time).getTime() - now)
      );
      setEvents(data);
      if (data.length > 0) {
        setSelectedEventId(data[0].id);
      }
    }
  };

  const fetchRSVPCount = async () => {
    const { count } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', selectedEventId)
      .eq('status', 'confirmed');

    setRsvpCount(count || 0);
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <>
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md mx-auto rounded-xl border border-border bg-card p-8 space-y-6">
          <h2 className="text-xl font-semibold text-center">Event Check-in</h2>

          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map(event => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title} - {format(new Date(event.start_time), 'MMM d, yyyy')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedEventId && (
            <>
              <p className="text-sm text-muted-foreground text-center flex items-center justify-center gap-2">
                <Users className="w-4 h-4" />
                {rsvpCount} RSVPs
              </p>

              <Button onClick={() => setCheckInOpen(true)} className="w-full" size="lg">
                <Play className="w-4 h-4 mr-2" />
                Start Check-in
              </Button>
            </>
          )}
        </div>
      </div>

      {selectedEvent && (
        <CheckInFullScreen
          open={checkInOpen}
          onClose={() => {
            setCheckInOpen(false);
            fetchRSVPCount();
          }}
          eventId={selectedEventId}
          eventTitle={selectedEvent.title}
          adminId={adminId}
        />
      )}
    </>
  );
}
