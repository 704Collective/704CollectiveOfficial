'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Calendar, Wallet, CalendarPlus, X, Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHasUpcomingEventRsvp } from '@/hooks/queries';
import { useRouter } from 'next/navigation';
import { calendarKey, walletKey } from '@/lib/onboardingStorage';

const dismissedKey = (userId: string) => `704_onboarding_dismissed_${userId}`;

interface OnboardingCardProps {
  userId: string;
}

export function OnboardingCard({ userId }: OnboardingCardProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [calendarLocal, setCalendarLocal] = useState(false);
  const [walletLocal, setWalletLocal] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const { data: hasUpcomingRsvp } = useHasUpcomingEventRsvp(userId);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissedKey(userId)) === '1');
      setCalendarLocal(localStorage.getItem(calendarKey(userId)) === '1');
      setWalletLocal(localStorage.getItem(walletKey(userId)) === '1');
    } catch {
      setDismissed(false);
    }
    setHydrated(true);
  }, [userId]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissedKey(userId), '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const goCalendar = useCallback(() => {
    const el = document.getElementById('calendar-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else router.push('/dashboard#calendar-section');
  }, [router]);

  const goWallet = useCallback(() => {
    const el = document.getElementById('wallet-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    else router.push('/dashboard#wallet-section');
  }, [router]);

  if (!hydrated || dismissed) return null;

  const rsvpDone = Boolean(hasUpcomingRsvp);
  const calendarDone = calendarLocal;
  const walletDone = walletLocal;
  const allDone = rsvpDone && calendarDone && walletDone;
  if (allDone) return null;

  const Row = ({
    done,
    icon: Icon,
    label,
    onAction,
    href,
  }: {
    done: boolean;
    icon: typeof Calendar;
    label: string;
    onAction?: () => void;
    href?: string;
  }) => (
    <div className="flex items-center gap-3 rounded-lg border border-border/80 bg-background/40 px-3 py-2.5">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
          done
            ? 'border-[#C6A664] bg-[#C6A664]/15 text-[#C6A664]'
            : 'border-muted-foreground/35 text-muted-foreground/50'
        )}
        aria-hidden
      >
        {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Circle className="h-4 w-4" />}
      </span>
      {done ? (
        <span className="flex flex-1 items-center gap-2 text-sm text-muted-foreground line-through decoration-muted-foreground/50">
          <Icon className="h-4 w-4 shrink-0 opacity-50" />
          {label}
        </span>
      ) : href ? (
        <Link
          href={href}
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-foreground hover:text-[#C6A664] transition-colors"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onAction}
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-foreground hover:text-[#C6A664] transition-colors"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {label}
        </button>
      )}
    </div>
  );

  return (
    <div className="relative card-elevated p-5 sm:p-6">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors"
        aria-label="Dismiss onboarding"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <h2 className="text-lg sm:text-xl font-bold mb-1 pr-8">Welcome to 704 Collective!</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Finish these quick steps to get the most from your membership.
      </p>

      <div className="flex flex-col gap-2">
        <Row
          done={rsvpDone}
          icon={Calendar}
          label="RSVP to an upcoming event"
          href="/dashboard/browse-events"
        />
        <Row
          done={calendarDone}
          icon={CalendarPlus}
          label="Add events to your calendar"
          onAction={goCalendar}
        />
        <Row
          done={walletDone}
          icon={Wallet}
          label="Add membership to your wallet"
          onAction={goWallet}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Calendar: open <strong className="text-foreground/80">Sync to Calendar</strong> below and
        tap <strong className="text-foreground/80">Add to Calendar</strong> or{' '}
        <strong className="text-foreground/80">Copy Link</strong> to check this off. Wallet: use{' '}
        <strong className="text-foreground/80">Google Wallet</strong> once your pass is issued.
      </p>
    </div>
  );
}
