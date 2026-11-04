'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { tmGetGoal } from '@/app/actions/tasksActions';
import { GoalForm } from '@/components/tasks/GoalForm';
import type { TmGoal } from '@/lib/tasks/types';

export default function EditGoalPage() {
  const params = useParams<{ id: string }>();
  const [goal, setGoal] = useState<TmGoal | null>(null);
  useEffect(() => {
    void tmGetGoal(params.id).then((res) => {
      if (res.ok) setGoal(res.data);
    });
  }, [params.id]);
  if (!goal) return <p className="text-sm text-white/35">Loading…</p>;
  return <GoalForm goal={goal} />;
}
