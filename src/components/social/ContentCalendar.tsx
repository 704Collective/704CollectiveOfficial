'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { deleteSocialPost, getContentCalendar, updateSocialPost } from '@/lib/social/queries';
import { PlatformIcon } from '@/components/social/PlatformIcons';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { SocialPostRow } from '@/lib/social/types';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

export function ContentCalendar({
  workspaceId,
  accountById,
  onEditPost,
  onNewPost,
}: {
  workspaceId: string;
  accountById: Map<string, { platform: string }>;
  onEditPost: (p: SocialPostRow) => void;
  onNewPost: (isoDay: string) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [view, setView] = useState<'month' | 'week'>('month');
  const [byDay, setByDay] = useState<Record<string, SocialPostRow[]>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [platFilter, setPlatFilter] = useState<Set<string>>(new Set());
  const [scheduledOnly, setScheduledOnly] = useState(false);

  const load = useCallback(async () => {
    const start = view === 'month' ? startOfMonth(cursor) : startOfWeek(cursor, { weekStartsOn: 0 });
    const end = view === 'month' ? endOfMonth(cursor) : endOfWeek(cursor, { weekStartsOn: 0 });
    const data = await getContentCalendar(workspaceId, start.toISOString(), end.toISOString());
    setByDay(data);
  }, [workspaceId, cursor, view]);

  useEffect(() => {
    load();
  }, [load]);

  const filterPosts = (posts: SocialPostRow[]) =>
    posts.filter(p => {
      if (scheduledOnly && p.status !== 'scheduled') return false;
      if (platFilter.size === 0) return true;
      return (p.target_account_ids ?? []).some(id => {
        const a = accountById.get(id);
        return a && platFilter.has(a.platform);
      });
    });

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const postId = result.draggableId;
    const destDay = result.destination.droppableId;
    const nextStart = new Date(destDay + 'T12:00:00');
    try {
      await updateSocialPost(postId, {
        scheduled_at: nextStart.toISOString(),
        status: 'scheduled',
      });
      toast.success('Post rescheduled');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Reschedule failed');
    }
  };

  const togglePlat = (p: string) => {
    setPlatFilter(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const platforms = useMemo(() => Array.from(new Set(Array.from(accountById.values()).map(a => a.platform))), [accountById]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, -1))}>
            Prev
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setCursor(addMonths(cursor, 1))}>
            Next
          </Button>
          <span className="text-sm font-medium text-foreground ml-2">
            {view === 'month' ? format(cursor, 'MMMM yyyy') : `Week of ${format(weekDays[0], 'MMM d, yyyy')}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant={view === 'month' ? 'secondary' : 'ghost'} onClick={() => setView('month')}>
            Month
          </Button>
          <Button type="button" size="sm" variant={view === 'week' ? 'secondary' : 'ghost'} onClick={() => setView('week')}>
            Week
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border border-border rounded-lg p-3 bg-card">
        <div className="flex items-center gap-2">
          <Switch id="sched-only" checked={scheduledOnly} onCheckedChange={setScheduledOnly} />
          <Label htmlFor="sched-only" className="text-xs text-muted-foreground">
            Scheduled only
          </Label>
        </div>
        <div className="flex flex-wrap gap-2">
          {platforms.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlat(p)}
              className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                platFilter.size === 0 || platFilter.has(p) ? 'border-primary bg-primary/10' : 'border-border opacity-50'
              }`}
            >
              <PlatformIcon platform={p} className="h-3 w-3" />
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {view === 'month' ? (
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground uppercase">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
            {monthDays.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const inMonth = isSameMonth(day, cursor);
              const posts = filterPosts(byDay[key] ?? []);
              return (
                <div
                  key={key}
                  className={`min-h-[88px] border border-border rounded-md p-1 text-left ${
                    inMonth ? 'bg-card' : 'bg-muted/20 opacity-60'
                  } ${selectedDay === key ? 'ring-1 ring-ring' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      className="text-xs font-medium text-foreground"
                      onClick={() => setSelectedDay(key)}
                    >
                      {format(day, 'd')}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      aria-label="New post"
                      onClick={() => onNewPost(key)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {posts.slice(0, 4).map(p => (
                      <span key={p.id} title={p.caption}>
                        {(p.target_account_ids ?? []).slice(0, 3).map(id => {
                          const pl = accountById.get(id)?.platform ?? 'twitter';
                          return <PlatformIcon key={id} platform={pl} className="h-3 w-3" />;
                        })}
                      </span>
                    ))}
                    {posts.length > 4 && (
                      <span className="text-[9px] text-muted-foreground">+{posts.length - 4}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const posts = filterPosts(byDay[key] ?? []);
                return (
                  <Droppable droppableId={key} key={key}>
                    {prov => (
                      <div
                        ref={prov.innerRef}
                        {...prov.droppableProps}
                        className="border border-border rounded-lg bg-card min-h-[200px] p-2 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-foreground">{format(day, 'EEE d')}</p>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onNewPost(key)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {posts.map((p, idx) => (
                          <Draggable draggableId={p.id} index={idx} key={p.id}>
                            {dp => (
                              <div
                                ref={dp.innerRef}
                                {...dp.draggableProps}
                                {...dp.dragHandleProps}
                                className="border border-border rounded-md p-2 bg-muted/20 text-xs space-y-1"
                              >
                                <div className="flex gap-1">
                                  {(p.target_account_ids ?? []).map(id => (
                                    <PlatformIcon
                                      key={id}
                                      platform={accountById.get(id)?.platform ?? 'twitter'}
                                      className="h-3 w-3"
                                    />
                                  ))}
                                </div>
                                <p className="line-clamp-2 text-muted-foreground">{p.caption}</p>
                                <Badge variant="outline" className="text-[10px]">
                                  {p.status}
                                </Badge>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {prov.placeholder}
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </DragDropContext>
        )}

        <div className="border border-border rounded-lg p-3 bg-card h-fit space-y-3">
          <p className="text-sm font-medium text-foreground">
            {selectedDay ? `Posts on ${selectedDay}` : 'Select a day'}
          </p>
          {selectedDay &&
            filterPosts(byDay[selectedDay] ?? []).map(p => (
              <div key={p.id} className="border border-border rounded-md p-2 space-y-2">
                <div className="flex gap-1">
                  {(p.target_account_ids ?? []).map(id => (
                    <PlatformIcon key={id} platform={accountById.get(id)?.platform ?? 'twitter'} className="h-4 w-4" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{p.caption}</p>
                <div className="flex gap-2 flex-wrap">
                  <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={() => onEditPost(p)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={async () => {
                      if (!confirm('Delete this post?')) return;
                      try {
                        await deleteSocialPost(p.id);
                        toast.success('Deleted');
                        load();
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : 'Delete failed');
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
