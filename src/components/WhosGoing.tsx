'use client';

import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Attendee {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface WhosGoingProps {
  eventId: string;
}

export function WhosGoing({ eventId }: WhosGoingProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttendees();
  }, [eventId]);

  const fetchAttendees = async () => {
    // Get count first
    const { count } = await supabase
      .from('tickets')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .not('user_id', 'is', null);

    setTotalCount(count || 0);

    // Get first 8 attendees with profile info
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
      .eq('status', 'confirmed')
      .not('user_id', 'is', null)
      .limit(8);

    if (!error && data) {
      const attendeeList = data
        .filter(t => {
          const p = t.profiles as { id: string; full_name: string | null; avatar_url: string | null; deleted_at?: string | null } | null;
          return p && !p.deleted_at;
        })
        .map(t => {
          const p = t.profiles as { id: string; full_name: string | null; avatar_url: string | null };
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

  if (loading) {
    return (
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
    );
  }

  if (totalCount === 0) {
    return null;
  }

  const remainingCount = totalCount - attendees.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Users className="w-5 h-5" />
        <h3 className="font-semibold text-foreground">Who's Going</h3>
      </div>
      
      <p className="text-sm text-muted-foreground">
        {totalCount} member{totalCount !== 1 ? 's' : ''} registered
      </p>
      
      <div className="flex items-center -space-x-2">
        {attendees.map((attendee) => (
          <Avatar 
            key={attendee.id} 
            className="w-10 h-10 border-2 border-background"
          >
            <AvatarImage src={attendee.avatar_url || undefined} alt={attendee.full_name || 'Member'} />
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {(attendee.full_name || 'M').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
        
        {remainingCount > 0 && (
          <div className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground">
              +{remainingCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
