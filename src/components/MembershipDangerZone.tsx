'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';
import { format } from 'date-fns';

interface MembershipDangerZoneProps {
  userId: string;
  isActiveMember: boolean;
  hasStripeSubscription: boolean;
  hasStripeCustomer: boolean;
  /** True when the member's access is granted via admin override (no real Stripe sub). */
  membershipOverride?: boolean;
}

type SurveyStep = 'confirm' | 'survey' | 'done';
type WouldRejoin = 'yes' | 'no' | 'maybe' | null;

/** cancel-subscription's structured result (every success path carries immediate + ends_at). */
type CancelResult = {
  success?: boolean;
  error?: string;
  immediate?: boolean;
  ends_at?: string | null;
  removed_rsvps?: Array<{ event_id: string; title: string | null; start_time: string | null }>;
};

const CANCEL_REASONS = [
  'Too expensive',
  'Not enough events',
  'Moving away from Charlotte',
  'Taking a break',
  'Other',
] as const;

const CANCEL_FAILED_MESSAGE =
  'Your cancellation did NOT go through - please try again or email hello@704collective.com';

export function MembershipDangerZone({ userId, isActiveMember, hasStripeSubscription, hasStripeCustomer, membershipOverride = false }: MembershipDangerZoneProps) {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [step, setStep] = useState<SurveyStep>('confirm');
  const [cancelConfirmation, setCancelConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [lastWithSurvey, setLastWithSurvey] = useState(false);
  // Period-end success state (shown in-dialog; the member stays on settings).
  const [doneResult, setDoneResult] = useState<CancelResult | null>(null);

  // Survey state
  const [surveyReason, setSurveyReason] = useState<string | null>(null);
  const [surveyFeedback, setSurveyFeedback] = useState('');
  const [surveyWouldRejoin, setSurveyWouldRejoin] = useState<WouldRejoin>(null);

  const resetDialog = () => {
    setStep('confirm');
    setCancelConfirmation('');
    setSurveyReason(null);
    setSurveyFeedback('');
    setSurveyWouldRejoin(null);
    setDoneResult(null);
  };

  const openDialog = () => {
    resetDialog();
    setCancelFailed(false);
    setCancelDialogOpen(true);
  };

  const closeDialog = () => {
    const wasDone = step === 'done';
    setCancelDialogOpen(false);
    resetDialog();
    if (wasDone) void refreshProfile();
  };

  /** Persist survey after a confirmed cancel (best-effort, non-blocking). */
  const saveSurvey = async (withAnswers: boolean) => {
    if (!withAnswers) return;
    try {
      await supabase.from('cancellation_surveys').insert({
        profile_id: userId,
        reason: surveyReason,
        feedback: surveyFeedback.trim() || null,
        would_rejoin:
          surveyWouldRejoin === 'yes' ? true
          : surveyWouldRejoin === 'no' ? false
          : null,
      });
    } catch {
      // non-blocking
    }
  };

  const executeCancellation = async (withSurvey: boolean) => {
    setLoading(true);
    setCancelFailed(false);
    setLastWithSurvey(withSurvey);
    try {
      // All cancels go through the edge function (Stripe or profile-only).
      const { data, error } = await supabase.functions.invoke('cancel-subscription');
      if (error) throw error;
      const result = (data ?? {}) as CancelResult;
      if (result.error) throw new Error(result.error);

      // Survey only after confirmed success — never evidence of a failed cancel.
      void saveSurvey(withSurvey);

      if (result.immediate !== false) {
        // Access ended now (no Stripe customer / nothing live in Stripe): the
        // membership-ended page is the truth for these members.
        router.push('/membership-ended');
        return;
      }
      // Period-end cancel: access continues until ends_at. Stay here and say so.
      // The profile refresh (which makes the parent hide this Danger Zone and
      // flips status to "Ends <date>") runs when the member closes the dialog,
      // so the success state is readable first.
      setDoneResult(result);
      setStep('done');
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { feature: 'membership-cancel' },
        extra: { userId, hasStripeCustomer, membershipOverride },
      });
      setCancelFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmNext = () => {
    if (cancelConfirmation !== 'CANCEL') {
      toast.error('Please type CANCEL to confirm');
      return;
    }
    setStep('survey');
  };

  const handleSurveySubmit = () => executeCancellation(true);
  const handleSkipSurvey = () => executeCancellation(false);
  const handleRetryCancel = () => executeCancellation(lastWithSurvey);

  // Show for active Stripe subscribers OR admin-override members. Once a
  // period-end cancel has succeeded the parent hides this component on the next
  // profile refresh; keep rendering while the success dialog is open so the
  // member can read it.
  if ((!isActiveMember || (!hasStripeSubscription && !membershipOverride)) && !(cancelDialogOpen && step === 'done')) return null;

  const endsLabel = doneResult?.ends_at ? format(new Date(doneResult.ends_at), 'MMMM d, yyyy') : null;
  const removed = (doneResult?.removed_rsvps ?? []).filter((r) => r && r.title);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm font-medium">Danger Zone</span>
      </div>

      <Button variant="destructive" className="w-full sm:w-auto" onClick={openDialog}>
        <X className="w-4 h-4 mr-2" />
        Cancel Membership
      </Button>

      {cancelFailed && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 space-y-3"
        >
          <p className="text-sm font-medium text-destructive">{CANCEL_FAILED_MESSAGE}</p>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRetryCancel}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Retrying…</>
            ) : (
              'Try Again'
            )}
          </Button>
        </div>
      )}

      {/* ── Dialog ────────────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">

          {/* ── Step 1: Confirm intent ── */}
          {step === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-destructive">Cancel Membership</DialogTitle>
                <DialogDescription>
                  {membershipOverride && !hasStripeSubscription
                    ? 'Your membership ends as soon as you confirm. You will not be charged anything further.'
                    : "Your membership stays active until the end of the period you've already paid for. You will not be charged again."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm" data-testid="cancel-what-ends">
                  <p className="font-medium text-destructive mb-2">
                    {membershipOverride && !hasStripeSubscription ? 'When you confirm, you lose:' : 'When your paid period ends, you lose:'}
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Free access to all events</li>
                    <li>Member-only experiences</li>
                    <li>Your digital membership card</li>
                    <li>Calendar subscription</li>
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {membershipOverride && !hasStripeSubscription
                      ? 'Any RSVPs you hold for upcoming events will be released.'
                      : 'RSVPs for events after that date will be released; everything before it stays yours.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cancelConfirm">
                    Type <strong>CANCEL</strong> to confirm
                  </Label>
                  <Input
                    id="cancelConfirm"
                    value={cancelConfirmation}
                    onChange={(e) => setCancelConfirmation(e.target.value)}
                    placeholder="Type CANCEL"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>Keep Membership</Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmNext}
                  disabled={cancelConfirmation !== 'CANCEL'}
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Step 2: Survey ── */}
          {step === 'survey' && (
            <>
              <DialogHeader>
                <DialogTitle>Before you go…</DialogTitle>
                <DialogDescription>
                  Your feedback helps us improve 704 Collective. This takes 30 seconds and is optional.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {cancelFailed && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 space-y-2"
                  >
                    <p className="text-sm font-medium text-destructive">{CANCEL_FAILED_MESSAGE}</p>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleRetryCancel}
                      disabled={loading}
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Retrying…</>
                      ) : (
                        'Try Again'
                      )}
                    </Button>
                  </div>
                )}

                {/* Q1 - reason */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Why are you cancelling?</Label>
                  <div className="space-y-2">
                    {CANCEL_REASONS.map((r) => (
                      <label key={r} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name="cancelReason"
                          value={r}
                          checked={surveyReason === r}
                          onChange={() => setSurveyReason(r)}
                          className="accent-primary"
                        />
                        {r}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Q2 - feedback */}
                <div className="space-y-2">
                  <Label htmlFor="surveyFeedback" className="text-sm font-medium">
                    Any feedback for us? <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Textarea
                    id="surveyFeedback"
                    rows={3}
                    value={surveyFeedback}
                    onChange={(e) => setSurveyFeedback(e.target.value)}
                    placeholder="Tell us what we could do better…"
                    className="resize-none"
                  />
                </div>

                {/* Q3 - would rejoin */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Would you consider rejoining in the future?</Label>
                  <div className="flex gap-3">
                    {(['yes', 'no', 'maybe'] as WouldRejoin[]).map((v) => (
                      <label key={v!} className="flex items-center gap-1.5 cursor-pointer text-sm capitalize">
                        <input
                          type="radio"
                          name="wouldRejoin"
                          value={v!}
                          checked={surveyWouldRejoin === v}
                          onChange={() => setSurveyWouldRejoin(v)}
                          className="accent-primary"
                        />
                        {v}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={handleSkipSurvey} disabled={loading} className="w-full sm:w-auto">
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Skip & Cancel
                </Button>
                <Button variant="destructive" onClick={handleSurveySubmit} disabled={loading} className="w-full sm:w-auto">
                  {loading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Cancelling…</>
                  ) : (
                    'Submit & Cancel'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Step 3: Period-end success (member stays on settings) ── */}
          {step === 'done' && (
            <>
              <DialogHeader>
                <DialogTitle>Your membership is cancelled</DialogTitle>
                <DialogDescription data-testid="cancel-done-copy">
                  {endsLabel
                    ? <>You keep full access until <strong>{endsLabel}</strong>. No further charges.</>
                    : <>You keep full access until the end of your paid period. No further charges.</>}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2 text-sm text-muted-foreground">
                <p>A confirmation is on its way to your inbox. Until then nothing changes - events, the directory and your digital card all keep working.</p>
                {removed.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3" data-testid="cancel-removed-rsvps">
                    <p className="font-medium text-foreground mb-1">
                      {removed.length === 1 ? 'One RSVP was for an event after that date, so we released it:' : `${removed.length} RSVPs were for events after that date, so we released them:`}
                    </p>
                    <ul className="list-disc list-inside space-y-0.5">
                      {removed.map((r) => (
                        <li key={r.event_id}>
                          {r.title}
                          {r.start_time ? <span className="text-muted-foreground/70"> - {format(new Date(r.start_time), 'MMM d')}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs">Change your mind before then? Reactivate from Manage Billing and nothing is lost.</p>
              </div>

              <DialogFooter>
                <Button onClick={closeDialog} className="w-full sm:w-auto" data-testid="cancel-done-close">Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
