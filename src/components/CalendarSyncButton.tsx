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

  if (variant === 'cta') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-card/50 cursor-pointer hover:bg-card transition-colors">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Sync to Calendar</p>
                <p className="text-xs text-muted-foreground">Get event reminders on your phone</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">Subscribe →</span>
          </div>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-56 p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Choose how to subscribe</p>
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
