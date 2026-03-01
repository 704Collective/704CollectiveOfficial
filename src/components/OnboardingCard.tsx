'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { X, Calendar, Wallet, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingCardProps {
  userId: string;
}

export function OnboardingCard({ userId }: OnboardingCardProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem('onboarding_dismissed');
    if (dismissed) {
      setLoading(false);
      return;
    }

    const checkTickets = async () => {
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'confirmed');

      if ((count || 0) === 0) {
        setVisible(true);
      }
      setLoading(false);
    };

    checkTickets();
  }, [userId]);

  const handleDismiss = () => {
    localStorage.setItem('onboarding_dismissed', 'true');
    setVisible(false);
  };

  if (loading || !visible) return null;

  return (
    <div className="relative rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 sm:p-8">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors"
        aria-label="Dismiss onboarding"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>

      <h2 className="text-xl sm:text-2xl font-bold mb-1">Welcome to 704 Collective! 🎉</h2>
      <p className="text-sm sm:text-base text-muted-foreground mb-6">
        You're officially in. Here's how to get started:
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Button variant="outline" className="justify-start gap-2 h-auto py-3 px-4" asChild>
          <Link href="/events">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span className="text-left text-sm">RSVP to an upcoming event</span>
          </Link>
        </Button>
        <Button
          variant="outline"
          className="justify-start gap-2 h-auto py-3 px-4"
          onClick={() => document.getElementById('calendar-section')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <CalendarPlus className="w-4 h-4 text-primary shrink-0" />
          <span className="text-left text-sm">Add events to your calendar</span>
        </Button>
        <Button
          variant="outline"
          className="justify-start gap-2 h-auto py-3 px-4"
          onClick={() => document.getElementById('wallet-section')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <Wallet className="w-4 h-4 text-primary shrink-0" />
          <span className="text-left text-sm">Add membership to your wallet</span>
        </Button>
      </div>
    </div>
  );
}
