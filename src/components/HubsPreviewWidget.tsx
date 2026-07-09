'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Hub {
  id: string;
  title: string;
  description: string | null;
  member_count?: number;
}

interface HubsPreviewWidgetProps {
  userId: string;
}

export function HubsPreviewWidget({ userId }: HubsPreviewWidgetProps) {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('hubs')
        .select('id, title, description')
        .limit(3);
      if (error) Sentry.captureException(error);
      if (cancelled) return;
      setHubs((data ?? []) as Hub[]);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Hubs</p>
        </div>
        <Button variant="ghost" size="sm" asChild className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Link href="/dashboard/hubs">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : hubs.length === 0 ? (
        <div className="card-elevated p-4 text-center">
          <p className="text-sm text-muted-foreground">No hubs available yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {hubs.map(hub => (
            <Link
              key={hub.id}
              href={`/dashboard/hubs/${hub.id}`}
              className="block card-elevated p-3 hover:bg-accent/30 transition-colors rounded-xl"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{hub.title}</p>
                  {hub.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{hub.description}</p>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
          <Button variant="outline" size="sm" asChild className="w-full gap-1.5 text-xs mt-1">
            <Link href="/dashboard/hubs">
              <Users className="w-3.5 h-3.5" />
              Browse All Hubs
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
