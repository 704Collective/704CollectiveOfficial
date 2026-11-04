'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { tmListCalendar } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { TmEmpty, TmSkeleton } from '@/components/tasks/uiBits';
import { Button } from '@/components/ui/button';
import type { TmTask } from '@/lib/tasks/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthStart(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1);
}

function toIsoMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function charlotteToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function CalendarView() {
  const router = useRouter();
  const { boot, markFetchFailed } = useTasks();
  const [month, setMonth] = useState(() => (boot?.effective_today ?? charlotteToday()).slice(0, 8) + '01');
  const [tasks, setTasks] = useState<TmTask[] | null>(null);

  useEffect(() => {
    void tmListCalendar(month).then((res) => {
      if (!res.ok) {
        markFetchFailed();
        return;
      }
      setTasks(res.data);
    });
  }, [month, markFetchFailed]);

  const grid = useMemo(() => {
    const start = monthStart(month);
    const year = start.getFullYear();
    const mo = start.getMonth();
    const firstDow = (start.getDay() + 6) % 7;
    const daysIn = new Date(year, mo + 1, 0).getDate();
    const cells: { date: string | null; day: number | null }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= daysIn; d++) {
      cells.push({
        date: `${year}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
      });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    return cells;
  }, [month]);

  const byDate = useMemo(() => {
    const map = new Map<string, TmTask[]>();
    (tasks ?? []).forEach((t) => {
      if (!t.due_date) return;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    });
    return map;
  }, [tasks]);

  const label = monthStart(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/New_York' });
  const today = boot?.effective_today ?? charlotteToday();

  function shift(delta: number) {
    const d = monthStart(month);
    d.setMonth(d.getMonth() + delta);
    setMonth(toIsoMonth(d));
    setTasks(null);
  }

  return (
    <div data-testid="tm-calendar">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="tm-display text-3xl">Calendar</h1>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" data-testid="tm-cal-prev" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-[9rem] text-center text-sm text-white/70" data-testid="tm-cal-label">{label}</p>
          <Button type="button" variant="ghost" size="sm" data-testid="tm-cal-next" onClick={() => shift(1)} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {tasks === null ? (
        <TmSkeleton rows={8} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <div className="grid grid-cols-7 bg-[#101010] text-center text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {DAYS.map((d) => (
              <div key={d} className="px-0.5 py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7" data-testid="tm-cal-grid">
            {grid.map((cell, i) => {
              const dayTasks = cell.date ? byDate.get(cell.date) ?? [] : [];
              const shown = dayTasks.slice(0, 3);
              const extra = dayTasks.length - shown.length;
              const isToday = cell.date === today;
              return (
                <div
                  key={i}
                  data-testid={cell.date ? `tm-cal-day-${cell.date}` : undefined}
                  className={`min-h-[72px] border-t border-white/[0.05] px-0.5 py-1 ${isToday ? 'bg-[#C6A664]/10' : ''}`}
                >
                  {cell.day && (
                    <p className={`mb-0.5 text-[11px] ${isToday ? 'font-bold text-[#C6A664]' : 'text-white/40'}`}>{cell.day}</p>
                  )}
                  {shown.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`tm-cal-task-${t.id}`}
                      onClick={() => router.push(`/admin/tasks/t/${t.id}`)}
                      className={`mb-0.5 block w-full truncate rounded px-0.5 text-left text-[10px] leading-4 ${
                        t.overdue ? 'bg-[#E24B4A]/25 text-[#ffb4b0]' : 'text-[#f4f1ea]'
                      }`}
                      style={t.overdue ? undefined : { background: `${t.folder_color || '#8A8A8A'}33` }}
                    >
                      {t.title}
                    </button>
                  ))}
                  {extra > 0 && <p className="text-[10px] text-white/35">+{extra}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {tasks && tasks.length === 0 && <TmEmpty testId="tm-cal-empty">No dated tasks this month</TmEmpty>}
    </div>
  );
}
