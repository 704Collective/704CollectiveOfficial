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

const AMBASSADOR_TYPES = [
  { value: 'locator', label: 'Locator (default)' },
  { value: 'member', label: 'Member' },
  { value: 'partner', label: 'Partner' },
];

export function NewAmbassadorDialog({ open, onOpenChange, onCreated }: NewAmbassadorDialogProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('locator');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFullName('');
      setEmail('');
      setCode('');
      setType('locator');
      setSubmitting(false);
    }
  }, [open]);

  const codeUpper = code.trim().toUpperCase();
  const codeValid = CODE_RE.test(codeUpper);
  const emailValid = EMAIL_RE.test(email.trim());
  const nameValid = fullName.trim().length > 0;

  const canSubmit = !submitting && nameValid && emailValid && codeValid;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await createAmbassador({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        referral_code: codeUpper,
        type,
      });
      if (!r.ok) {
        console.error('[NewAmbassadorDialog] createAmbassador returned:', r);
        toast.error(r.error ? r.error : 'Server action returned ok:false with no error message');
        return;
      }
      toast.success(`Invite sent to ${email.trim().toLowerCase()}`);
      onCreated?.(r.ambassador_id);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite ambassador</DialogTitle>
          <DialogDescription>
            Send a branded invite link. The ambassador completes their profile on first login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="amb-name">Full Name *</Label>
            <Input
              id="amb-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Adam Smith"
              autoComplete="off"
            />
            {fullName.length > 0 && !nameValid && (
              <p className="text-xs text-destructive mt-1">Full name is required.</p>
            )}
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
                  ? <><span>Ambassadors will share: </span><span className="font-mono font-semibold text-amber-500">{codeUpper}</span></>
                  : <span className="text-destructive">Use 3–32 uppercase letters or digits — no spaces or symbols.</span>}
            </p>
          </div>

          <div>
            <Label htmlFor="amb-type">Type</Label>
            <select
              id="amb-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {AMBASSADOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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
                Sending invite…
              </>
            ) : (
              'Send invite'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
