'use client';

import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  const { user, isActiveMember, isAdmin, isSuperAdmin, loading: authLoading } = useAuth();

  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [publicCount, setPublicCount] = useState(0);
  const [guestCount, setGuestCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const allowed = !!user && (isActiveMember || isAdmin || isSuperAdmin);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setLoading(false);
      return;
    }

    if (!allowed) {
      setLoading(false);
      return;
    }

    fetchAttendees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, user, isActiveMember, isAdmin, isSuperAdmin, authLoading]);

  const fetchAttendees = async () => {
    try {
      const { data, error } = await supabase.rpc('get_event_attendees', { p_event_id: eventId });

      if (error) {
        // Permission denied / not authenticated - silently hide widget.
        // The SECURITY DEFINER RPC raises a friendly exception for non-members;
        // we don't want that surfaced as a console error.
        setLoading(false);
        return;
      }

      const result = data as {
        member_count: number | string | null;
        public_count: number | string | null;
        guest_count: number | string | null;
        total_count: number | string | null;
        attendees: Attendee[] | null;
      };

      setMemberCount(Number(result?.member_count || 0));
      setPublicCount(Number(result?.public_count || 0));
      setGuestCount(Number(result?.guest_count || 0));
      setTotalCount(Number(result?.total_count || 0));
      setAttendees(Array.isArray(result?.attendees) ? result.attendees : []);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    backgroundColor: '#111',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '18px 20px',
    marginBottom: '16px',
  };

  // Gate: widget never renders for logged-out or non-eligible users.
  // The server-side RPC also enforces this, but bailing here avoids a
  // round-trip and avoids flashing the skeleton.
  if (!allowed) {
    return null;
  }

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

  if (totalCount === 0 && guestCount === 0) {
    return null;
  }

  // "+N" pill: people NOT represented by an avatar.
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
          {totalCount} {totalCount === 1 ? 'person' : 'people'} going
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
