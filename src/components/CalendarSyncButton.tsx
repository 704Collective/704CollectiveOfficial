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
      <div className="space-y-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button className="w-full py-4 text-lg font-bold bg-primary text-primary-foreground rounded-xl shadow-lg hover:scale-[1.02] transition-transform">
              <Calendar className="w-5 h-5 mr-2" />
              Subscribe to Calendar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 p-3 space-y-2">
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
        <p className="text-sm text-muted-foreground text-center">
          Sync to your phone to get automatic updates, location changes, and reminders for all 704 events.
        </p>
      </div>
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
