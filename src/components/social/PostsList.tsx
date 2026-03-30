'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocialPosts, deleteSocialPost, updateSocialPost } from '@/lib/social/queries';
import { PlatformIcon } from '@/components/social/PlatformIcons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import type { SocialPostRow } from '@/lib/social/types';
import { format } from 'date-fns';
import { LayoutGrid, List, Search } from 'lucide-react';
import { toast } from 'sonner';

export function PostsList({
  workspaceId,
  accountById,
  onEdit,
}: {
  workspaceId: string;
  accountById: Map<string, { platform: string }>;
  onEdit: (p: SocialPostRow) => void;
}) {
  const [posts, setPosts] = useState<(SocialPostRow & { metrics?: unknown[] })[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [grid, setGrid] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const data = await getSocialPosts(workspaceId, {
      status: status === 'all' ? 'all' : (status as 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'),
      search,
      limit: 100,
    });
    setPosts(data as (SocialPostRow & { metrics?: unknown[] })[]);
  }, [workspaceId, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setSel(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const bulkCancel = async () => {
    for (const id of sel) {
      await updateSocialPost(id, { status: 'cancelled' });
    }
    toast.success('Cancelled selected');
    setSel(new Set());
    load();
  };

  const bulkDelete = async () => {
    for (const id of sel) {
      await deleteSocialPost(id);
    }
    toast.success('Deleted selected');
    setSel(new Set());
    load();
  };

  const engagement = (p: SocialPostRow & { metrics?: { likes?: number; comments?: number; reach?: number }[] | unknown[] }) => {
    const m = (p.metrics ?? []) as { likes?: number; comments?: number; reach?: number }[];
    const likes = m.reduce((s, x) => s + (x.likes ?? 0), 0);
    const comments = m.reduce((s, x) => s + (x.comments ?? 0), 0);
    const reach = m.reduce((s, x) => s + (x.reach ?? 0), 0);
    return { likes, comments, reach };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {(['all', 'draft', 'scheduled', 'published', 'failed', 'cancelled'] as const).map(s => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={status === s ? 'secondary' : 'ghost'}
            className="capitalize h-8 text-xs"
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
        <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search captions…"
            className="pl-8 h-8 text-xs border-border bg-background"
          />
        </div>
        <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => setGrid(g => !g)}>
          {grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
        </Button>
      </div>

      {sel.size > 0 && (
        <div className="flex gap-2 border border-border rounded-lg p-2 bg-muted/20">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={bulkCancel}>
            Bulk cancel
          </Button>
          <Button type="button" size="sm" variant="destructive" className="h-8 text-xs" onClick={bulkDelete}>
            Bulk delete
          </Button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-xl p-8 text-center">
          No posts for this filter.
        </p>
      ) : grid ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {posts.map(p => {
            const e = engagement(p);
            return (
              <div key={p.id} className="border border-border rounded-xl p-3 bg-card space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <Checkbox checked={sel.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                  <div className="flex gap-1 flex-wrap justify-end">
                    {(p.target_account_ids ?? []).map(id => (
                      <PlatformIcon key={id} platform={accountById.get(id)?.platform ?? 'twitter'} className="h-4 w-4" />
                    ))}
                  </div>
                </div>
                {p.media_urls?.[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.media_urls[0]} alt="" className="w-full h-28 object-cover rounded-md bg-muted" />
                )}
                <p className="text-xs text-muted-foreground line-clamp-3">{p.caption}</p>
                <Badge variant="outline" className="text-[10px]">
                  {p.status}
                </Badge>
                {p.status === 'published' && (
                  <p className="text-[10px] text-muted-foreground">
                    ❤ {e.likes} · 💬 {e.comments} · reach {e.reach}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onEdit(p)}>
                    Edit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="p-2 w-8" />
                <th className="p-2">Platforms</th>
                <th className="p-2">Caption</th>
                <th className="p-2">Status</th>
                <th className="p-2">When</th>
                <th className="p-2">Engagement</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => {
                const e = engagement(p);
                const when = p.scheduled_at || p.published_at || p.created_at;
                return (
                  <tr key={p.id} className="border-b border-border hover:bg-muted/10">
                    <td className="p-2">
                      <Checkbox checked={sel.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {(p.target_account_ids ?? []).map(id => (
                          <PlatformIcon key={id} platform={accountById.get(id)?.platform ?? 'twitter'} className="h-4 w-4" />
                        ))}
                      </div>
                    </td>
                    <td className="p-2 max-w-[240px]">
                      <p className="truncate text-xs text-foreground">{p.caption.slice(0, 100)}</p>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {p.status}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] ml-1 capitalize">
                        {p.approval_status}
                      </Badge>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">
                      {when ? format(new Date(when), 'MMM d, h:mm a') : '—'}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {p.status === 'published' ? `${e.likes} / ${e.reach}` : '—'}
                    </td>
                    <td className="p-2 text-right space-x-1">
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onEdit(p)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
