'use client';

import Link from 'next/link';
import { XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePageTitle } from '@/hooks/usePageTitle';
import logo from '@/assets/704-logo.png';

export default function PaymentCanceled() {
  usePageTitle('Payment Canceled');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2">
            <img src={logo} alt="704 Collective" className="h-9 w-auto" />
            <span className="text-foreground text-lg font-medium">Social</span>
          </Link>
        </div>
      </header>

      <main className="container py-20">
        <div className="max-w-md mx-auto text-center space-y-8">
          {/* Cancel Icon */}
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto">
            <XCircle className="w-10 h-10 text-muted-foreground" />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Payment Canceled</h1>
            <p className="text-muted-foreground">
              No worries! Your payment was not processed and you haven't been charged.
            </p>
          </div>

          {/* Help Text */}
          <div className="card-elevated p-6 text-left">
            <h2 className="font-semibold mb-2">Changed your mind?</h2>
            <p className="text-sm text-muted-foreground">
              No problem at all. If you have any questions about membership or 
              need help with anything, feel free to reach out to us.
            </p>
          </div>

          {/* CTAs */}
          <div className="space-y-3">
            <Button className="w-full" asChild>
              <Link href="/join">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Try Again
              </Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/events">Browse Events</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
