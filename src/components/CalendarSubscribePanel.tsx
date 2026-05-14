'use client';

import { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CalendarSubscribeModal } from './CalendarSubscribeModal';
import type { CalendarScope } from '@/lib/calendarSubscriptionUrls';

interface CalendarSubscribePanelProps {
  calendarToken: string;
  baseUrl: string;
  memberType: 'social' | 'business' | 'partner' | 'social_non_member' | 'non_member' | string | null;
  userId?: string;
}

export function CalendarSubscribePanel({ calendarToken, baseUrl, memberType, userId }: CalendarSubscribePanelProps) {
  const [openScope, setOpenScope] = useState<CalendarScope | null>(null);

  const isBusinessMember = memberType === 'business';
  const showAtAll = !!calendarToken && (memberType === 'social' || memberType === 'business' || memberType === 'partner');

  if (!showAtAll) return null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Subscribe to Calendar</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          See all upcoming events in your calendar app — no need to RSVP first.
        </p>

        <div className="space-y-2">
          <Button
            type="button"
            onClick={() => setOpenScope('social')}
            variant="outline"
            className="w-full justify-center text-sm"
          >
            Subscribe to Social Events
          </Button>

          {isBusinessMember && (
            <Button
              type="button"
              onClick={() => setOpenScope('business')}
              variant="outline"
              className="w-full justify-center text-sm"
            >
              Subscribe to Business Events
            </Button>
          )}
        </div>
      </div>

      {openScope && (
        <CalendarSubscribeModal
          open={true}
          onClose={() => setOpenScope(null)}
          scope={openScope}
          token={calendarToken}
          baseUrl={baseUrl}
          userId={userId}
        />
      )}
    </>
  );
}
