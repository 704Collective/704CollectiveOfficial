'use client';
import Link from 'next/link';
import { Calendar, Wallet, CalendarPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHasTickets } from '@/hooks/queries';

interface OnboardingCardProps {
  userId: string;
}

export function OnboardingCard({ userId }: OnboardingCardProps) {
  const dismissed = typeof window !== 'undefined'
    ? !!localStorage.getItem('onboarding_dismissed')
    : true;
  const { data: hasTickets, isLoading } = useHasTickets(userId);

  const handleDismiss = () => {
    localStorage.setItem('onboarding_dismissed', 'true');
    window.location.reload();
  };

  if (dismissed || isLoading || hasTickets) return null;

  return (
    <div className="relative card-elevated p-5 sm:p-6">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors"
        aria-label="Dismiss onboarding"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <h2 className="text-lg sm:text-xl font-bold mb-1 pr-8">Welcome to 704 Collective! 🎉</h2>
      <p className="text-sm text-muted-foreground mb-4">
        You're officially in. Here's how to get started:
      </p>

      <div className="flex flex-col gap-2">
        <Button variant="outline" className="justify-start gap-2 h-auto py-3 px-4 flex-1 min-w-0" asChild>
          <Link href="/dashboard/browse-events">
            <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-left text-sm leading-tight">RSVP to an upcoming event</span>
          </Link>
        </Button>
        <Button
          variant="outline"
          className="justify-start gap-2 h-auto py-3 px-4 flex-1 min-w-0"
          onClick={() => document.getElementById('calendar-section')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <CalendarPlus className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-left text-sm leading-tight">Add events to your calendar</span>
        </Button>
        <Button
          variant="outline"
          className="justify-start gap-2 h-auto py-3 px-4 flex-1 min-w-0"
          onClick={() => document.getElementById('wallet-section')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Wallet className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-left text-sm leading-tight">Add membership to your wallet</span>
        </Button>
      </div>
    </div>
  );
}