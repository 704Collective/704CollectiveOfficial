'use client';

import { useState } from 'react';
import { tmDismissTips } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { Button } from '@/components/ui/button';

const TIPS = [
  { title: 'Your pile', body: 'My Tasks is only what you own. Today, this week, overdue.' },
  { title: 'Gold means moving', body: 'Open is grey. In progress is gold. Done is green. Red is overdue.' },
  { title: 'Fix it when it slips', body: 'Overdue tasks stay red until you reschedule, mark done late, or miss them.' },
  { title: 'Search finds the words', body: 'Titles, notes, checklist items, comments, goals, and file names.' },
];

export function TipsOverlay() {
  const { boot, refresh } = useTasks();
  const [step, setStep] = useState(0);
  if (!boot?.show_tips) return null;
  const tip = TIPS[step];

  async function finish() {
    await tmDismissTips();
    await refresh();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:items-center" data-testid="tm-tips">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141414] p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#C6A664]">
          Tip {step + 1} of {TIPS.length}
        </p>
        <h2 className="tm-display mt-1 text-2xl">{tip.title}</h2>
        <p className="mt-2 text-sm text-white/65">{tip.body}</p>
        <div className="mt-4 flex justify-between">
          <Button type="button" variant="ghost" data-testid="tm-tips-skip" onClick={() => void finish()}>
            Skip
          </Button>
          {step < TIPS.length - 1 ? (
            <Button type="button" className="bg-[#C6A664] text-black" data-testid="tm-tips-next" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button type="button" className="bg-[#C6A664] text-black" data-testid="tm-tips-done" onClick={() => void finish()}>
              Got it
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
