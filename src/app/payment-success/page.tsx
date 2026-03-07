'use client';

import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, Calendar, ArrowRight, Loader2, Mail, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { usePageTitle } from '@/hooks/usePageTitle';
import logo from '@/assets/704-logo.png';
import { Skeleton } from '@/components/ui/skeleton';

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Skeleton className="h-8 w-48" /></div>}>
      <PaymentSuccess />
    </Suspense>
  );
}

function PaymentSuccess() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  usePageTitle('Payment Successful');
  const [isProcessing, setIsProcessing] = useState(true);
  const [verified, setVerified] = useState(false);

  const sessionId = searchParams.get('session_id');
  const eventId = searchParams.get('event_id');
  const isTicketPurchase = !!eventId;

  useEffect(() => {
    if (!sessionId) {
      setIsProcessing(false);
      return;
    }

    const processPayment = async () => {
      try {
        if (eventId) {
          const { data, error } = await supabase.functions.invoke('verify-ticket-payment', {
            body: { session_id: sessionId, event_id: eventId },
          });
          if (!error && !data?.error) {
            setVerified(true);
          } else {
            console.error('Ticket verification failed:', error || data?.error);
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          setVerified(true);
        }
      } catch (err) {
        console.error('Error processing payment:', err);
      } finally {
        setIsProcessing(false);
      }
    };

    processPayment();
  }, [sessionId, eventId]);

  if (!isProcessing && !verified) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
          <div className="container flex h-16 items-center">
            <Link href="/" className="flex items-center gap-2">
              <img src={logo.src} alt="704 Collective" className="h-9 w-auto" />
              <span className="text-foreground text-lg font-medium">Social</span>
            </Link>
          </div>
        </header>
        <main className="container py-20">
          <div className="max-w-md mx-auto text-center space-y-8">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold">Payment Not Verified</h1>
              <p className="text-muted-foreground">
                We couldn't verify your payment. If you completed a purchase, please check your email for confirmation or contact support.
              </p>
            </div>
            <Button className="w-full" asChild>
              <Link href="/">
                Return to Homepage
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">
            {isTicketPurchase ? 'Processing your payment...' : 'Setting up your account...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center">
          <Link href="/" className="flex items-center gap-2">
            <img src={logo.src} alt="704 Collective" className="h-9 w-auto" />
            <span className="text-foreground text-lg font-medium">Social</span>
          </Link>
        </div>
      </header>

      <main className="container py-20">
        <div className="max-w-md mx-auto text-center space-y-8">
          <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-500" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Payment Successful!</h1>
            <p className="text-muted-foreground">
              {isTicketPurchase
                ? "Your ticket has been confirmed. We'll see you at the event!"
                : "Welcome to 704 Collective! Your membership is now active."
              }
            </p>
          </div>

          <div className="card-elevated p-6 text-left space-y-4">
            <h2 className="font-semibold">What's next?</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              {isTicketPurchase ? (
                <>
                  <li className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <span>Your ticket confirmation has been sent to your email</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>Add the event to your calendar so you don't forget</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>Check your email to set your password and sign in</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <span>Free RSVP to all upcoming events</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <span>Access to your digital membership card</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>Subscribe to our calendar to never miss an event</span>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="space-y-3">
            {isTicketPurchase ? (
              <>
                <Button className="w-full" asChild>
                  <Link href={`/events/${eventId}`}>
                    View Event Details
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/dashboard/events">Browse More Events</Link>
                </Button>
              </>
            ) : user ? (
              <>
                <Button className="w-full" asChild>
                  <Link href="/dashboard">
                    Go to Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/dashboard/events">Browse Events</Link>
                </Button>
              </>
            ) : (
              <Button className="w-full" asChild>
                <Link href="/login">
                  Sign In to Your Account
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}