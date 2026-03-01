'use client';

import { useState } from 'react';
import { Calendar, Copy, Check, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface CalendarSubscriptionProps {
  calendarToken: string;
  baseUrl: string;
}

export function CalendarSubscription({ calendarToken, baseUrl }: CalendarSubscriptionProps) {
  const [copied, setCopied] = useState(false);
  
  const webcalUrl = `webcal://${baseUrl.replace(/^https?:\/\//, '')}/functions/v1/calendar-feed?token=${calendarToken}`;
  const httpsUrl = `${baseUrl}/functions/v1/calendar-feed?token=${calendarToken}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      toast.success('Calendar URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  const openWebcal = () => {
    window.location.href = webcalUrl;
  };

  return (
    <div className="card-elevated p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">Calendar Subscription</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">Stay updated with all events</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs sm:text-sm text-muted-foreground">
          Subscribe to see all 704 Collective events in your calendar app automatically.
        </p>

        {/* URL Display - with proper text wrapping */}
        <div className="relative">
          <div className="p-2 sm:p-3 rounded-lg bg-muted/50 border border-border overflow-hidden">
            <code 
              className="text-xs text-muted-foreground block"
              style={{ 
                wordBreak: 'break-all', 
                overflowWrap: 'anywhere',
                hyphens: 'auto'
              }}
            >
              {httpsUrl}
            </code>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <Button onClick={copyToClipboard} variant="outline" className="w-full text-sm">
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy Link
              </>
            )}
          </Button>
          <Button onClick={openWebcal} variant="default" className="w-full text-sm">
            <Smartphone className="w-4 h-4" />
            Add to Calendar
          </Button>
        </div>

        {/* Instructions */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>How to use:</strong> Click "Add to Calendar" to open in your default calendar app, 
            or copy the link and paste it into your calendar app's "Subscribe to Calendar" feature.
          </p>
        </div>
      </div>
    </div>
  );
}
