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
import { toast } from 'sonner';
import * as Sentry from '@sentry/nextjs';

interface MembershipDangerZoneProps {
  userId: string;
  isActiveMember: boolean;
  hasStripeSubscription: boolean;
  hasStripeCustomer: boolean;
  /** True when the member's access is granted via admin override (no real Stripe sub). */
  membershipOverride?: boolean;
}

type SurveyStep = 'confirm' | 'survey';
type WouldRejoin = 'yes' | 'no' | 'maybe' | null;

const CANCEL_REASONS = [
  'Too expensive',
  'Not enough events',
  'Moving away from Charlotte',
  'Taking a break',
  'Other',
] as const;

export function MembershipDangerZone({ userId, isActiveMember, hasStripeSubscription, hasStripeCustomer, membershipOverride = false }: MembershipDangerZoneProps) {
  const router = useRouter();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [step, setStep] = useState<SurveyStep>('confirm');
  const [cancelConfirmation, setCancelConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

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
  };

  const openDialog = () => {
    resetDialog();
    setCancelDialogOpen(true);
  };

  const closeDialog = () => {
    setCancelDialogOpen(false);
    resetDialog();
  };

  /** Persist survey (best-effort, non-blocking). */
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
    try {
      await saveSurvey(withSurvey);

      if (hasStripeCustomer) {
        // Real Stripe subscription — cancel via edge function
        const { data, error } = await supabase.functions.invoke('cancel-subscription');
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else {
        // No Stripe customer at all (pure comp account) — cancel by updating profile directly
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: 'canceled',
            membership_override: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);
        if (error) throw error;
      }

      router.push('/membership-ended');
    } catch (err: unknown) {
      Sentry.captureException(err, { tags: { feature: 'membership-cancel' }, extra: { userId, hasStripeCustomer, membershipOverride } });
      const msg = err instanceof Error ? err.message : 'Failed to cancel membership';
      toast.error(msg);
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
  const handleSkipSurvey   = () => executeCancellation(false);

  // Show for active Stripe subscribers OR admin-override members
  if (!isActiveMember || (!hasStripeSubscription && !membershipOverride)) return null;

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

      {/* ── Dialog ────────────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">

          {/* ── Step 1: Confirm intent ── */}
          {step === 'confirm' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-destructive">Cancel Membership</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. You will lose access to all member benefits
                  including free event tickets and exclusive experiences.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                  <p className="font-medium text-destructive mb-2">You will lose:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>Free access to all events</li>
                    <li>Member-only experiences</li>
                    <li>Your digital membership card</li>
                    <li>Calendar subscription</li>
                  </ul>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
