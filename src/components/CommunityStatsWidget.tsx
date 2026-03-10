'use client';

import { useEffect, useState } from 'react';
import { Users, Calendar, Ticket } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface CommunityStats {
  total_members: number;
  upcoming_events: number;
  total_rsvps: number;
}

export function CommunityStatsWidget() {
  const [stats, setStats] = useState<CommunityStats | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('get_community_stats').then(({ data }) => {
      if (data) setStats(data as CommunityStats);
    });
  }, []);

  if (!stats) return null;

  return (
    <div className="card-elevated p-4 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
        Our Community
      </p>
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="flex justify-center mb-1.5">
            <Users className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.total_members}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Members</p>
        </div>
        <div className="text-center">
          <div className="flex justify-center mb-1.5">
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.upcoming_events}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Upcoming Events</p>
        </div>
        <div className="text-center">
          <div className="flex justify-center mb-1.5">
            <Ticket className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold">{stats.total_rsvps}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">RSVPs</p>
        </div>
      </div>
    </div>
  );
}
