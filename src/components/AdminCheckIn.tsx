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
import { resolvePersonId } from '@/lib/identity/resolvePerson';
import { toast } from 'sonner';

type AttendeeRow = {
  id: string; // attendance_credentials id
  credential_type: string;
  person_id: string;
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

    // Canonical roster: attendance_credentials + people, mirroring CheckInFullScreen.
    const { data: creds, error: credErr } = await supabase
      .from('attendance_credentials')
      .select('id, person_id, credential_type, checked_in_at')
      .eq('event_id', selectedEventId)
      .in('credential_type', ['member_rsvp', 'guest_pass', 'public_rsvp'])
      .in('status', ['active', 'used']);

    if (credErr || !creds) {
      setAttendees([]);
      return;
    }

    const personIds = Array.from(new Set(creds.map(c => c.person_id).filter(Boolean)));
    const peopleById: Record<string, { full_name: string | null; email: string | null }> = {};
    if (personIds.length > 0) {
      const { data: people } = await supabase
        .from('people')
        .select('id, full_name, email')
        .in('id', personIds);
      for (const p of (people || [])) {
        peopleById[p.id] = { full_name: p.full_name, email: p.email };
      }
    }

    const merged: AttendeeRow[] = creds.map(c => {
      const p = peopleById[c.person_id];
      return {
        id: c.id,
        credential_type: c.credential_type,
        person_id: c.person_id,
        full_name: p?.full_name || 'Unknown',
        email: p?.email || '',
        avatar_url: null,
        checked_in_at: c.checked_in_at,
      };
    }).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    setAttendees(merged);
  }, [selectedEventId]);

  const handleQuickCheckIn = async (attendee: AttendeeRow) => {
    if (attendee.checked_in_at) {
      toast.info(`${attendee.full_name} is already checked in`, {
        description: `Checked in at ${format(new Date(attendee.checked_in_at), 'h:mm a')}`,
      });
      return;
    }

    setCheckInLoadingId(attendee.id);

    // Stamp the canonical attendance_credential, mirroring CheckInFullScreen.
    const { error } = await supabase
      .from('attendance_credentials')
      .update({ checked_in_at: new Date().toISOString(), status: 'used' })
      .eq('id', attendee.id);

    setCheckInLoadingId(null);

    if (error) {
      toast.error('Check-in failed');
      return;
    }

    // checked_in_by expects a people id; adminId is an auth user id. The shared
    // resolver answers that question the same way everywhere: auth_user_id column
    // first, the legacy metadata.profile_id sticky note only as a fallback.
    // Best-effort, same as CheckInFullScreen - check-in already recorded above.
    try {
      const { personId: adminPersonId } = await resolvePersonId(adminId);
      if (adminPersonId) {
        await supabase
          .from('attendance_credentials')
          .update({ checked_in_by: adminPersonId })
          .eq('id', attendee.id);
      }
    } catch {
      // non-fatal - check-in already recorded
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
                  key={a.id}
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
                        {a.credential_type === 'public_rsvp' && (
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
