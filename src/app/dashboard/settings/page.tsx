'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Key, Bell, CreditCard, Calendar, LogOut, Loader2, Camera, Copy, Check } from 'lucide-react';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { PasswordChangeForm } from '@/components/PasswordChangeForm';
import { NotificationSettings } from '@/components/NotificationSettings';
import { MembershipDangerZone } from '@/components/MembershipDangerZone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CalendarSyncButton } from '@/components/CalendarSyncButton';
import { markOnboardingCalendarDone } from '@/lib/onboardingStorage';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, isActiveMember, signOut, refreshProfile } = useAuth();
  usePageTitle('Settings');

  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const p = profile as any;

  // Populate form fields once the profile is loaded from Supabase
  useEffect(() => {
    if (profile) {
      setFullName((profile as any)?.full_name || '');
      setPhone((profile as any)?.phone ?? '');
      setAvatarUrl((profile as any)?.avatar_url || '');
    }
  }, [profile]);

  const hasStripeSubscription = !!(p?.subscription_id || p?.stripe_subscription_id);
  const supabase = createClient();

  const memberSince = p?.member_since
    ? format(new Date(p.member_since), 'MMMM yyyy')
    : p?.created_at
    ? format(new Date(p.created_at), 'MMMM yyyy')
    : null;

  const subEnd = p?.subscription_ends_at || p?.subscription_end;
  const nextBilling = subEnd ? format(new Date(subEnd), 'MMMM d, yyyy') : null;

  const memberType =
    p?.member_type === 'business'
      ? 'Business'
      : p?.member_type === 'partner'
        ? 'Partner'
        : 'Social';
  const monthlyPrice =
    p?.member_type === 'business' ? '$300' : p?.member_type === 'partner' ? '—' : '$30';

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id);
      setAvatarUrl(url);
      await refreshProfile();
      toast.success('Photo updated');
    } catch {
      toast.error('Failed to upload photo');
    }
  };

  const handleManageBilling = async () => {
    setIsPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error || data?.error) {
        toast.error(data?.error || 'Failed to open billing portal');
        return;
      }
      if (data?.url) window.open(data.url, '_blank');
      else toast.error('No portal URL received');
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsPortalLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await Promise.race([
        signOut(),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // Sign out failed or timed out — redirect anyway
    }
    router.push('/login');
  };

  const initials = (p?.full_name || p?.email || 'M')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <DashboardNav />

      <main id="main-content" className="container py-8 max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">Account Settings</h1>

        {/* Profile */}
        <section className="card-elevated p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Profile</h3>
              <p className="text-xs text-muted-foreground">Manage your account information</p>
            </div>
          </div>

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="relative w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Your profile photo" fill className="object-cover" sizes="48px" unoptimized />
                ) : (
                  <span className="text-sm font-semibold">{initials}</span>
                )}
              </div>
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 text-sm text-foreground hover:text-muted-foreground transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A664]"
              >
                <Camera className="w-3.5 h-3.5" />
                Change Photo
              </button>
              <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG or GIF. Max 2MB.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input value={p?.email || user?.email || ''} disabled className="bg-input border border-input rounded-lg px-3 py-2 text-sm w-full opacity-50 cursor-not-allowed" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Full Name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="settings-phone" className="text-xs text-muted-foreground">
              Phone
            </Label>
            <Input
              id="settings-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mobile number"
              autoComplete="tel"
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={isSavingProfile} variant="outline" size="sm">
            {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </section>

        {/* Password */}
        <section className="card-elevated p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Password</h3>
              <p className="text-xs text-muted-foreground">Update your password</p>
            </div>
          </div>
          <PasswordChangeForm />
        </section>

        {/* Notifications */}
        <section className="card-elevated p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Notifications</h3>
              <p className="text-xs text-muted-foreground">Manage your notification preferences</p>
            </div>
          </div>
          {user && (
            <NotificationSettings
              userId={user.id}
              initialSettings={{
                notify_event_reminders: p?.notify_event_reminders ?? true,
                notify_new_events: p?.notify_new_events ?? true,
                notify_announcements: p?.notify_announcements ?? true,
              }}
            />
          )}
        </section>

        {/* Membership */}
        <section className="card-elevated p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Membership</h3>
              <p className="text-xs text-muted-foreground">Manage your subscription</p>
            </div>
          </div>

          {/* Fixed: stacks vertically on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {memberType} - {monthlyPrice}/month
              </p>
              {memberSince && (
                <p className="text-xs text-muted-foreground mt-0.5">Member since {memberSince}</p>
              )}
              {nextBilling && (
                <p className="text-xs text-muted-foreground">Next billing: {nextBilling}</p>
              )}
            </div>
            {isActiveMember && (
              <span className="px-3 py-1 rounded-full text-sm bg-green-500/10 text-green-500 self-start sm:self-auto">
                Active
              </span>
            )}
          </div>

          {p?.membership_override && (
            <p className="text-xs text-muted-foreground">Your membership is managed by an administrator.</p>
          )}

          {isActiveMember && hasStripeSubscription && (
            <div>
              <button
                onClick={handleManageBilling}
                disabled={isPortalLoading}
                className="flex items-center gap-1.5 text-sm text-foreground hover:text-muted-foreground transition-colors"
              >
                {isPortalLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CreditCard className="w-3.5 h-3.5" />
                )}
                Manage Billing
              </button>
              <p className="text-xs text-muted-foreground mt-0.5">
                View invoices, update payment method, and download receipts
              </p>
            </div>
          )}
        </section>

        {/* Danger Zone */}
        {isActiveMember && hasStripeSubscription && user && (
          <section className="card-elevated p-6 border-destructive/30 bg-destructive/5">
            <MembershipDangerZone
              userId={user.id}
              isActiveMember={isActiveMember}
              hasStripeSubscription={hasStripeSubscription}
            />
          </section>
        )}

        {/* Calendar */}
        {p?.calendar_token && user && (
          <section className="card-elevated p-6 space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Calendar</h3>
                <p className="text-xs text-muted-foreground">Your private calendar subscription</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="bg-muted/30 rounded-lg px-3 py-2 flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-mono break-all">
                  Token: {p.calendar_token}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(String(p.calendar_token));
                    markOnboardingCalendarDone(user.id);
                    setTokenCopied(true);
                    toast.success('Token copied');
                    setTimeout(() => setTokenCopied(false), 2000);
                  } catch {
                    toast.error('Could not copy');
                  }
                }}
              >
                {tokenCopied ? (
                  <Check className="w-3.5 h-3.5 mr-1" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1" />
                )}
                Copy token
              </Button>
            </div>
            {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
              <CalendarSyncButton
                calendarToken={p.calendar_token}
                baseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL}
                variant="cta"
                userId={user.id}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">
              This token is used for your private calendar feed. Keep it secret.
            </p>
          </section>
        )}

        {/* Sign Out */}
        <section className="card-elevated p-6">
          {/* Fixed: stacks vertically on very small screens */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium">Sign Out</h3>
                <p className="text-xs text-muted-foreground">Sign out of your account</p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="self-start sm:self-auto"
            >
              {isSigningOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Sign Out'}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}