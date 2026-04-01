'use client';

import { useState, useEffect } from 'react';
import { Calendar, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getCalendarHttpsFeedUrl,
  getCalendarWebcalFeedUrl,
  getGoogleCalendarSubscribeUrl,
  getOutlookCalendarSubscribeUrl,
} from '@/lib/calendarSubscriptionUrls';
import { markOnboardingCalendarDone } from '@/lib/onboardingStorage';

export interface CalendarConnectPromptProps {
  /** When null, user can generate a token via "Set up calendar sync". */
  calendarToken: string | null;
  baseUrl: string;
  onDismiss: () => void;
  /** Called after a new token is created (e.g. refresh parent profile). */
  onTokenCreated?: (token: string) => void;
  userId?: string;
  /** Heading text */
  title?: string;
  /** Smaller layout for toast.custom */
  compact?: boolean;
}

function markDone(userId?: string) {
  if (userId) markOnboardingCalendarDone(userId);
}

export function CalendarConnectPrompt({
  calendarToken: initialToken,
  baseUrl,
  onDismiss,
  onTokenCreated,
  userId,
  title = 'Connect your calendar to automatically track your events',
  compact = false,
}: CalendarConnectPromptProps) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [ensuring, setEnsuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  const effectiveToken = token;
  const httpsUrl =
    effectiveToken && baseUrl ? getCalendarHttpsFeedUrl(baseUrl, effectiveToken) : '';
  const webcalUrl =
    effectiveToken && baseUrl ? getCalendarWebcalFeedUrl(baseUrl, effectiveToken) : '';
  const googleUrl =
    effectiveToken && baseUrl ? getGoogleCalendarSubscribeUrl(baseUrl, effectiveToken) : '';
  const outlookUrl =
    effectiveToken && baseUrl ? getOutlookCalendarSubscribeUrl(baseUrl, effectiveToken) : '';

  const openNewTab = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleEnsureToken = async () => {
    setError(null);
    setEnsuring(true);
    try {
      const res = await fetch('/api/calendar/ensure-token', {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not enable calendar sync');
        return;
      }
      if (data.token) {
        setToken(data.token);
        onTokenCreated?.(data.token);
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setEnsuring(false);
    }
  };

  const pad = compact ? 'p-3' : 'p-4';
  const gap = compact ? 'gap-2' : 'gap-3';

  return (
    <div
      className={`relative rounded-xl border border-border bg-card text-card-foreground shadow-lg ${pad} max-w-md`}
      role="region"
      aria-label="Calendar connection"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className={`flex ${compact ? 'gap-2' : 'gap-3'} pr-8`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C6A664]/15">
          <Calendar className="h-5 w-5 text-[#C6A664]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <p className={`font-medium text-foreground leading-snug ${compact ? 'text-sm' : 'text-sm sm:text-base'}`}>
            {title}
          </p>

          {!effectiveToken ? (
            <div className="space-y-2">
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <Button
                type="button"
                size={compact ? 'sm' : 'default'}
                className="bg-[#C6A664] text-[#1A1A1A] hover:bg-[#C6A664]/90"
                disabled={ensuring || !baseUrl}
                onClick={() => void handleEnsureToken()}
              >
                {ensuring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Set up calendar sync
              </Button>
            </div>
          ) : (
            <div className={`flex flex-col ${gap}`}>
              <Button
                type="button"
                size="sm"
                className="w-full justify-center gap-2 bg-[#4285F4] text-white hover:bg-[#4285F4]/90 border-0"
                onClick={() => {
                  markDone(userId);
                  openNewTab(googleUrl);
                }}
              >
                <span className="font-semibold">G</span>
                Google Calendar
              </Button>
              <Button
                type="button"
                size="sm"
                className="w-full justify-center gap-2 bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-700"
                onClick={() => {
                  markDone(userId);
                  openNewTab(webcalUrl);
                }}
              >
                Apple Calendar
              </Button>
              <Button
                type="button"
                size="sm"
                className="w-full justify-center gap-2 bg-[#0078D4] text-white hover:bg-[#0078D4]/90 border-0"
                onClick={() => {
                  markDone(userId);
                  openNewTab(outlookUrl);
                }}
              >
                Outlook
              </Button>
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={onDismiss}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>
      {/* Hidden for copy flows / debugging */}
      {effectiveToken && !compact ? (
        <p className="mt-3 text-[10px] text-muted-foreground truncate" title={httpsUrl}>
          Feed: {httpsUrl}
        </p>
      ) : null}
    </div>
  );
}
