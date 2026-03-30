'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Key, Bell, CreditCard, Calendar, LogOut, Loader2, Camera } from 'lucide-react';
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

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, isActiveMember, signOut } = useAuth();
  usePageTitle('Settings');

  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const p = profile as any;

  // Populate form fields once the profile is loaded from Supabase
  useEffect(() => {
    if (profile) {
      setFullName((profile as any)?.full_name || '');
      setAvatarUrl((profile as any)?.avatar_url || '');
    }
  }, [profile]);

  const hasStripeSubscription = !!p?.stripe_subscription_id;
  const supabase = createClient();

  const memberSince = p?.member_since
    ? format(new Date(p.member_since), 'MMMM yyyy')
    : p?.created_at
    ? format(new Date(p.created_at), 'MMMM yyyy')
    : null;

  const nextBilling = p?.subscription_end
    ? format(new Date(p.subscription_end), 'MMMM d, yyyy')
    : null;

  const memberType = p?.member_type === 'business' ? 'Business' : 'Social';
  const monthlyPrice = p?.member_type === 'business' ? '$300' : '$30';

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user.id);
      if (error) throw error;
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

      <main id="main-content" className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 sm:py-8">
        <h1 className="text-2xl font-semibold">Account Settings</h1>

        {/* Profile */}
        <section className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <User className="w-4 h-4 text-muted-foreground" />
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
            <Input value={p?.email || user?.email || ''} disabled className="bg-muted/30" />
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

          <Button onClick={handleSaveProfile} disabled={isSavingProfile} variant="outline" size="sm">
            {isSavingProfile ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </section>

        {/* Password */}
        <section className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <Key className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium">Password</h3>
              <p className="text-xs text-muted-foreground">Update your password</p>
            </div>
          </div>
          <PasswordChangeForm />
        </section>

        {/* Notifications */}
        <section className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <Bell className="w-4 h-4 text-muted-foreground" />
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
        <section className="card-elevated p-5 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium">Membership</h3>
              <p className="text-xs text-muted-foreground">Manage your subscription</p>
            </div>
          </div>

          {/* Fixed: stacks vertically on mobile */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-medium">
                {memberType} — {monthlyPrice}/month
              </p>
              {memberSince && (
                <p className="text-xs text-muted-foreground mt-0.5">Member since {memberSince}</p>
              )}
              {nextBilling && (
                <p className="text-xs text-muted-foreground">Next billing: {nextBilling}</p>
              )}
            </div>
            {isActiveMember && (
              <Badge className="bg-green-500/15 text-green-500 border-green-500/30 hover:bg-green-500/15 self-start sm:self-auto">
                Active
              </Badge>
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
          <section className="card-elevated p-5 border border-destructive/20">
            <MembershipDangerZone
              userId={user.id}
              isActiveMember={isActiveMember}
              hasStripeSubscription={hasStripeSubscription}
            />
          </section>
        )}

        {/* Calendar */}
        {p?.calendar_token && (
          <section className="card-elevated p-5 space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-medium">Calendar</h3>
                <p className="text-xs text-muted-foreground">Your private calendar subscription</p>
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground font-mono break-all">
                Token: {p.calendar_token}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              This token is used for your private calendar feed. Keep it secret.
            </p>
          </section>
        )}

        {/* Sign Out */}
        <section className="card-elevated p-5">
          {/* Fixed: stacks vertically on very small screens */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
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