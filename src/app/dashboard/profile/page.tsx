'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { DashboardNav } from '@/components/DashboardNav';
import { AvatarUpload } from '@/components/AvatarUpload';
import { MembershipCard } from '@/components/MembershipCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { usePageTitle } from '@/hooks/usePageTitle';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, isActiveMember, loading: authLoading } = useAuth();
  usePageTitle('My Profile');

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (profile) {
      const p = profile as any;
      setFullName(p.full_name || '');
      setBio(p.bio || '');
      setPhone(p.phone || '');
      setAvatarUrl(p.avatar_url || '');
      setLoaded(true);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        bio: bio.trim(),
        phone: phone.trim(),
      })
      .eq('id', user.id);

    if (error) {
      toast.error('Failed to update profile');
    } else {
      toast.success('Profile updated');
    }
    setSaving(false);
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </div>
    );
  }

  const p = profile as any;
  const memberSince = p?.member_since
    ? format(new Date(p.member_since), 'MMMM yyyy')
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto space-y-8">
        <DashboardNav />

        <div>
          <h1 className="text-2xl font-semibold mb-1">My Profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal information and membership card.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left: Edit Form */}
          <div className="lg:col-span-3 space-y-6">
            {/* Avatar */}
            <div className="card-elevated p-5">
              <h3 className="text-sm font-medium mb-4">Profile Photo</h3>
              <AvatarUpload
                userId={user.id}
                currentAvatarUrl={avatarUrl}
                userName={fullName}
                onUploadComplete={(url) => setAvatarUrl(url)}
              />
            </div>

            {/* Info */}
            <div className="card-elevated p-5 space-y-4">
              <h3 className="text-sm font-medium">Personal Information</h3>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={user.email || ''}
                  disabled
                  className="opacity-60"
                />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed here. Contact support if needed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="xxx-xxx-xxxx"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us a little about yourself..."
                  rows={3}
                  maxLength={300}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/300
                </p>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>

          {/* Right: Membership Card */}
          <div className="lg:col-span-2">
            <div className="sticky top-24">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                Your Membership Card
              </h3>
              {isActiveMember ? (
                <MembershipCard
                  name={fullName || 'Member'}
                  memberId={user.id}
                  avatarUrl={avatarUrl}
                  memberSince={memberSince}
                />
              ) : (
                <div className="card-elevated p-6 text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Activate your membership to get your digital card.
                  </p>
                  <Button variant="hero" asChild>
                    <a href="/join">Join 704 Social</a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}