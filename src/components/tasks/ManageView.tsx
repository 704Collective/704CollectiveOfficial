'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { tmRunTick, tmSetTimeMachine } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { tmTimeMachineVisible } from '@/lib/tasks/timeMachine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ManageView() {
  const { boot, refresh, isSuper } = useTasks();
  const [date, setDate] = useState('');
  const showMachine = tmTimeMachineVisible({
    vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV,
    honorFlag: boot?.honor_time_machine === true,
  });

  if (!isSuper) return <p className="text-sm text-white/40">Super admins only.</p>;

  return (
    <div data-testid="tm-manage">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Manage</p>
      <h1 className="tm-display mb-6 mt-1 text-3xl">Manage</h1>
      {showMachine && (
        <section data-testid="tm-time-machine" className="rounded-xl border border-white/[0.06] bg-[#141414] p-4">
          <h2 className="text-sm font-semibold">Time machine</h2>
          <p className="mt-1 text-xs text-white/45">
            Pretend date for overdue, repeats, and tick. Develop only.
            {boot?.effective_today ? ` Today is ${boot.effective_today}.` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input data-testid="tm-time-machine-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="border-white/10 bg-[#1a1a1a]" />
            <Button
              type="button"
              data-testid="tm-time-machine-set"
              className="bg-[#C6A664] text-black"
              onClick={() => {
                if (!date) return;
                void tmSetTimeMachine(new Date(date).toISOString()).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Pretend date set');
                  return refresh();
                });
              }}
            >
              Set date
            </Button>
            <Button
              type="button"
              data-testid="tm-tick-now"
              variant="outline"
              onClick={() => {
                void tmRunTick().then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Tick ran');
                  return refresh();
                });
              }}
            >
              Run tick now
            </Button>
            <Button
              type="button"
              data-testid="tm-time-machine-clear"
              variant="ghost"
              onClick={() => {
                void tmSetTimeMachine(null).then((r) => {
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success('Cleared');
                  return refresh();
                });
              }}
            >
              Clear
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
