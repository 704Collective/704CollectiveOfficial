'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { tmCreateGoal, tmUpdateGoal } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TmGoal } from '@/lib/tasks/types';

const COLORS = ['#C6A664', '#6B8E9F', '#C47B5A', '#7A9E7E', '#8B7BB8', '#4A9B8C', '#8A8A8A', '#E24B4A'];
const SOURCES = [
  { id: 'manual', label: 'Manual' },
  { id: 'new_members', label: 'New members' },
  { id: 'active_members', label: 'Active members' },
  { id: 'business_members', label: 'Business members' },
  { id: 'checkins', label: 'Check-ins' },
];

export function GoalForm({ goal }: { goal?: TmGoal }) {
  const router = useRouter();
  const { boot } = useTasks();
  const [name, setName] = useState(goal?.name ?? '');
  const [kind, setKind] = useState<'task' | 'number'>((goal?.kind === 'number' ? 'number' : 'task'));
  const [color, setColor] = useState(goal?.color ?? '#C6A664');
  const [due, setDue] = useState(goal?.due_date ?? '');
  const [parentId, setParentId] = useState(goal?.parent_id ?? '');
  const [target, setTarget] = useState(goal?.number_target ? String(goal.number_target) : '');
  const [unit, setUnit] = useState(goal?.number_unit ?? '');
  const [source, setSource] = useState(goal?.number_source ?? 'manual');
  const [rangeStart, setRangeStart] = useState(goal?.range_start ?? '');
  const [rangeEnd, setRangeEnd] = useState(goal?.range_end ?? '');

  async function save() {
    if (goal) {
      const res = await tmUpdateGoal({
        id: goal.id,
        name,
        color,
        dueDate: due || null,
        numberTarget: target ? Number(target) : null,
        numberUnit: unit || null,
        numberSource: source,
        rangeStart: rangeStart || null,
        rangeEnd: rangeEnd || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Goal saved');
      router.push(`/admin/tasks/goals/${goal.id}`);
      return;
    }
    const res = await tmCreateGoal({
      name,
      kind,
      color,
      dueDate: due || null,
      parentId: parentId || null,
      numberTarget: target ? Number(target) : null,
      numberUnit: unit || null,
      numberSource: source,
      rangeStart: rangeStart || null,
      rangeEnd: rangeEnd || null,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Goal created');
    router.push(`/admin/tasks/goals/${res.data.id}`);
  }

  const parents = (boot?.goals ?? []).filter((g) => !g.is_misc && g.id !== goal?.id);

  return (
    <div data-testid="tm-goal-form" className="space-y-4">
      <h1 className="tm-display text-3xl">{goal ? 'Edit goal' : 'New goal'}</h1>
      <Input data-testid="tm-goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border-white/10 bg-[#1a1a1a]" />
      {!goal && (
        <div className="flex gap-2">
          {(['task', 'number'] as const).map((k) => (
            <Button key={k} type="button" variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>
              {k === 'task' ? 'Task goal' : 'Number goal'}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`h-7 w-7 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={c}
          />
        ))}
      </div>
      <label className="block text-sm text-white/60">
        Due
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1 border-white/10 bg-[#1a1a1a]" />
      </label>
      {!goal && (
        <label className="block text-sm text-white/60">
          Parent
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {parents.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
      )}
      {kind === 'number' && (
        <div className="space-y-3 rounded-xl border border-white/[0.06] p-3">
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target" className="border-white/10 bg-[#1a1a1a]" />
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit (members, check-ins…)" className="border-white/10 bg-[#1a1a1a]" />
          <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm">
            {SOURCES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="border-white/10 bg-[#1a1a1a]" />
            <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="border-white/10 bg-[#1a1a1a]" />
          </div>
        </div>
      )}
      <Button type="button" data-testid="tm-goal-save" className="bg-[#C6A664] text-black" onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}
