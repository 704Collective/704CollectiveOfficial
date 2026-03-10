'use client';

import { useState } from 'react';
import { Calendar, Copy, Check, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface CalendarSyncButtonProps {
  calendarToken: string;
  baseUrl: string;
  variant?: 'icon' | 'cta';
}

export function CalendarSyncButton({ calendarToken, baseUrl, variant = 'icon' }: CalendarSyncButtonProps) {
  const [copied, setCopied] = useState(false);

  const webcalUrl = `webcal://${baseUrl.replace(/^https?:\/\//, '')}/functions/v1/calendar-feed?token=${calendarToken}`;
  const httpsUrl = `${baseUrl}/functions/v1/calendar-feed?token=${calendarToken}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      toast.success('Calendar URL copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy URL');
    }
  };

  const openWebcal = () => {
    window.location.href = webcalUrl;
  };

  // CTA variant — quiet card row (matches Josh's design)
  if (variant === 'cta') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            id="calendar-section"
            className="w-full card-elevated rounded-xl p-3 flex items-center gap-3 text-left hover:bg-muted/50 transition-colors min-h-[44px]"
          >
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Subscribe to Calendar</p>
              <p className="text-xs text-muted-foreground">Auto-sync events to your phone</p>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Choose how to subscribe</p>
          <Button onClick={openWebcal} variant="default" size="sm" className="w-full text-sm min-h-[44px]">
            <Smartphone className="w-3.5 h-3.5" />
            Add to Calendar
          </Button>
          <Button onClick={copyToClipboard} variant="outline" size="sm" className="w-full text-sm min-h-[44px]">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
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
      <PopoverContent align="end" className="w-56 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground mb-2">Add events to your calendar</p>
        <Button onClick={openWebcal} variant="default" size="sm" className="w-full text-sm">
          <Smartphone className="w-3.5 h-3.5" />
          Add to Calendar
        </Button>
        <Button onClick={copyToClipboard} variant="outline" size="sm" className="w-full text-sm">
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied!' : 'Copy Link'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}