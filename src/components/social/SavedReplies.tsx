'use client';

import { useEffect, useState } from 'react';
import { createSavedReply, deleteSavedReply, getSavedReplies, updateSavedReply } from '@/lib/social/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function SavedReplies({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');

  const load = async () => setItems(await getSavedReplies(workspaceId));

  useEffect(() => {
    load();
  }, [workspaceId]);

  const filtered = items.filter(t => {
    const n = (t.name as string).toLowerCase();
    const c = (t.content as string).toLowerCase();
    const q = search.toLowerCase();
    const okCat = !cat || (t.category as string) === cat;
    return okCat && (n.includes(q) || c.includes(q));
  });

  const categories = Array.from(new Set(items.map(t => t.category as string | null).filter(Boolean))) as string[];

  const openNew = () => {
    setEdit(null);
    setName('');
    setCategory('');
    setContent('');
    setOpen(true);
  };

  const openEdit = (t: Record<string, unknown>) => {
    setEdit(t);
    setName(t.name as string);
    setCategory((t.category as string) ?? '');
    setContent(t.content as string);
    setOpen(true);
  };

  const save = async () => {
    try {
      if (edit) {
        await updateSavedReply(edit.id as string, { name, content, category: category || null });
      } else {
        await createSavedReply({
          workspace_id: workspaceId,
          name,
          content,
          category: category || null,
          created_by: user?.id ?? null,
        });
      }
      toast.success('Saved');
      setOpen(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Saved replies</h2>
        <Button type="button" className="btn-primary h-9" onClick={openNew}>
          New reply
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="max-w-xs h-9 text-sm border-border bg-background"
        />
        <select
          value={cat}
          onChange={e => setCat(e.target.value)}
          className="h-9 text-sm rounded-md border border-border bg-background px-2"
        >
          <option value="">All categories</option>
          {categories.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => (
          <div key={t.id as string} className="border border-border rounded-xl p-4 bg-card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-foreground text-sm">{t.name as string}</p>
              {t.category ? (
                <Badge variant="secondary" className="text-[10px]">
                  {String(t.category)}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3">{t.content as string}</p>
            <p className="text-[10px] text-muted-foreground">Used {(t.use_count as number) ?? 0}×</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(t)}>
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive"
                onClick={() => deleteSavedReply(t.id as string).then(load)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>{edit ? 'Edit reply' : 'New reply'}</DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="border-border bg-background" />
          <Input
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Category"
            className="border-border bg-background"
          />
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={5}
            placeholder="Template content…"
            className="border-border bg-background"
          />
          <DialogFooter>
            <Button type="button" className="btn-primary" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
