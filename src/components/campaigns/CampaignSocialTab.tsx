'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PlatformIcon } from '@/components/social/PlatformIcons';
import { Badge } from '@/components/ui/badge';

interface SocialPostLite {
  id: string;
  caption: string;
  status: string;
  published_at: string | null;
  scheduled_at: string | null;
  target_account_ids: string[];
}

export function CampaignSocialTab({ campaignId }: { campaignId: string }) {
  const [posts, setPosts] = useState<SocialPostLite[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; platform: string; account_name: string }[]>([]);
  const [totals, setTotals] = useState({ reach: 0, likes: 0, comments: 0, clicks: 0 });

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from('social_posts').select('*').eq('campaign_id', campaignId);
      setPosts((p ?? []) as SocialPostLite[]);
      const { data: a } = await supabase.from('social_accounts').select('id, platform, account_name');
      setAccounts(a ?? []);
      const ids = (p ?? []).map(x => x.id);
      if (ids.length) {
        const { data: m } = await supabase.from('social_post_metrics').select('*').in('post_id', ids);
        let reach = 0;
        let likes = 0;
        let comments = 0;
        let clicks = 0;
        for (const row of m ?? []) {
          reach += row.reach ?? 0;
          likes += row.likes ?? 0;
          comments += row.comments ?? 0;
          clicks += row.clicks ?? 0;
        }
        setTotals({ reach, likes, comments, clicks });
      } else {
        setTotals({ reach: 0, likes: 0, comments: 0, clicks: 0 });
      }
    })();
  }, [campaignId]);

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total reach', value: totals.reach.toLocaleString() },
          { label: 'Engagements', value: (totals.likes + totals.comments).toLocaleString() },
          { label: 'Clicks', value: totals.clicks.toLocaleString() },
          { label: 'Social posts', value: String(posts.length) },
        ].map(k => (
          <div key={k.label} className="border border-border rounded-xl p-4 bg-card">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-lg font-semibold text-foreground mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Linked social posts</p>
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-6 text-center">
            No social posts linked yet. Create a post in Social and set this email campaign as the campaign.
          </p>
        ) : (
          posts.map(p => (
            <div key={p.id} className="border border-border rounded-xl p-4 bg-card flex gap-3 flex-wrap">
              <div className="flex gap-1">
                {(p.target_account_ids ?? []).map(id => (
                  <PlatformIcon key={id} platform={accountMap.get(id)?.platform ?? 'twitter'} className="h-5 w-5" />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground line-clamp-2">{p.caption}</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {p.status}
                  </Badge>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
