'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { PasswordChangeForm } from '@/components/PasswordChangeForm';
import { NotificationSettings } from '@/components/NotificationSettings';
import { MembershipDangerZone } from '@/components/MembershipDangerZone';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, isActiveMember, loading: authLoading } = useAuth();
  usePageTitle('Settings');
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  if (authLoading || !user) {
    if (!authLoading && !user) {
      router.push('/login');
    }
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </main>
      </div>
    );
  }

  const p = profile as any;
  const hasStripeSubscription = !!p?.stripe_subscription_id;

  const handleManageBilling = async () => {
    setIsPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error || data?.error) {
        toast.error(data?.error || 'Failed to open billing portal');
        setIsPortalLoading(false);
        return;
      }
      if (data?.url) {
        window.open(data.url, '_blank');
      } else {
        toast.error('No portal URL received');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <DashboardNav />

        <div>
          <h1 className="text-2xl font-semibold mb-1">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your account preferences, billing, and security.
          </p>
        </div>

        {/* Billing */}
        {isActiveMember && (
          <section className="card-elevated p-5 space-y-4">
            <h3 className="text-sm font-medium">Billing & Subscription</h3>
            <p className="text-sm text-muted-foreground">
              Manage your payment method, view invoices, or update your plan through Stripe.
            </p>
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={isPortalLoading}
            >
              {isPortalLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Manage Billing
                </>
              )}
            </Button>
          </section>
        )}

        {/* Password */}
        <section className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-medium">Change Password</h3>
          <PasswordChangeForm />
        </section>

        {/* Notification Preferences */}
        <section className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-medium">Notification Preferences</h3>
          <NotificationSettings
            userId={user.id}
            initialSettings={{
              notify_event_reminders: p?.notify_event_reminders ?? true,
              notify_new_events: p?.notify_new_events ?? true,
              notify_announcements: p?.notify_announcements ?? true,
            }}
          />
        </section>

        {/* Danger Zone */}
        <section className="card-elevated p-5">
          <MembershipDangerZone
            userId={user.id}
            isActiveMember={isActiveMember}
            hasStripeSubscription={hasStripeSubscription}
          />
        </section>
      </main>
    </div>
  );
}