'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { submitPartnerEventInquiry, type PartnerInquiryType } from '@/app/actions/partnerPortalActions';
import { Loader2 } from 'lucide-react';

export type InquiryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inquiryType: PartnerInquiryType;
  event: { id: string; title: string } | null;
};

const SPONSOR_OPTIONS = [
  { id: 'booth', label: 'Booth space' },
  { id: 'banner', label: 'Banner placement' },
  { id: 'social', label: 'Social media mention' },
  { id: 'clt_bucketlist', label: 'CLTBucketlist coverage' },
] as const;

export function InquiryModal({ open, onOpenChange, inquiryType, event }: InquiryModalProps) {
  const [message, setMessage] = useState('');
  const [vendorSetup, setVendorSetup] = useState('');
  const [vendorSells, setVendorSells] = useState('');
  const [vendorOther, setVendorOther] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueCapacity, setVenueCapacity] = useState('');
  const [venueHours, setVenueHours] = useState('');
  const [venueOther, setVenueOther] = useState('');
  const [amount, setAmount] = useState('');
  const [sponsorPicks, setSponsorPicks] = useState<Record<string, boolean>>({});
  const [sponsorCustom, setSponsorCustom] = useState('');
  const [neConcept, setNeConcept] = useState('');
  const [neDates, setNeDates] = useState('');
  const [neAttendance, setNeAttendance] = useState('');
  const [neBudget, setNeBudget] = useState('');
  const [neOther, setNeOther] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const eventLabel = event?.title ?? 'New Event Suggestion';

  function reset() {
    setMessage('');
    setVendorSetup('');
    setVendorSells('');
    setVendorOther('');
    setVenueAddress('');
    setVenueCapacity('');
    setVenueHours('');
    setVenueOther('');
    setAmount('');
    setSponsorPicks({});
    setSponsorCustom('');
    setNeConcept('');
    setNeDates('');
    setNeAttendance('');
    setNeBudget('');
    setNeOther('');
  }

  async function onSubmit() {
    if (!message.trim()) {
      toast.error('Please add a message');
      return;
    }
    setSubmitting(true);
    const sponsorReturns = SPONSOR_OPTIONS.filter((o) => sponsorPicks[o.id]).map((o) => o.id);
    const res = await submitPartnerEventInquiry({
      inquiryType,
      eventId: event?.id ?? null,
      message: message.trim(),
      vendorSetupSpace: vendorSetup,
      vendorSells: vendorSells,
      vendorOther: vendorOther,
      venueAddress,
      venueCapacity: venueCapacity ? parseInt(venueCapacity, 10) : null,
      venueHours,
      venueOther,
      amountOffering: amount ? parseFloat(amount) : null,
      sponsorReturns,
      sponsorCustom,
      newEventConcept: neConcept,
      newEventDateRange: neDates,
      newEventAttendance: neAttendance,
      newEventBudget: neBudget,
      newEventOther: neOther,
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Inquiry submitted');
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-white/10 bg-[#141414] text-white">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {inquiryType === 'vendor' && 'Vendor inquiry'}
            {inquiryType === 'venue' && 'Venue / host inquiry'}
            {inquiryType === 'sponsor' && 'Sponsor inquiry'}
            {inquiryType === 'new_event' && 'New event suggestion'}
          </DialogTitle>
          <p className="text-sm text-white/50 pt-1">
            {event ? <>Event: <span className="text-white/80">{event.title}</span></> : eventLabel}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce your idea or question for the 704 Collective team"
              className="min-h-[100px] bg-white/5 border-white/10"
            />
          </div>

          {inquiryType === 'vendor' && (
            <>
              <div className="space-y-2">
                <Label>Desired setup space</Label>
                <Input
                  value={vendorSetup}
                  onChange={(e) => setVendorSetup(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>What you sell</Label>
                <Input
                  value={vendorSells}
                  onChange={(e) => setVendorSells(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Other information</Label>
                <Textarea
                  value={vendorOther}
                  onChange={(e) => setVendorOther(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </>
          )}

          {inquiryType === 'venue' && (
            <>
              <div className="space-y-2">
                <Label>Venue address</Label>
                <Input
                  value={venueAddress}
                  onChange={(e) => setVenueAddress(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Venue capacity</Label>
                <Input
                  type="number"
                  min={0}
                  value={venueCapacity}
                  onChange={(e) => setVenueCapacity(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Available hours</Label>
                <Input
                  value={venueHours}
                  onChange={(e) => setVenueHours(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Other information</Label>
                <Textarea
                  value={venueOther}
                  onChange={(e) => setVenueOther(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </>
          )}

          {inquiryType === 'sponsor' && (
            <>
              <div className="space-y-2">
                <Label>Amount offering</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>What you want in return</Label>
                <div className="space-y-2 rounded-lg border border-white/10 p-3 bg-white/[0.03]">
                  {SPONSOR_OPTIONS.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={!!sponsorPicks[o.id]}
                        onCheckedChange={(c) =>
                          setSponsorPicks((prev) => ({ ...prev, [o.id]: c === true }))
                        }
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Custom details</Label>
                <Textarea
                  value={sponsorCustom}
                  onChange={(e) => setSponsorCustom(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </>
          )}

          {inquiryType === 'new_event' && (
            <>
              <div className="space-y-2">
                <Label>Event concept</Label>
                <Textarea
                  value={neConcept}
                  onChange={(e) => setNeConcept(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Preferred date range</Label>
                <Input
                  value={neDates}
                  onChange={(e) => setNeDates(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Expected attendance</Label>
                <Input
                  value={neAttendance}
                  onChange={(e) => setNeAttendance(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Budget</Label>
                <Input
                  value={neBudget}
                  onChange={(e) => setNeBudget(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-2">
                <Label>Other information</Label>
                <Textarea
                  value={neOther}
                  onChange={(e) => setNeOther(e.target.value)}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" className="text-white/60" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-[#C6A664] text-black hover:bg-[#d4b87a]"
            disabled={submitting}
            onClick={onSubmit}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit inquiry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
