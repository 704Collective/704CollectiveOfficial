'use client';

import { useEffect, useState } from 'react';
import {
  createHashtagMonitor,
  deleteHashtagMonitor,
  getHashtagMonitors,
  getHashtagMentions,
} from '@/lib/social/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PlatformIcon } from '@/components/social/PlatformIcons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const PLATS = ['instagram', 'twitter', 'tiktok', 'linkedin'] as const;

export function HashtagMonitor({ workspaceId }: { workspaceId: string }) {
  const [monitors, setMonitors] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mentions, setMentions] = useState<Record<string, unknown>[]>([]);
  const [platFilter, setPlatFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [platPick, setPlatPick] = useState<Set<string>>(new Set(['instagram']));

  const load = async () => {
    setMonitors(await getHashtagMonitors(workspaceId));
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  useEffect(() => {
    if (!selected) {
      setMentions([]);
      return;
    }
    getHashtagMentions(selected, { limit: 50 }).then(setMentions);
  }, [selected]);

  const filteredMentions =
    platFilter === 'all' ? mentions : mentions.filter(m => m.platform === platFilter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">Hashtag monitor</h2>
        <Button type="button" className="btn-primary h-9" onClick={() => setOpen(true)}>
          Add hashtag
        </Button>
      </div>

      <p className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-muted/10">
        Mention monitoring uses public API access. Full firehose monitoring requires platform partnership agreements.
      </p>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-border rounded-xl divide-y divide-border bg-card">
          {monitors.map(m => (
            <div
              key={m.id as string}
              className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/20 ${selected === m.id ? 'bg-muted/30' : ''}`}
              onClick={() => setSelected(m.id as string)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{m.hashtag as string}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(m.platforms as string[]).map(p => (
                    <Badge key={p} variant="outline" className="text-[10px] gap-1">
                      <PlatformIcon platform={p} className="h-3 w-3" />
                      {p}
                    </Badge>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(m.total_mentions as number) ?? 0} mentions tracked
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive h-8 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  deleteHashtagMonitor(m.id as string).then(load);
                }}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>

        <div className="border border-border rounded-xl p-4 bg-card space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={platFilter === 'all' ? 'secondary' : 'ghost'} onClick={() => setPlatFilter('all')}>
              All
            </Button>
            {PLATS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatFilter(p)}
                className={`p-1.5 rounded-md border ${platFilter === p ? 'border-primary bg-primary/10' : 'border-transparent'}`}
              >
                <PlatformIcon platform={p} className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="space-y-3 max-h-[480px] overflow-y-auto">
            {filteredMentions.map(m => (
              <div key={m.id as string} className="border border-border rounded-lg p-3 flex gap-3">
                {m.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.media_url as string} alt="" className="w-16 h-16 object-cover rounded-md bg-muted shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-md bg-muted shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <PlatformIcon platform={m.platform as string} className="h-4 w-4" />
                    <p className="text-sm font-medium text-foreground">{m.author_name as string}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{m.content as string}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(m.posted_at as string), { addSuffix: true })} · ❤ {m.likes as number} · 💬{' '}
                    {m.comments as number}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>Add hashtag</DialogTitle>
          </DialogHeader>
          <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="#yourbrand" className="border-border bg-background" />
          <p className="text-xs text-muted-foreground">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {PLATS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setPlatPick(s => {
                    const n = new Set(s);
                    if (n.has(p)) n.delete(p);
                    else n.add(p);
                    return n;
                  })
                }
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                  platPick.has(p) ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                <PlatformIcon platform={p} className="h-3 w-3" />
                {p}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="btn-primary"
              onClick={async () => {
                if (!tag.trim()) return;
                try {
                  await createHashtagMonitor(workspaceId, tag.trim(), Array.from(platPick));
                  toast.success('Monitor added');
                  setOpen(false);
                  setTag('');
                  load();
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : 'Failed');
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
