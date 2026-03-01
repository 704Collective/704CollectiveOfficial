'use client';

import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { addDays, format } from 'date-fns';
import { Calendar, MapPin, Users, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import logo from '@/assets/704-logo.png';
import { createClient } from '@/lib/supabase/client';

interface Event {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location_name: string | null;
  image_url: string | null;
  capacity: number | null;
  is_members_only: boolean | null;
  ticket_price: number | null;
}

export default function Join() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  usePageTitle("Join 704 Collective - Charlotte's Young Professionals Community");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(true);
  const [redirectError, setRedirectError] = useState(false);

  // Auto-redirect to Stripe Checkout on load
  useEffect(() => {
    if (authLoading) return;

    const redirectToCheckout = async () => {
      try {
        setRedirecting(true);
        setRedirectError(false);

        const { data, error } = await supabase.functions.invoke('create-checkout', {
          body: {},
        });

        if (error || data?.error) {
          console.error('Checkout error:', error || data?.error);
          setRedirectError(true);
          setRedirecting(false);
          return;
        }

        if (data?.url) {
          window.location.href = data.url;
        } else {
          setRedirectError(true);
          setRedirecting(false);
        }
      } catch (err) {
        console.error('Checkout error:', err);
        setRedirectError(true);
        setRedirecting(false);
      }
    };

    redirectToCheckout();
  }, [authLoading, user]);

  // Fetch events within ±15 days
  useEffect(() => {
    async function fetchEvents() {
      const now = new Date();
      const fifteenDaysAhead = addDays(now, 15);

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .gte('start_time', now.toISOString())
        .lte('start_time', fifteenDaysAhead.toISOString())
        .order('start_time', { ascending: true })
        .limit(6);

      if (!error && data) {
        setEvents(data);
      }
      setLoading(false);
    }

    fetchEvents();
  }, []);

  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    if (error) {
      toast.error('Failed to sign in with Google');
    }
  };

  const handleRetry = () => {
    setRedirecting(true);
    setRedirectError(false);
    supabase.functions.invoke('create-checkout', { body: {} }).then(({ data, error }) => {
      if (error || data?.error || !data?.url) {
        setRedirectError(true);
        setRedirecting(false);
      } else {
        window.location.href = data.url;
      }
    }).catch(() => {
      setRedirectError(true);
      setRedirecting(false);
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src={logo} alt="704 Collective" className="h-9 w-auto" />
            <span className="text-foreground text-lg font-medium">Social</span>
          </Link>
          <Link href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Already a member? Sign in
          </Link>
        </div>
      </header>

      <main className="container py-12 md:py-20">
        {/* Redirect Status */}
        <section className="max-w-md mx-auto mb-16 text-center">
          {redirecting && !redirectError ? (
            <div className="space-y-4 py-8">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">Redirecting to checkout...</p>
            </div>
          ) : redirectError ? (
            <div className="space-y-4 py-8">
              <p className="text-muted-foreground">
                Something went wrong. Please try again.
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={handleRetry} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>

                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or sign up with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Benefits Section */}
        <section className="max-w-md mx-auto mb-16">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Here's what you'll get:
          </h2>
          <ul className="space-y-2 text-muted-foreground">
            {[
              "6+ curated events every month",
              "Priority RSVP access (events fill up fast)",
              "Co-ed community of people like you",
              "Happy hours, game nights, adventures & more",
              "Friends, not just drinking buddies",
              "Digital membership card",
              "Member-only events & experiences",
              "Cancel anytime",
            ].map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <span className="text-foreground mt-0.5">✓</span>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Upcoming Events */}
        <section>
          <h2 className="text-xl font-semibold text-foreground mb-6">
            Upcoming Events
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-border">
                  <Skeleton className="aspect-[16/9] w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="group rounded-xl overflow-hidden border border-border bg-card hover:border-primary/50 transition-all"
                >
                  <div className="aspect-[16/9] overflow-hidden bg-muted">
                    {event.image_url ? (
                      <img
                        src={event.image_url}
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Calendar className="w-12 h-12 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    <h3 className="font-semibold text-foreground line-clamp-1">
                      {event.title}
                    </h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 flex-shrink-0" />
                        <span>{format(new Date(event.start_time), 'EEE, MMM d • h:mm a')}</span>
                      </div>
                      {event.location_name && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="line-clamp-1">{event.location_name}</span>
                        </div>
                      )}
                      {event.capacity && (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 flex-shrink-0" />
                          <span>{event.capacity} spots</span>
                        </div>
                      )}
                    </div>
                    {event.is_members_only && (
                      <div className="inline-flex items-center px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        Members Only
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No upcoming events at the moment. Check back soon!
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="py-8 border-t border-border">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <img src={logo} alt="704 Collective" className="h-8 w-auto" />
              <span className="text-foreground font-medium">Social</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} 704 Collective. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
