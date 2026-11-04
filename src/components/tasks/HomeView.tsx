'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { tmDashboard, tmDecideRequest, tmListMyNotifications } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import { GoalBar } from '@/components/tasks/GoalBar';
import { TaskGroup } from '@/components/tasks/TaskRow';
import { TmSkeleton } from '@/components/tasks/uiBits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { chipName, firstName } from '@/lib/tasks/names';
import type { TmDashboard, TmNotification, TmProgress } from '@/lib/tasks/types';

function BarCard({ label, bar, testId }: { label: string; bar?: TmProgress; testId: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#141414] p-3" data-testid={testId} data-tm-pct={bar?.pct ?? 0}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-[#C6A664]">{Math.round(bar?.pct ?? 0)}%</span>
      </div>
      <div className="mt-2">
        <GoalBar pct={bar?.pct ?? 0} color="#C6A664" got={bar?.got} total={bar?.total} />
      </div>
    </div>
  );
}

export function HomeView() {
  const { boot, isSuper, markFetchFailed } = useTasks();
  const [dash, setDash] = useState<TmDashboard | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notesFeed, setNotesFeed] = useState<TmNotification[]>([]);
  const first = boot?.full_name ? firstName(boot.full_name) : 'there';

  async function load(nextPerson = person) {
    const res = await tmDashboard(nextPerson);
    if (!res.ok) {
      markFetchFailed();
      return;
    }
    setDash(res.data);
  }

  useEffect(() => {
    void load(person);
    void tmListMyNotifications().then((res) => {
      if (res.ok) setNotesFeed(res.data.filter((n) => n.kind === 'request_denied' || n.kind === 'request_approved' || n.kind === 'request_decided').slice(0, 5));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);

  if (!dash) return <div data-testid="tm-home"><TmSkeleton rows={6} /></div>;

  return (
    <div data-testid="tm-home">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C6A664]">Home</p>
      <h1 className="tm-display mb-6 mt-1 text-3xl">Hey {first}.</h1>

      <section className="mb-6 rounded-xl border border-white/[0.06] bg-[#141414] p-4" data-testid="tm-recap">
        <p className="text-xs uppercase tracking-wide text-white/35">Monday recap</p>
        {dash.recap.period_id ? (
          <Link
            href={`/admin/tasks/history/${dash.recap.period_id}`}
            className="mt-1 block text-sm text-white/80 no-underline"
            data-testid="tm-recap-link"
          >
            {dash.recap.headline}
          </Link>
        ) : (
          <p className="mt-1 text-sm text-white/60">{dash.recap.headline}</p>
        )}
      </section>

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{isSuper ? 'Company bars' : 'My bars'}</h2>
        </div>
        {isSuper && (
          <div className="mb-3 flex flex-wrap gap-2" data-testid="tm-person-chips">
            <button
              type="button"
              data-testid="tm-person-everyone"
              className={`rounded-full px-3 py-1 text-xs ${person == null ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
              onClick={() => setPerson(null)}
            >
              Everyone
            </button>
            {dash.people.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`tm-person-${p.id}`}
                className={`rounded-full px-3 py-1 text-xs ${person === p.id ? 'bg-[#C6A664] text-black' : 'bg-white/8'}`}
                onClick={() => setPerson(p.id)}
              >
                {chipName(p, dash.people)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <BarCard label="Week" bar={dash.bars.week} testId="tm-bar-week" />
          <BarCard label="Month" bar={dash.bars.month} testId="tm-bar-month" />
          <BarCard label="Quarter" bar={dash.bars.quarter} testId="tm-bar-quarter" />
          <BarCard label="Year" bar={dash.bars.year} testId="tm-bar-year" />
        </div>
      </section>

      {notesFeed.length > 0 && (
        <section className="mb-6" data-testid="tm-request-notes">
          <h2 className="mb-2 text-sm font-semibold">Request updates</h2>
          <ul className="space-y-2 text-sm text-white/70">
            {notesFeed.map((n) => (
              <li key={n.id} className="rounded-xl border border-white/[0.06] px-3 py-2">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-white/45">{n.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isSuper && (
        <>
          <section className="mb-6" data-testid="tm-needs-decision">
            <h2 className="mb-2 text-sm font-semibold">Needs a decision</h2>
            {(dash.needs_decision ?? []).length === 0 ? (
              <p className="text-xs text-white/40">Clear for now.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {dash.needs_decision.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="text-white/70">
                    <Link
                      href={item.kind === 'goal' ? `/admin/tasks/goals/${item.id}` : `/admin/tasks/t/${item.id}`}
                      className="text-inherit no-underline"
                      data-testid={`tm-decision-${item.kind}-${item.id}`}
                    >
                      {item.title} · {item.kind}{item.pushed_count ? ` · Pushed ${item.pushed_count}x` : ''}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-6" data-testid="tm-requests">
            <h2 className="mb-2 text-sm font-semibold">Requests</h2>
            {(dash.requests ?? []).length === 0 ? (
              <p className="text-xs text-white/40">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {dash.requests.map((r) => (
                  <div key={r.id} className="rounded-xl border border-white/[0.06] p-3" data-testid={`tm-request-${r.id}`}>
                    <p className="text-sm font-medium">{r.task_title}</p>
                    <p className="text-xs text-white/45">{r.kind} · {r.requester_name} · {r.reason}</p>
                    <Input
                      className="mt-2 border-white/10 bg-[#1a1a1a]"
                      placeholder="Note"
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        data-testid={`tm-request-approve-${r.id}`}
                        className="bg-[#C6A664] text-black"
                        onClick={() => {
                          void tmDecideRequest(r.id, true, notes[r.id]).then((res) => {
                            if (!res.ok) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success('Approved');
                            return load();
                          });
                        }}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`tm-request-deny-${r.id}`}
                        onClick={() => {
                          void tmDecideRequest(r.id, false, notes[r.id] || 'Not this time').then((res) => {
                            if (!res.ok) {
                              toast.error(res.error);
                              return;
                            }
                            toast.success('Denied');
                            return load();
                          });
                        }}
                      >
                        Deny
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <div className="space-y-6">
        {isSuper && <TaskGroup title="Needs a home" tasks={(dash.needs_home ?? []).slice(0, 5)} showFolder={false} />}
        {isSuper && <TaskGroup title="Needs a goal" tasks={(dash.needs_goal ?? []).slice(0, 5)} showFolder={isSuper} />}
        <TaskGroup title="Overdue" tasks={(dash.overdue ?? []).slice(0, 5)} showFolder={isSuper} empty="Nothing overdue." />
        <TaskGroup title="Due today" tasks={(dash.due_today ?? []).slice(0, 5)} showFolder={isSuper} empty="Nothing due today." />
        {(dash.goals ?? []).length > 0 && (
          <section data-testid="tm-home-goals">
            <h2 className="mb-2 text-sm font-semibold">Goals</h2>
            <div className="space-y-2">
              {dash.goals.map((g) => (
                <Link key={g.id} href={`/admin/tasks/goals/${g.id}`} className="block rounded-xl border border-white/[0.06] p-3 no-underline text-inherit">
                  <div className="flex justify-between text-sm"><span>{g.name}</span><span>{Math.round(g.pct)}%</span></div>
                  <GoalBar pct={g.pct} color={g.color} got={g.got} total={g.total} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
