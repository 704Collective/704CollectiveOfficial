'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddWalkUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
  adminId: string;
  onCheckedIn: (name: string) => void;
}

export function AddWalkUpDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
  adminId,
  onCheckedIn,
}: AddWalkUpDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [attendeeType, setAttendeeType] = useState<'member' | 'non_member'>('non_member');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setAttendeeType('non_member');
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (email.trim() && !isValidEmail(email.trim())) {
      toast.error('Invalid email format');
      return;
    }
    if (attendeeType === 'member' && !email.trim()) {
      toast.error('Email required to look up a member');
      return;
    }
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      let userId: string | null = null;

      // Member lookup by email
      if (attendeeType === 'member') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, full_name')
          .ilike('email', email.trim())
          .is('deleted_at', null)
          .maybeSingle();
        if (!profile) {
          toast.error('No member account matches that email');
          setSubmitting(false);
          return;
        }
        userId = profile.id;
      }

      // Build ticket row
      const ticketRow: Record<string, unknown> = {
        event_id: eventId,
        status: 'confirmed',
        source: 'walk_in',
        amount_paid_cents: 0,
        checked_in_at: now,
        checked_in_by: adminId,
      };
      if (userId) {
        ticketRow.user_id = userId;
        ticketRow.ticket_type = 'member_free';
      } else {
        ticketRow.guest_name = name.trim();
        ticketRow.guest_email = email.trim() || null;
        ticketRow.ticket_type = 'public_free';
        if (phone.trim()) {
          ticketRow.metadata = { phone: phone.trim() };
        }
      }

      const { error: insertError } = await supabase.from('tickets').insert(ticketRow);

      if (insertError) {
        // 23505 = duplicate - person already has a ticket; check them in instead
        if ((insertError as { code?: string }).code === '23505') {
          let existingQuery = supabase
            .from('tickets')
            .select('id, checked_in_at')
            .eq('event_id', eventId)
            .neq('status', 'cancelled')
            .limit(1);
          if (userId) {
            existingQuery = existingQuery.eq('user_id', userId);
          } else if (email.trim()) {
            existingQuery = existingQuery.ilike('guest_email', email.trim());
          }
          const { data: existing } = await existingQuery.maybeSingle();
          if (existing) {
            if (existing.checked_in_at) {
              toast.info(`${name} is already checked in`);
              onCheckedIn(name);
              handleClose();
              return;
            }
            const { error: updateError } = await supabase
              .from('tickets')
              .update({ checked_in_at: now, checked_in_by: adminId })
              .eq('id', existing.id);
            if (updateError) {
              console.error('[AddWalkUp] update existing ticket failed', updateError);
              toast.error('Failed to check in - try refreshing');
              setSubmitting(false);
              return;
            }
            toast.success(`${name} - already had a ticket, checked in`);
            if (userId) {
              await supabase
                .from('profiles')
                .update({ last_attended_at: now })
                .eq('id', userId);
            }
            onCheckedIn(name);
            handleClose();
            return;
          }
        }
        // Other errors
        console.error('[AddWalkUp] insert failed', insertError);
        const errMsg = insertError.message || 'Unknown error';
        if (errMsg.includes('row-level security') || errMsg.includes('42501')) {
          toast.error('Permission denied. Check admin role.');
        } else {
          toast.error(`Failed to add walk-up: ${errMsg}`);
        }
        setSubmitting(false);
        return;
      }

      // Stamp last_attended_at for members
      if (userId) {
        await supabase
          .from('profiles')
          .update({ last_attended_at: now })
          .eq('id', userId);
      }

      toast.success(`${name} checked in as walk-up`);
      onCheckedIn(name);
      handleClose();
    } catch (err) {
      console.error('[AddWalkUp] unexpected error', err);
      toast.error('Something went wrong. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="w-full max-w-md mx-4 sm:mx-auto bg-[#1A1A1A] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Add Walk-up</DialogTitle>
          <DialogDescription className="text-white/60">
            Quick-add an attendee to{' '}
            <strong className="text-white">{eventTitle}</strong> and check them in immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-white/80">Attendee type</Label>
            <RadioGroup
              value={attendeeType}
              onValueChange={(v) => setAttendeeType(v as 'member' | 'non_member')}
              className="flex gap-4 mt-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="non_member" id="wup-non_member" className="border-white/30" />
                <Label htmlFor="wup-non_member" className="text-white/90 cursor-pointer font-normal">
                  Non-member walk-up
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="member" id="wup-member" className="border-white/30" />
                <Label htmlFor="wup-member" className="text-white/90 cursor-pointer font-normal">
                  Member (lookup by email)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="walkup-name" className="text-white/80">Full name *</Label>
            <Input
              id="walkup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 bg-white/5 border-white/10 text-white"
              placeholder="John Smith"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleSubmit(); }}
            />
          </div>

          <div>
            <Label htmlFor="walkup-email" className="text-white/80">
              Email {attendeeType === 'member' ? '*' : '(optional)'}
            </Label>
            <Input
              id="walkup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 bg-white/5 border-white/10 text-white"
              placeholder="john@example.com"
            />
          </div>

          {attendeeType === 'non_member' && (
            <div>
              <Label htmlFor="walkup-phone" className="text-white/80">Phone (optional)</Label>
              <Input
                id="walkup-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 bg-white/5 border-white/10 text-white"
                placeholder="(555) 123-4567"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="bg-transparent border-white/20 text-white hover:bg-white/10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            style={{ backgroundColor: '#C6A664', color: '#1A1A1A' }}
            className="hover:opacity-90"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</>
            ) : (
              'Add & Check In'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
