'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { tmListMyNotifications, tmMarkAllNotificationsRead, tmMarkNotificationRead } from '@/app/actions/tasksActions';
import { useTasks } from '@/components/tasks/TasksProvider';
import type { TmNotification } from '@/lib/tasks/types';

export function NotificationBell() {
  const router = useRouter();
  const { boot, refresh } = useTasks();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TmNotification[]>([]);
  const unread = boot?.unread_count ?? rows.filter((n) => !n.read_at).length;

  async function load() {
    const res = await tmListMyNotifications();
    if (res.ok) setRows(res.data);
  }

  useEffect(() => {
    if (open) void load();
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="tm-bell"
        aria-label="Notifications"
        className="relative rounded-lg p-2 text-white/60 hover:text-white"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span data-testid="tm-bell-badge" className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-[#E24B4A] px-1 text-center text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div data-testid="tm-bell-list" className="absolute right-0 z-50 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-white/10 bg-[#141414] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Notifications</p>
            <button
              type="button"
              data-testid="tm-bell-mark-all"
              className="text-xs text-[#C6A664]"
              onClick={() => {
                void tmMarkAllNotificationsRead().then((r) => {
                  if (r.ok) setRows(r.data);
                  void refresh();
                });
              }}
            >
              Mark all read
            </button>
          </div>
          {rows.length === 0 && <p className="text-sm text-white/40">Nothing yet.</p>}
          <ul className="space-y-2">
            {rows.slice(0, 30).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  data-testid={`tm-bell-item-${n.kind}`}
                  className={`w-full rounded-lg px-2 py-2 text-left ${n.read_at ? 'text-white/45' : 'bg-white/5'}`}
                  onClick={() => {
                    void tmMarkNotificationRead(n.id).then((r) => {
                      if (r.ok) setRows(r.data);
                      void refresh();
                    });
                    if (n.task_id) router.push(`/admin/tasks/t/${n.task_id}`);
                    else if (n.goal_id) router.push(`/admin/tasks/goals/${n.goal_id}`);
                    setOpen(false);
                  }}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body && <p className="text-xs text-white/45">{n.body}</p>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
