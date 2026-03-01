'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { AdminBroadcast } from '@/components/AdminBroadcast';
import { AddMemberDialog } from '@/components/admin/AddMemberDialog';
import { AddProspectDialog } from '@/components/admin/AddProspectDialog';
import { AddSponsorDialog } from '@/components/admin/AddSponsorDialog';
import { Calendar, Users, Plus, UserPlus, Target, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import type { AdminSection } from '@/components/AdminLayout';

interface RecentSignup {
  full_name: string | null;
  email: string;
  created_at: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  start_time: string;
  location_name: string | null;
}

interface OverviewData {
  eventCount: number;
  totalMembers: number;
  activeMembers: number;
  newThisWeek: number;
  recentSignups: RecentSignup[];
  upcomingEvents: UpcomingEvent[];
}

const STALE_TIME = 5 * 60 * 1000;

async function fetchOverviewData(): Promise<OverviewData> {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [eventsRes, totalRes, activeRes, newRes, signupsRes, upcomingRes] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('subscription_status', 'active').is('deleted_at', null),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', oneWeekAgo.toISOString()).is('deleted_at', null),
    supabase.from('profiles').select('full_name, email, created_at').is('deleted_at', null).order('created_at', { ascending: false }).limit(5),
    supabase.from('events').select('id, title, start_time, location_name').gte('start_time', new Date().toISOString()).order('start_time', { ascending: true }).limit(3),
  ]);

  return {
    eventCount: eventsRes.count || 0,
    totalMembers: totalRes.count || 0,
    activeMembers: activeRes.count || 0,
    newThisWeek: newRes.count || 0,
    recentSignups: (signupsRes.data || []) as RecentSignup[],
    upcomingEvents: (upcomingRes.data || []) as UpcomingEvent[],
  };
}

interface AdminOverviewTabProps {
  onSectionChange: (section: AdminSection) => void;
  onFilterChange: (filter: string) => void;
}

export function AdminOverviewTab({ onSectionChange, onFilterChange }: AdminOverviewTabProps) {
  const queryClient = useQueryClient();
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [addProspectDialogOpen, setAddProspectDialogOpen] = useState(false);
  const [addSponsorDialogOpen, setAddSponsorDialogOpen] = useState(false);

  const invalidateOverview = () => queryClient.invalidateQueries({ queryKey: ['admin-overview'] });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: fetchOverviewData,
    staleTime: STALE_TIME,
  });

  const { eventCount = 0, totalMembers = 0, activeMembers = 0, newThisWeek = 0, recentSignups = [], upcomingEvents = [] } = data ?? {};

  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive mb-2">Failed to load dashboard data.</p>
        <Button variant="outline" size="sm" onClick={() => invalidateOverview()}>Retry</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Overview</p>
          <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Welcome back. Here's an overview of your community.</p>
        </div>
        <AdminBroadcast />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSectionChange('events')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Events</p>
                <p className="text-2xl font-semibold mt-1">{eventCount}</p>
              </div>
              <Calendar className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSectionChange('members')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Members</p>
                <p className="text-2xl font-semibold mt-1">{totalMembers}</p>
              </div>
              <Users className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { onFilterChange('active'); onSectionChange('members'); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Active Members</p>
                <p className="text-2xl font-semibold mt-1 text-green-500">{activeMembers}</p>
              </div>
              <Users className="w-4 h-4 text-green-500" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { onFilterChange('recent'); onSectionChange('members'); }}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">New This Week</p>
                <p className="text-2xl font-semibold mt-1">{newThisWeek}</p>
              </div>
              <Plus className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Quick Actions</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="flex items-center gap-2" onClick={() => setAddMemberDialogOpen(true)}>
            <UserPlus className="w-4 h-4" aria-hidden="true" /> Add Member
          </Button>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => setAddProspectDialogOpen(true)}>
            <Target className="w-4 h-4" aria-hidden="true" /> Add Prospect
          </Button>
          <Button variant="outline" className="flex items-center gap-2" onClick={() => setAddSponsorDialogOpen(true)}>
            <Building2 className="w-4 h-4" aria-hidden="true" /> Add Sponsor/Vendor
          </Button>
        </div>
      </div>

      {/* Recent Signups & Upcoming Events */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Recent Signups</p>
            {recentSignups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent signups</p>
            ) : (
              <div className="divide-y divide-border">
                {recentSignups.map((s, i) => (
                  <div key={i} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.full_name || 'No name'}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(s.created_at), 'MMM d')}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Upcoming Events</p>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming events</p>
            ) : (
              <div className="divide-y divide-border">
                {upcomingEvents.map((e) => (
                  <div key={e.id} className="py-2 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{e.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{format(new Date(e.start_time), 'MMM d, h:mm a')}</p>
                      {e.location_name && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <p className="text-xs text-muted-foreground truncate">{e.location_name}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <AddMemberDialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen} onSuccess={invalidateOverview} />
      <AddProspectDialog open={addProspectDialogOpen} onOpenChange={setAddProspectDialogOpen} />
      <AddSponsorDialog open={addSponsorDialogOpen} onOpenChange={setAddSponsorDialogOpen} />
    </div>
  );
}
