'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { createAmbassador } from '@/app/actions/ambassadorActions';

interface NewAmbassadorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (ambassador_id: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Z0-9]{3,32}$/;

function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function NewAmbassadorDialog({ open, onOpenChange, onCreated }: NewAmbassadorDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [socialDollars, setSocialDollars] = useState('20');
  const [businessDollars, setBusinessDollars] = useState('125');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFullName('');
      setEmail('');
      setPhone('');
      setCode('');
      setSocialDollars('20');
      setBusinessDollars('125');
      setNotes('');
      setSubmitting(false);
    }
  }, [open]);

  const codeUpper = code.trim().toUpperCase();
  const codeValid = CODE_RE.test(codeUpper);
  const emailValid = EMAIL_RE.test(email.trim());
  const socialCents = Math.round(Number(socialDollars) * 100);
  const businessCents = Math.round(Number(businessDollars) * 100);

  const canSubmit =
    !submitting &&
    fullName.trim().length > 0 &&
    emailValid &&
    codeValid &&
    Number.isFinite(socialCents) && socialCents >= 0 &&
    Number.isFinite(businessCents) && businessCents >= 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await createAmbassador({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        referral_code: codeUpper,
        social_reward_cents: socialCents,
        business_reward_cents: businessCents,
        notes: notes.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Ambassador "${fullName.trim()}" created`);
      onCreated?.(r.ambassador_id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New ambassador</DialogTitle>
          <DialogDescription>
            Create a referral partner. Stripe Connect onboarding can be sent separately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amb-name">Full name</Label>
            <Input
              id="amb-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Adam Karras"
              autoComplete="off"
            />
          </div>

          <div>
            <Label htmlFor="amb-email">Email</Label>
            <Input
              id="amb-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="adam@example.com"
              autoComplete="off"
            />
            {email.length > 0 && !emailValid && (
              <p className="text-xs text-destructive mt-1">Enter a valid email address.</p>
            )}
          </div>

          <div>
            <Label htmlFor="amb-phone">Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="amb-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))}
              placeholder="(704) 555-0123"
              autoComplete="off"
            />
          </div>

          <div>
            <Label htmlFor="amb-code">Referral code</Label>
            <Input
              id="amb-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s+/g, '').toUpperCase())}
              placeholder="ADAM50"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {codeUpper.length === 0
                ? 'Letters and numbers only. 3–32 characters.'
                : codeValid
                  ? <>Ambassadors will share: <span className="font-mono font-semibold text-amber-500">{codeUpper}</span></>
                  : <span className="text-destructive">Use 3–32 uppercase letters or digits — no spaces or symbols.</span>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amb-social">Social reward ($)</Label>
              <Input
                id="amb-social"
                type="number"
                min={0}
                step="0.01"
                value={socialDollars}
                onChange={(e) => setSocialDollars(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Per social signup</p>
            </div>
            <div>
              <Label htmlFor="amb-business">Business reward ($)</Label>
              <Input
                id="amb-business"
                type="number"
                min={0}
                step="0.01"
                value={businessDollars}
                onChange={(e) => setBusinessDollars(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-1">Per business signup</p>
            </div>
          </div>

          <div>
            <Label htmlFor="amb-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              id="amb-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="How they were sourced, special arrangements, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              'Create ambassador'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
