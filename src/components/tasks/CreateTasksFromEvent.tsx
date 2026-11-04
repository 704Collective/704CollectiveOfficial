'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { tmApplyEventTemplate, tmBootstrap, tmListEventTemplates } from '@/app/actions/tasksActions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Template = { id: string; name: string; items: { title: string; days_before: number; size: string; counts: boolean }[] };

export function CreateTasksFromEvent({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const { isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [goals, setGoals] = useState<{ id: string; name: string; is_misc: boolean }[]>([]);
  const [includePast, setIncludePast] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void Promise.all([tmListEventTemplates(), tmBootstrap()]).then(([t, b]) => {
      if (t.ok) {
        setTemplates(t.data);
        setTemplateId((prev) => prev || t.data.find((x) => x.name === 'Standard event')?.id || t.data[0]?.id || '');
      }
      if (b.ok) {
        setGoals(b.data.goals ?? []);
        const misc = b.data.misc_goal_id ?? b.data.goals.find((g) => g.is_misc)?.id ?? '';
        setGoalId((prev) => prev || misc);
      }
    });
  }, [open]);

  if (!isSuperAdmin) return null;

  return (
    <>
      <Button type="button" variant="outline" className="flex-1 sm:flex-none" data-testid="tm-create-from-event" onClick={() => setOpen(true)}>
        Create tasks from event
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Create tasks from event</DialogTitle>
            <DialogDescription>Apply a template to {eventTitle}. Dates count back from the event.</DialogDescription>
          </DialogHeader>
          <label className="text-sm">
            Template
            <select data-testid="tm-event-template" className="mt-1 w-full rounded border bg-background p-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Goal
            <select data-testid="tm-event-goal" className="mt-1 w-full rounded border bg-background p-2" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" data-testid="tm-event-include-past" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} />
            Include items whose date already passed
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              data-testid="tm-event-apply"
              disabled={!templateId || busy}
              onClick={() => {
                setBusy(true);
                void tmApplyEventTemplate(templateId, eventId, goalId || null, includePast).then((r) => {
                  setBusy(false);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(`Created ${r.data.created} tasks${r.data.skipped ? `, skipped ${r.data.skipped}` : ''}`);
                  setOpen(false);
                });
              }}
            >
              Create tasks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
