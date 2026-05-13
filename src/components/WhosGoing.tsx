'use client';

import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';

interface Attendee {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface WhosGoingProps {
  eventId: string;
}

function twoInitials(fullName: string | null): string {
  const t = fullName?.trim();
  if (!t) return 'M';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

export function WhosGoing({ eventId }: WhosGoingProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [publicCount, setPublicCount] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendees();
  }, [eventId]);

  const fetchAttendees = async () => {
    // Count all three sources in parallel.
    // members:   tickets (confirmed | rsvp) with a user_id
    // public:    event_public_rsvps (rsvp)        - non-member RSVPs
    // guests:    guest_passes (used)              - guests invited by members
    const [memberRes, publicRes, guestRes] = await Promise.all([
      supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('status', ['confirmed', 'rsvp'])
        .not('user_id', 'is', null),
      supabase
        .from('event_public_rsvps')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'rsvp'),
      supabase
        .from('guest_passes')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('status', 'used'),
    ]);

    const members = memberRes.count || 0;
    const publics = publicRes.count || 0;
    const guests = guestRes.count || 0;

    setMemberCount(members);
    setPublicCount(publics);
    setGuestCount(guests);

    // Avatar row only shows member faces - we don't have profile pictures for
    // anonymous public RSVPs or unnamed guest passes.
    const { data, error } = await supabase
      .from('tickets')
      .select(`
        user_id,
        profiles!tickets_user_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'rsvp'])
      .not('user_id', 'is', null)
      .limit(8);

    if (!error && data) {
      const attendeeList = data
        .filter(t => {
          const p = t.profiles as unknown as { id: string; full_name: string | null; avatar_url: string | null; deleted_at?: string | null } | null;
          return p && !p.deleted_at;
        })
        .map(t => {
          const p = t.profiles as unknown as { id: string; full_name: string | null; avatar_url: string | null };
          return {
            id: p.id,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
          };
        });
      setAttendees(attendeeList);
    }
    setLoading(false);
  };

  const containerStyle: React.CSSProperties = {
    backgroundColor: '#111',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '18px 20px',
    marginBottom: '16px',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-24 bg-muted rounded animate-pulse" />
          </div>
          <div className="flex -space-x-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-10 h-10 rounded-full bg-muted animate-pulse border-2 border-background" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const peopleGoing = memberCount + publicCount;

  if (peopleGoing === 0 && guestCount === 0) {
    return null;
  }

  // "+N" pill: how many people are NOT represented by an avatar.
  // = (member tickets we didn't fetch) + (all public RSVPs, which have no avatars)
  const remainingMembers = Math.max(0, memberCount - attendees.length);
  const totalNotShown = remainingMembers + publicCount;

  return (
    <div style={containerStyle}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="w-5 h-5" />
          <h3 className="font-semibold text-foreground">Who's Going</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          {peopleGoing} {peopleGoing === 1 ? 'person' : 'people'} going
          {guestCount > 0 && ` - ${guestCount} guest${guestCount === 1 ? '' : 's'}`}
        </p>

        <div className="flex items-center -space-x-2">
          {attendees.map((attendee) => (
            <Avatar
              key={attendee.id}
              className="w-10 h-10 border-2 border-background"
            >
              <AvatarImage src={attendee.avatar_url || undefined} alt={attendee.full_name || 'Member'} />
              <AvatarFallback
                className="text-sm font-semibold"
                style={getInitialsAvatarStyle(attendee.id)}
              >
                {twoInitials(attendee.full_name)}
              </AvatarFallback>
            </Avatar>
          ))}

          {totalNotShown > 0 && (
            <div className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
              <span className="text-xs font-medium text-muted-foreground">
                +{totalNotShown}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
