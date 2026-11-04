'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { tmPinFilter, tmSaveFilter, tmSearchTasks } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TaskGroup } from '@/components/tasks/TaskRow';
import { TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import { useLockBodyScroll, useVisualViewport, visualViewportStyle } from '@/hooks/useVisualViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TmSavedFilter, TmTask } from '@/lib/tasks/types';

const emptyFilters = {
  person: '',
  folder: '',
  goal: '',
  status: '',
  priority: '',
  size: '',
  counts: '',
  due_from: '',
  due_to: '',
};

export function SearchSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { boot, isSuper, refresh } = useTasks();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<TmTask[] | null>(null);
  const [saving, setSaving] = useState('');
  const saved = boot?.saved_filters ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const box = useVisualViewport(open);
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  function spec() {
    const out: Record<string, string | boolean | null> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (!v) return;
      out[k] = k === 'counts' ? v === 'true' : v;
    });
    return out;
  }

  async function run(nextQ = q, nextSpec = spec()) {
    const res = await tmSearchTasks(nextQ, nextSpec);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setResults(res.data);
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void run(), 200);
    return () => clearTimeout(t);
  }, [open, q, filters]);

  if (!open) return null;

  return (
    <div
      className="z-50 overflow-hidden bg-[#0B0B0B]/95 p-4"
      data-testid="tm-search-sheet"
      style={visualViewportStyle(box)}
    >
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <Input
            ref={inputRef}
            autoFocus
            data-testid="tm-search-input"
            placeholder="Search tasks…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border-white/10 bg-[#1a1a1a]"
          />
          <Button type="button" variant="ghost" data-testid="tm-search-close" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" data-testid="tm-filters-open" onClick={() => setShowFilters((v) => !v)}>
            Filters
          </Button>
          {saved.filter((f) => f.pinned).map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`tm-saved-chip-${f.id}`}
              className="rounded-full bg-[#C6A664] px-3 py-1 text-xs text-black"
              onClick={() => {
                applySpec(f, setFilters);
                setQ('');
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
        {showFilters && (
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-white/[0.06] bg-[#141414] p-3" data-testid="tm-filters-sheet">
            {isSuper && (
              <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-person" value={filters.person} onChange={(e) => setFilters({ ...filters, person: e.target.value })}>
                <option value="">Person</option>
                {(boot?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name}</option>
                ))}
              </select>
            )}
            {isSuper && (
              <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-folder" value={filters.folder} onChange={(e) => setFilters({ ...filters, folder: e.target.value })}>
                <option value="">Folder</option>
                {(boot?.folders ?? []).filter((f) => !f.archived_at).map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
            <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-goal" value={filters.goal} onChange={(e) => setFilters({ ...filters, goal: e.target.value })}>
              <option value="">Goal</option>
              {(boot?.goals ?? []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Status</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-priority" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value })}>
              <option value="">Priority</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-size" value={filters.size} onChange={(e) => setFilters({ ...filters, size: e.target.value })}>
              <option value="">Size</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
            </select>
            <select className="rounded bg-[#1a1a1a] p-2 text-sm" data-testid="tm-filter-counts" value={filters.counts} onChange={(e) => setFilters({ ...filters, counts: e.target.value })}>
              <option value="">Counts / exempt</option>
              <option value="true">Counts</option>
              <option value="false">Exempt</option>
            </select>
            <Input type="date" data-testid="tm-filter-due-from" value={filters.due_from} onChange={(e) => setFilters({ ...filters, due_from: e.target.value })} className="border-white/10 bg-[#1a1a1a]" />
            <Input type="date" data-testid="tm-filter-due-to" value={filters.due_to} onChange={(e) => setFilters({ ...filters, due_to: e.target.value })} className="border-white/10 bg-[#1a1a1a]" />
            <Input data-testid="tm-filter-save-name" placeholder="Save as…" value={saving} onChange={(e) => setSaving(e.target.value)} className="border-white/10 bg-[#1a1a1a]" />
            <Button
              type="button"
              data-testid="tm-filter-save"
              className="bg-[#C6A664] text-black"
              onClick={() => {
                if (!saving.trim()) return;
                void tmSaveFilter(saving.trim(), spec(), true).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Filter saved');
                  setSaving('');
                  return refresh();
                });
              }}
            >
              Save + pin
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {results === null ? (
            <TmSkeleton />
          ) : results.length === 0 ? (
            <TmEmpty testId="tm-search-empty">No matching tasks</TmEmpty>
          ) : (
            <TaskGroup tasks={results} showFolder={isSuper} />
          )}
        </div>
      </div>
    </div>
  );
}

function applySpec(f: TmSavedFilter, setFilters: (v: typeof emptyFilters) => void) {
  setFilters({
    person: String(f.spec.person ?? ''),
    folder: String(f.spec.folder ?? ''),
    goal: String(f.spec.goal ?? ''),
    status: String(f.spec.status ?? ''),
    priority: String(f.spec.priority ?? ''),
    size: String(f.spec.size ?? ''),
    counts: f.spec.counts === true ? 'true' : f.spec.counts === false ? 'false' : '',
    due_from: String(f.spec.due_from ?? ''),
    due_to: String(f.spec.due_to ?? ''),
  });
}

export function SavedFilterChips({ onPick }: { onPick: (f: TmSavedFilter) => void }) {
  const { boot } = useTasks();
  const pinned = (boot?.saved_filters ?? []).filter((f) => f.pinned);
  if (!pinned.length) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2" data-testid="tm-pinned-filters">
      {pinned.map((f) => (
        <button
          key={f.id}
          type="button"
          data-testid={`tm-pin-chip-${f.id}`}
          className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/70"
          onClick={() => onPick(f)}
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}

export function PinToggle({ filter }: { filter: TmSavedFilter }) {
  const { refresh } = useTasks();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      data-testid={`tm-pin-${filter.id}`}
      onClick={() => void tmPinFilter(filter.id, !filter.pinned).then(() => refresh())}
    >
      {filter.pinned ? 'Unpin' : 'Pin'}
    </Button>
  );
}
