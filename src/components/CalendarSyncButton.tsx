'use client';

import { useState } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { markOnboardingCalendarDone } from '@/lib/onboardingStorage';
import {
  getCalendarHttpsFeedUrl,
  getCalendarWebcalFeedUrl,
  getGoogleCalendarSubscribeUrl,
  getOutlookCalendarSubscribeUrl,
} from '@/lib/calendarSubscriptionUrls';

interface CalendarSyncButtonProps {
  calendarToken: string;
  baseUrl: string;
  variant?: 'icon' | 'cta';
  /** When set, marks onboarding “calendar” step complete after subscribe/copy. */
  userId?: string;
}

export function CalendarSyncButton({ calendarToken, baseUrl, variant = 'icon', userId }: CalendarSyncButtonProps) {
  const [copied, setCopied] = useState(false);

  const httpsUrl = getCalendarHttpsFeedUrl(baseUrl, calendarToken);
  const webcalUrl = getCalendarWebcalFeedUrl(baseUrl, calendarToken);
  const googleUrl = getGoogleCalendarSubscribeUrl(baseUrl, calendarToken);
  const outlookUrl = getOutlookCalendarSubscribeUrl(baseUrl, calendarToken);

  const markDone = () => {
    if (userId) markOnboardingCalendarDone(userId);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      markDone();
      toast.success('Calendar feed URL copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const openNewTab = (url: string) => {
    markDone();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const ProviderButtons = ({ className = '' }: { className?: string }) => (
    <div className={`space-y-2 ${className}`}>
      <p className="text-xs font-medium text-muted-foreground">Subscribe in your app</p>
      <Button
        type="button"
        onClick={() => openNewTab(googleUrl)}
        variant="default"
        size="sm"
        className="w-full justify-center gap-2 bg-[#4285F4] text-white hover:bg-[#4285F4]/90 border-0"
      >
        <span className="font-semibold">G</span>
        Google Calendar
      </Button>
      <Button
        type="button"
        onClick={() => openNewTab(webcalUrl)}
        variant="default"
        size="sm"
        className="w-full justify-center gap-2 bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-700"
      >
        Apple Calendar
      </Button>
      <Button
        type="button"
        onClick={() => openNewTab(outlookUrl)}
        variant="default"
        size="sm"
        className="w-full justify-center gap-2 bg-[#0078D4] text-white hover:bg-[#0078D4]/90 border-0"
      >
        Outlook
      </Button>
      <Button onClick={() => void copyToClipboard()} variant="outline" size="sm" className="w-full text-sm">
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied!' : 'Copy feed URL'}
      </Button>
    </div>
  );

  if (variant === 'cta') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card/50 cursor-pointer hover:bg-card transition-colors">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Sync to Calendar</p>
                <p className="text-xs text-muted-foreground">RSVP&apos;d events only — Google, Apple, or Outlook</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">Subscribe →</span>
          </div>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-64 p-3">
          <ProviderButtons />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                <Calendar className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Sync to Calendar</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" className="w-64 p-3">
        <ProviderButtons />
      </PopoverContent>
    </Popover>
  );
}
