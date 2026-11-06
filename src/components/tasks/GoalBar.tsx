import { charlotteToday } from '@/lib/tasks/dates';
import type { TmGoal } from '@/lib/tasks/types';

export function goalIsOverdue(goal: {
  status?: string | null;
  tags?: string[] | null;
  due_date?: string | null;
}) {
  if (goal.status === 'failed') return true;
  if (goal.status && !['active', 'ready'].includes(goal.status)) return false;
  if (goal.due_date) return goal.due_date < charlotteToday();
  return (goal.tags ?? []).includes('Overdue');
}

export function goalBarFill(goal: {
  color?: string | null;
  status?: string | null;
  tags?: string[] | null;
  due_date?: string | null;
}) {
  if (goalIsOverdue(goal)) return '#E24B4A';
  return goal.color || '#C6A664';
}

export function GoalBar({
  pct,
  color,
  got,
  total,
  testId,
}: {
  pct: number;
  color?: string | null;
  got?: number;
  total?: number;
  testId?: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div data-testid={testId}>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${width}%`, background: color || '#C6A664' }}
        />
      </div>
      {(got != null || total != null) && (
        <p className="mt-1 text-xs text-white/45">
          {got ?? 0}/{total ?? 0} · {Math.round(pct)}%
        </p>
      )}
    </div>
  );
}

export function GoalTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`tm-chip ${tag === 'Overdue' ? 'tm-chip-overdue' : tag === 'Ready to complete' ? 'tm-chip-soon' : 'tm-chip-muted'}`}
        >
          {tag}
        </span>
      ))}
    </span>
  );
}

export function goalDueLabel(goal: Pick<TmGoal, 'due_date'>) {
  if (!goal.due_date) return 'TBD';
  const [y, m, d] = goal.due_date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
