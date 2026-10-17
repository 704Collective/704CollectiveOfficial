'use client';

// Admin CANCEL / RESCHEDULE flow for an event (or its upcoming series).
//
// Steps: details (reason + note + scope) -> preview (rendered email, recipients,
// paid tickets, Eventbrite reminder) -> "Send to N people" -> sending (loops
// mode:'resume' until the server queue is drained) -> done.
//
// Reschedule is hybrid: after the details step the parent opens the normal event
// form prefilled from the old event (onNeedNewEvent). Once the new event exists,
// the parent reopens this dialog with `rescheduledToEventId` and we go straight to
// preview. The server refuses to mark anything until the new event is live.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, Mail, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CANCEL_NOTE_HINT, showCancelDiscussionCta } from '@/lib/events/cancelDiscussionCta';

export type CancelAction = 'cancel' | 'reschedule';
export type CancelScope = 'occurrence' | 'series';
export const CANCEL_REASONS = ['Weather', 'Venue issue', 'Host or vendor issue', 'Other'] as const;

export type CancelDialogEvent = {
  id: string;
  title: string;
  start_time: string;
  parent_event_id?: string | null;
  recurrence_rule?: string | null;
  status?: string | null;
};

export type CancelMode = 'standard' | 'not_hosting';
export type CancelDetails = { action: CancelAction; scope: CancelScope; reason: string; note: string; cancel_mode: CancelMode };

type Preview = {
  affected: Array<{ id: string; title: string; start_time: string; status: string }>;
  already_closed: string[];
  recipients: Array<{ email: string; name: string; event_count: number; kinds: string[] }>;
  recipient_count: number;
  paid: Array<{ email: string | null; name: string | null; amount_cents: number; via: string; event_id: string }>;
  eventbrite_reminder: Array<{ id: string; title: string }>;
  target: { id: string; title: string; start_time: string } | null;
  email: { subject: string; html: string };
  email_public?: { subject: string; html: string };
  cancel_mode?: CancelMode;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CancelDialogEvent | null;
  action: CancelAction;
  /** True when the event is part of a recurring series (parent or child). */
  isRecurring: boolean;
  /** Closed event with queued|failed emails left over from an interrupted send: open straight into the send loop. */
  resume?: boolean;
  /** Reschedule only: set once the new event has been created; skips straight to preview. */
  rescheduledToEventId?: string | null;
  /** Reschedule only: details captured before the form step, restored on return. */
  initialDetails?: CancelDetails | null;
  /** Reschedule only: called after details are captured; parent opens the prefilled form. */
  onNeedNewEvent?: (details: CancelDetails) => void;
  /** Called after a successful send. */
  onDone?: () => void;
}

export function EventCancelDialog({ open, onOpenChange, event, action, isRecurring, resume = false, rescheduledToEventId, initialDetails, onNeedNewEvent, onDone }: Props) {
  const [step, setStep] = useState<'details' | 'preview' | 'sending' | 'done'>('details');
  const [reasonPick, setReasonPick] = useState<string>(initialDetails?.reason.split(':')[0] ?? '');
  const [reasonOther, setReasonOther] = useState('');
  const [note, setNote] = useState(initialDetails?.note ?? '');
  const [cancelMode, setCancelMode] = useState<CancelMode>(initialDetails?.cancel_mode ?? 'standard');
  const [scope, setScope] = useState<CancelScope>(initialDetails?.scope ?? 'occurrence');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ sent: number; remaining: number; failed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reason = useMemo(() => {
    if (!reasonPick) return '';
    return reasonPick === 'Other' ? `Other: ${reasonOther.trim()}`.replace(/: $/, '') : reasonPick;
  }, [reasonPick, reasonOther]);
  const reasonValid = !!reasonPick && (reasonPick !== 'Other' || reasonOther.trim().length > 0);

  const reset = useCallback(() => {
    setStep('details'); setPreview(null); setBusy(false); setProgress(null); setErr(null);
    if (!initialDetails) { setReasonPick(''); setReasonOther(''); setNote(''); setScope('occurrence'); setCancelMode('standard'); }
  }, [initialDetails]);

  useEffect(() => { if (!open) reset(); }, [open, reset]);
  useEffect(() => {
    if (initialDetails) {
      const [pick, ...rest] = initialDetails.reason.split(': ');
      setReasonPick(pick); setReasonOther(rest.join(': ')); setNote(initialDetails.note); setScope(initialDetails.scope); setCancelMode(initialDetails.cancel_mode ?? 'standard');
    }
  }, [initialDetails]);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('cancel-event', { body: { ...body, event_id: event?.id, origin: window.location.origin } });
    if (error) {
      let msg = error.message; try { const ctx = (error as { context?: Response }).context; if (ctx) { const j = await ctx.json(); if (j?.error) msg = j.error; } } catch { /* */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }, [event?.id]);

  const loadPreview = useCallback(async (details: CancelDetails, targetId?: string | null) => {
    setBusy(true); setErr(null);
    try {
      const data = await invoke({ mode: 'preview', action: details.action, scope: details.scope, reason: details.reason, note: details.note, cancel_mode: details.cancel_mode, rescheduled_to_event_id: targetId ?? undefined });
      setPreview(data as unknown as Preview);
      setStep('preview');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Preview failed'); }
    finally { setBusy(false); }
  }, [invoke]);

  // Reschedule return trip: new event exists -> preview immediately.
  useEffect(() => {
    if (open && action === 'reschedule' && rescheduledToEventId && initialDetails && step === 'details') {
      void loadPreview(initialDetails, rescheduledToEventId);
    }
  }, [open, action, rescheduledToEventId, initialDetails, step, loadPreview]);

  const handleDetailsNext = () => {
    if (!reasonValid) { toast.error('Pick a reason first'); return; }
    const details: CancelDetails = { action, scope: isRecurring ? scope : 'occurrence', reason, note: note.trim(), cancel_mode: action === 'cancel' ? cancelMode : 'standard' };
    if (action === 'reschedule' && !rescheduledToEventId) { onNeedNewEvent?.(details); return; }
    void loadPreview(details, rescheduledToEventId);
  };

  // Drain the server queue: each 'resume' pass sends up to the server's batch size
  // and only to rows still queued|failed, so this is safe to call any number of times.
  const drain = useCallback(async (first: Record<string, unknown> | null) => {
    let data = first ?? await invoke({ mode: 'resume', action });
    let sent = Number(data.sent_total ?? 0), remaining = Number(data.remaining ?? 0), failed = Number(data.failed_total ?? 0);
    setProgress({ sent, remaining, failed });
    let guard = 0;
    // 'failed' rows are retried by the server on each resume pass; stop when nothing is queued
    // and a pass made no progress (a persistently failing recipient must not loop forever).
    while (remaining > 0 && guard++ < 200) {
      const before = sent;
      data = await invoke({ mode: 'resume', action });
      sent = Number(data.sent_total ?? sent); remaining = Number(data.remaining ?? 0); failed = Number(data.failed_total ?? failed);
      setProgress({ sent, remaining, failed });
      if (sent === before && Number(data.sent ?? 0) === 0) break;
    }
  }, [invoke, action]);

  const handleSend = async () => {
    if (!preview) return;
    setStep('sending'); setBusy(true); setErr(null);
    const details: CancelDetails = { action, scope: isRecurring ? scope : 'occurrence', reason, note: note.trim(), cancel_mode: action === 'cancel' ? cancelMode : 'standard' };
    try {
      const data = await invoke({ mode: 'commit', action, scope: details.scope, reason: details.reason, note: details.note, cancel_mode: details.cancel_mode, rescheduled_to_event_id: rescheduledToEventId ?? undefined });
      await drain(data);
      setStep('done');
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
      setStep('preview');
    } finally { setBusy(false); }
  };

  // Resume-only entry (closed event with unsent emails): no details/preview, straight to the loop.
  const [resumeStarted, setResumeStarted] = useState(false);
  useEffect(() => { if (!open) setResumeStarted(false); }, [open]);
  useEffect(() => {
    if (!open || !resume || !event || resumeStarted) return;
    setResumeStarted(true);
    (async () => {
      setStep('sending'); setBusy(true); setErr(null);
      try { await drain(null); setStep('done'); onDone?.(); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Resume failed'); setStep('done'); }
      finally { setBusy(false); }
    })();
  }, [open, resume, event, resumeStarted, drain, onDone]);

  if (!event) return null;
  const verb = action === 'reschedule' ? 'Reschedule' : 'Cancel';
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy || step === 'done') onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="event-cancel-dialog">
        {step === 'details' && !resume && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">{action === 'reschedule' ? <CalendarClock className="w-5 h-5 text-primary" /> : <XCircle className="w-5 h-5 text-destructive" />}{verb} event</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{event.title}</span> &middot; {format(new Date(event.start_time), 'EEE, MMM d, yyyy h:mm a')}
                {action === 'reschedule'
                  ? ' - everyone will be emailed the new date with an RSVP link; all existing RSVPs are released and must be made again.'
                  : ' - every attendee will be emailed; the event stays on record as cancelled (not deleted).'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {isRecurring && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">This is a recurring event</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {([['occurrence', 'Just this date'], ['series', 'Entire series (upcoming dates only)']] as const).map(([v, label]) => (
                      <label key={v} className={`flex-1 flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm ${scope === v ? 'border-primary bg-primary/5' : 'border-border'}`}>
                        <input type="radio" name="cancelScope" value={v} checked={scope === v} onChange={() => setScope(v)} className="accent-primary" data-testid={`scope-${v}`} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reason <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  {CANCEL_REASONS.map((r) => (
                    <label key={r} className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer text-sm ${reasonPick === r ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <input type="radio" name="cancelReason" value={r} checked={reasonPick === r} onChange={() => setReasonPick(r)} className="accent-primary" data-testid={`reason-${r.replace(/\s+/g, '-').toLowerCase()}`} />
                      {r}
                    </label>
                  ))}
                </div>
                {reasonPick === 'Other' && (
                  <input value={reasonOther} onChange={(e) => setReasonOther(e.target.value)} placeholder="Describe the reason (shown in the email)" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" data-testid="reason-other-text" />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancelNote" className="text-sm font-medium">Custom note <span className="text-muted-foreground font-normal">(optional, shown in the email)</span></Label>
                <Textarea id="cancelNote" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={action === 'reschedule' ? 'e.g. The venue double-booked us - same plan, new night.' : 'e.g. The forecast calls for storms all afternoon.'} className="resize-none" data-testid="cancel-note" />
                {action === 'cancel' && (
                  <p className="text-xs text-muted-foreground" data-testid="cancel-note-hint">{CANCEL_NOTE_HINT}</p>
                )}
              </div>
              {action === 'cancel' && (
                <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer text-sm" data-testid="cancel-mode-not-hosting">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={cancelMode === 'not_hosting'}
                    onChange={(e) => setCancelMode(e.target.checked ? 'not_hosting' : 'standard')}
                  />
                  <span>
                    <span className="font-medium">704 not hosting - keep event up + discussion open until it ends</span>
                    <span className="block text-muted-foreground mt-1">RSVPs are still released and calendars still cancel. The event stays on the list with a red CANCELLED prefix and the discussion stays open until the end time.</span>
                  </span>
                </label>
              )}
              {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Back</Button>
              <Button variant={action === 'reschedule' ? 'default' : 'destructive'} onClick={handleDetailsNext} disabled={!reasonValid || busy} data-testid="cancel-next">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {action === 'reschedule' && !rescheduledToEventId ? 'Continue to new event' : 'Preview email'}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'preview' && preview && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> Preview - {verb.toLowerCase()} {preview.affected.length > 1 ? `${preview.affected.length} dates` : 'event'}</DialogTitle>
              <DialogDescription>Nothing has been sent yet. Review, then confirm.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-lg border border-border p-3 space-y-1" data-testid="preview-cancel-mode">
                <p className="font-medium">Mode</p>
                <p className="text-muted-foreground">
                  {(preview.cancel_mode ?? cancelMode) === 'not_hosting'
                    ? '704 not hosting — event stays visible and the discussion stays open until the end time.'
                    : 'Standard cancel — hidden from lists and the discussion closes.'}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="font-medium">Affected date{preview.affected.length > 1 ? 's' : ''}</p>
                <ul className="list-disc list-inside text-muted-foreground" data-testid="preview-affected">
                  {preview.affected.map((a) => <li key={a.id}>{a.title} - {format(new Date(a.start_time), 'EEE, MMM d, yyyy h:mm a')}{a.status !== 'scheduled' ? ` (already ${a.status})` : ''}</li>)}
                </ul>
                {preview.target && <p className="pt-1 text-foreground">New date: <strong>{preview.target.title}</strong> - {format(new Date(preview.target.start_time), 'EEE, MMM d, yyyy h:mm a')}</p>}
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="font-medium" data-testid="preview-recipient-count">{preview.recipient_count} {preview.recipient_count === 1 ? 'person' : 'people'} will be emailed</p>
                <p className="text-muted-foreground max-h-28 overflow-y-auto" data-testid="preview-recipients">
                  {preview.recipients.map((r) => {
                    const cta = showCancelDiscussionCta(preview.cancel_mode ?? cancelMode, r.kinds ?? []);
                    return `${r.name} <${r.email}>${r.event_count > 1 ? ` x${r.event_count}` : ''}${cta ? ' [Open the discussion]' : ''}`;
                  }).join(', ') || 'No one holds a spot on this event.'}
                </p>
              </div>
              {preview.paid.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-1" data-testid="preview-paid">
                  <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> {preview.paid.length} paid ticket{preview.paid.length > 1 ? 's' : ''} - nothing is refunded automatically</p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {preview.paid.map((p, i) => <li key={i}>{p.name || p.email || 'Unknown'}{p.email && p.name ? ` <${p.email}>` : ''} - {money(p.amount_cents)} ({p.via})</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground">Refund each one from the admin refund tool when you are ready.</p>
                </div>
              )}
              {preview.eventbrite_reminder.length > 0 && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3" data-testid="preview-eventbrite">
                  <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Also published on Eventbrite</p>
                  <p className="text-muted-foreground">Remember to {action === 'reschedule' ? 'update or cancel' : 'cancel'} it on Eventbrite too: {preview.eventbrite_reminder.map((e) => e.title).join(', ')}.</p>
                </div>
              )}
              <div className="rounded-lg border border-border overflow-hidden">
                <p className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  {(preview.cancel_mode ?? cancelMode) === 'not_hosting' ? 'Member email' : 'Email preview'} - subject: <span className="normal-case text-foreground">{preview.email.subject}</span>
                </p>
                <iframe title="Email preview" srcDoc={preview.email.html} className="w-full h-[380px] bg-white" sandbox="" data-testid="preview-email" />
              </div>
              {(preview.cancel_mode ?? cancelMode) === 'not_hosting' && preview.email_public && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <p className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground border-b border-border">Public RSVP email (no discussion button) - subject: <span className="normal-case text-foreground">{preview.email_public.subject}</span></p>
                  <iframe title="Public email preview" srcDoc={preview.email_public.html} className="w-full h-[380px] bg-white" sandbox="" data-testid="preview-email-public" />
                </div>
              )}
              {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setStep('details'); setPreview(null); }} disabled={busy}>Back</Button>
              <Button variant={action === 'reschedule' ? 'default' : 'destructive'} onClick={handleSend} disabled={busy} data-testid="cancel-send">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Send to {preview.recipient_count} {preview.recipient_count === 1 ? 'person' : 'people'} &amp; {action === 'reschedule' ? 'reschedule' : 'cancel'}
              </Button>
            </DialogFooter>
          </>
        )}

        {(step === 'sending' || (step === 'details' && resume)) && (
          <div className="py-10 text-center space-y-3">
            <DialogTitle className="sr-only">{resume ? 'Resuming sending' : 'Sending'}</DialogTitle>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="font-medium">{resume ? 'Resuming…' : 'Sending…'}</p>
            {progress && <p className="text-sm text-muted-foreground" data-testid="send-progress">{progress.sent} sent &middot; {progress.remaining} remaining{progress.failed ? ` · ${progress.failed} failed` : ''}</p>}
          </div>
        )}

        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle>{resume ? 'Sending resumed' : action === 'reschedule' ? 'Event rescheduled' : 'Event cancelled'}</DialogTitle>
              <DialogDescription data-testid="cancel-done">
                {err ? <span className="text-destructive">{err} </span> : null}
                {progress?.sent ?? 0} email{(progress?.sent ?? 0) === 1 ? '' : 's'} sent in total{progress?.failed ? `, ${progress.failed} still failed (use "Resume sending" on this event to retry only those)` : ''}.
                {resume ? '' : ` RSVPs released${action === 'reschedule' ? ' - everyone was pointed at the new date.' : '.'}`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter><Button onClick={() => onOpenChange(false)} data-testid="cancel-done-close">Done</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
