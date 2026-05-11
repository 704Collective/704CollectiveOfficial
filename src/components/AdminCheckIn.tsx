'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { toast } from 'sonner';

type AttendeeRow = {
  id: string;
  source: 'ticket' | 'public_rsvp';
  user_id: string | null;
  ticket_type: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  checked_in_at: string | null;
};

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
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInLoadingId, setCheckInLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchAttendees();
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

  const fetchAttendees = useCallback(async () => {
    if (!selectedEventId) return;

    const [ticketsResult, publicRsvpsResult] = await Promise.all([
      supabase
        .from('tickets')
        .select(`
          id,
          user_id,
          checked_in_at,
          ticket_type,
          guest_email,
          guest_name,
          profiles!tickets_user_id_fkey (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('event_id', selectedEventId)
        .in('status', ['confirmed', 'rsvp']),
      supabase
        .from('event_public_rsvps')
        .select('id, first_name, last_name, email, phone, checked_in_at, status')
        .eq('event_id', selectedEventId)
        .eq('status', 'rsvp'),
    ]);

    type ProfileJoin = { id: string; email: string; full_name: string | null; avatar_url: string | null } | null;

    const ticketAttendees: AttendeeRow[] = (ticketsResult.data || []).map(t => {
      const p = t.profiles as unknown as ProfileJoin;
      return {
        id: t.id,
        source: 'ticket' as const,
        user_id: t.user_id,
        ticket_type: t.ticket_type,
        full_name: p?.full_name || t.guest_name || 'Unknown',
        email: p?.email || t.guest_email || '',
        avatar_url: p?.avatar_url || null,
        checked_in_at: t.checked_in_at,
      };
    });

    const publicRsvpAttendees: AttendeeRow[] = (publicRsvpsResult.data || []).map(r => ({
      id: r.id,
      source: 'public_rsvp' as const,
      user_id: null,
      ticket_type: 'public_free',
      full_name: `${r.first_name} ${r.last_name}`.trim(),
      email: r.email,
      avatar_url: null,
      checked_in_at: r.checked_in_at,
    }));

    const merged = [...ticketAttendees, ...publicRsvpAttendees].sort((a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '')
    );

    setAttendees(merged);
  }, [selectedEventId]);

  const handleQuickCheckIn = async (attendee: AttendeeRow) => {
    setCheckInLoadingId(attendee.id);
    const now = new Date().toISOString();
    const updatePayload = { checked_in_at: now, checked_in_by: adminId };

    const result = attendee.source === 'public_rsvp'
      ? await supabase.from('event_public_rsvps').update(updatePayload).eq('id', attendee.id)
      : await supabase.from('tickets').update(updatePayload).eq('id', attendee.id);

    setCheckInLoadingId(null);

    if (result.error) {
      toast.error('Check-in failed');
      return;
    }

    toast.success(`${attendee.full_name} checked in`);
    await fetchAttendees();
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const totalCount = attendees.length;
  const checkedInCount = attendees.filter(a => a.checked_in_at).length;

  return (
    <>
      <div style={{ padding: '0 16px' }}>
        <div className="w-full max-w-lg mx-auto rounded-xl border border-border bg-card p-8 space-y-6">
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
                {totalCount} RSVPs &nbsp;·&nbsp; {checkedInCount} / {totalCount} checked in
              </p>

              <Button onClick={() => setCheckInOpen(true)} className="w-full" size="lg">
                <Play className="w-4 h-4 mr-2" />
                Start Check-in (QR Scanner)
              </Button>
            </>
          )}
        </div>

        {attendees.length > 0 && (
          <div style={{ maxWidth: '512px', margin: '24px auto 0' }}>
            <h3 style={{
              fontSize: '0.875rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px',
            }}>
              Attendees
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {attendees.map((a) => (
                <div
                  key={`${a.source}-${a.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 16px', backgroundColor: '#111',
                    border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      backgroundColor: 'rgba(255,255,255,0.08)', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.7)',
                    }}>
                      {(a.full_name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        fontSize: '0.9375rem', fontWeight: 600, color: '#FFF',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {a.full_name}
                      </div>
                      <div style={{
                        fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {a.email}
                        {a.source === 'public_rsvp' && (
                          <span style={{
                            marginLeft: '8px', padding: '2px 8px', borderRadius: '4px',
                            backgroundColor: 'rgba(198,166,100,0.1)', color: '#C6A664',
                            fontSize: '0.6875rem', fontWeight: 600,
                          }}>
                            Public RSVP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: '12px' }}>
                    {a.checked_in_at ? (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4CAF50' }}>
                        ✓ Checked in
                      </span>
                    ) : (
                      <button
                        onClick={() => handleQuickCheckIn(a)}
                        disabled={checkInLoadingId === a.id}
                        style={{
                          padding: '6px 14px', backgroundColor: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px',
                          color: '#FFF', fontSize: '0.75rem', fontWeight: 600,
                          cursor: checkInLoadingId === a.id ? 'default' : 'pointer',
                          opacity: checkInLoadingId === a.id ? 0.5 : 1,
                        }}
                      >
                        {checkInLoadingId === a.id ? '…' : 'Check in'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedEvent && (
        <CheckInFullScreen
          open={checkInOpen}
          onClose={() => {
            setCheckInOpen(false);
            fetchAttendees();
          }}
          eventId={selectedEventId}
          eventTitle={selectedEvent.title}
          adminId={adminId}
        />
      )}
    </>
  );
}
