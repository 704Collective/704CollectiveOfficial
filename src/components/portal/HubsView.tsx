'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { HubCard, type HubData } from '@/components/portal/HubCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Search, LayoutGrid } from 'lucide-react';

interface HubRow {
  id: string;
  title: string;
  description: string | null;
  header_image_url: string | null;
  created_at: string;
  hub_members: { user_id: string }[];
}

export function HubsView() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const router = useRouter();
  const [hubs, setHubs] = useState<HubData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchHubs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('hubs')
        .select('id, title, description, header_image_url, created_at, hub_members(user_id)')
        .order('title', { ascending: true });

      // Non-admin users only see hubs they're a member of
      // RLS handles this automatically — members can only read hubs they're in
      const { data } = await query;

      setHubs(
        (data as HubRow[] ?? []).map((h) => ({
          ...h,
          member_count: h.hub_members?.length ?? 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchHubs(); }, [fetchHubs]);

  const filtered = hubs.filter((h) =>
    !search.trim() || h.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl font-bold text-white">Hubs</h1>
          <p className="mt-1 text-sm text-white/50">
            {loading ? '…' : `${filtered.length} hub${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-md sm:mx-0 sm:max-w-none sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search hubs…"
            className="pl-9 bg-[#2E2E2E] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#D4A853]/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl bg-[#2E2E2E]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <LayoutGrid className="h-12 w-12 text-white/10" />
          <p className="text-white/40 text-sm">
            {search ? 'No hubs match your search' : "You haven't been added to any hubs yet"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((hub) => (
            <HubCard
              key={hub.id}
              hub={hub}
              onClick={() => router.push(`/dashboard/hubs/${hub.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
