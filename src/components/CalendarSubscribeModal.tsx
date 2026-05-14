'use client';

import { useState } from 'react';
import { Copy, Check, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { markOnboardingCalendarDone } from '@/lib/onboardingStorage';
import {
  type CalendarScope,
  getCalendarHttpsFeedUrl,
  getCalendarWebcalFeedUrl,
  getGoogleCalendarSubscribeUrl,
  getOutlookCalendarSubscribeUrl,
} from '@/lib/calendarSubscriptionUrls';

const SCOPE_LABEL: Record<CalendarScope, string> = {
  social: 'Social Events',
  business: 'Business Events',
  all: 'All Events',
  rsvp_only: 'My RSVPs',
};

interface CalendarSubscribeModalProps {
  open: boolean;
  onClose: () => void;
  scope: CalendarScope;
  token: string;
  baseUrl: string;
  userId?: string;
}

export function CalendarSubscribeModal({ open, onClose, scope, token, baseUrl, userId }: CalendarSubscribeModalProps) {
  const [copied, setCopied] = useState(false);

  const httpsUrl = getCalendarHttpsFeedUrl(baseUrl, token, scope);
  const webcalUrl = getCalendarWebcalFeedUrl(baseUrl, token, scope);
  const googleUrl = getGoogleCalendarSubscribeUrl(baseUrl, token, scope);
  const outlookUrl = getOutlookCalendarSubscribeUrl(baseUrl, token, scope);

  const markDone = () => {
    if (userId) markOnboardingCalendarDone(userId);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      markDone();
      toast.success('Feed URL copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const openNewTab = (url: string) => {
    markDone();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4" />
            Subscribe to {SCOPE_LABEL[scope]}
          </DialogTitle>
          <DialogDescription>
            All 704 {SCOPE_LABEL[scope].toLowerCase()} will appear in your calendar app automatically. No need to RSVP first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Button
            type="button"
            onClick={() => openNewTab(webcalUrl)}
            variant="default"
            className="w-full justify-center gap-2 bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-700"
          >
            Open in Calendar app
          </Button>

          <div className="text-center text-xs text-muted-foreground">— or pick your provider —</div>

          <Button
            type="button"
            onClick={() => openNewTab(googleUrl)}
            variant="default"
            className="w-full justify-center gap-2 bg-[#4285F4] text-white hover:bg-[#4285F4]/90 border-0"
          >
            <span className="font-semibold">G</span>
            Google Calendar
          </Button>

          <Button
            type="button"
            onClick={() => openNewTab(outlookUrl)}
            variant="default"
            className="w-full justify-center gap-2 bg-[#0078D4] text-white hover:bg-[#0078D4]/90 border-0"
          >
            Outlook
          </Button>

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Or copy the feed URL manually:</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={httpsUrl}
                className="flex-1 text-xs px-2 py-1.5 rounded border bg-muted/30 font-mono truncate"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button onClick={() => void copyToClipboard()} variant="outline" size="sm">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
