'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { tmCreateTask } from '@/app/actions/tasksActions';
import { addDays, charlotteToday } from '@/lib/tasks/dates';
import { ViewportSheet } from '@/components/tasks/ViewportSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SmartDateTimePicker } from '@/components/SmartDateTimePicker';

type Chip = 'today' | 'tomorrow' | 'pick' | 'none';

export function QuickAddSheet({
  open,
  onOpenChange,
  folderId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [chip, setChip] = useState<Chip>('none');
  const [picked, setPicked] = useState<Date | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  function reset() {
    setTitle('');
    setChip('none');
    setPicked(undefined);
  }

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const today = charlotteToday();
    let dueDate: string | null = null;
    let dueTime: string | null = null;
    if (chip === 'today') dueDate = today;
    else if (chip === 'tomorrow') dueDate = addDays(today, 1);
    else if (chip === 'pick' && picked) {
      const y = picked.getFullYear();
      const m = String(picked.getMonth() + 1).padStart(2, '0');
      const d = String(picked.getDate()).padStart(2, '0');
      dueDate = `${y}-${m}-${d}`;
      dueTime = `${String(picked.getHours()).padStart(2, '0')}:${String(picked.getMinutes()).padStart(2, '0')}:00`;
    }
    const res = await tmCreateTask({ title: title.trim(), dueDate, dueTime, folderId });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Task added');
    reset();
    onOpenChange(false);
    onCreated?.();
    router.push(`/admin/tasks/t/${res.data.id}`);
    router.refresh();
  }

  return (
    <ViewportSheet open={open} onOpenChange={onOpenChange} testId="tm-quick-add">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pb-2 pt-4">
          <p className="tm-display text-left text-xl">New task</p>
        </div>
        <div className="shrink-0 px-4">
          <Input
            ref={titleRef}
            data-testid="tm-quick-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
            className="h-11 border-white/10 bg-[#1a1a1a] text-base"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['today', 'Today'],
                ['tomorrow', 'Tomorrow'],
                ['pick', 'Pick'],
                ['none', 'No date'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-testid={`tm-quick-${id}`}
                onClick={() => setChip(id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  chip === id ? 'bg-[#C6A664] text-black' : 'bg-white/8 text-white/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {chip === 'pick' && (
            <div className="mt-3">
              <SmartDateTimePicker value={picked} onChange={setPicked} label="Due" />
            </div>
          )}
        </div>
        <div className="shrink-0 px-4 pb-4 pt-2">
          <Button
            data-testid="tm-quick-submit"
            type="button"
            onClick={() => void submit()}
            disabled={saving || !title.trim()}
            className="h-11 w-full bg-[#C6A664] text-black hover:bg-[#C6A664]/90"
          >
            {saving ? 'Adding…' : 'Add task'}
          </Button>
        </div>
      </div>
    </ViewportSheet>
  );
}
