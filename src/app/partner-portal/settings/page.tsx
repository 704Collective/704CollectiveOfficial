'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { updatePartnerPortalSettings, requestPartnerAccountDeletion } from '@/app/actions/partnerPortalActions';

export default function PartnerPortalSettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const p = profile as Record<string, unknown> | null;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const full = (p?.full_name as string)?.trim() || '';
    const parts = full.split(/\s+/);
    setFirstName(parts[0] ?? '');
    setLastName(parts.slice(1).join(' ') ?? '');
    setEmail((p?.email as string) ?? '');
    setPhone((p?.phone as string) ?? '');
  }, [p?.full_name, p?.email, p?.phone]);

  useEffect(() => {
    if (!profile?.id) return;
    (async () => {
      const { data: listing } = await supabase
        .from('partner_listings')
        .select('company_name, website')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (listing) {
        setCompanyName(listing.company_name ?? '');
        setWebsite(listing.website ?? '');
        return;
      }
      const { data: app } = await supabase
        .from('partner_applications')
        .select('company_name, website')
        .eq('user_id', profile.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setCompanyName(app?.company_name ?? '');
      setWebsite(app?.website ?? '');
    })();
  }, [profile?.id]);

  async function onSave() {
    const fd = new FormData();
    fd.set('firstName', firstName.trim());
    fd.set('lastName', lastName.trim());
    fd.set('phone', phone.trim());
    fd.set('companyName', companyName.trim());
    fd.set('website', website.trim());
    if (newPassword || confirmPassword) {
      fd.set('newPassword', newPassword);
      fd.set('confirmPassword', confirmPassword);
    }
    setSaving(true);
    const res = await updatePartnerPortalSettings(fd);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Settings saved');
    setNewPassword('');
    setConfirmPassword('');
    await refreshProfile();
  }

  async function onDeleteRequest() {
    setDeleting(true);
    const res = await requestPartnerAccountDeletion(deleteConfirm.trim());
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Deletion request sent to hello@704collective.com');
    setDeleteConfirm('');
  }

  return (
    <div className="max-w-xl space-y-10">
      <div>
        <h2 className="text-xl font-semibold text-white">Settings</h2>
        <p className="text-sm text-white/50 mt-1">Profile and account preferences.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-white/10 p-6 bg-white/[0.02]">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-white/80">First name</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Last name</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-white/80">Email</Label>
          <Input value={email} readOnly disabled className="bg-white/5 border-white/10 opacity-70" />
        </div>
        <div className="space-y-2">
          <Label className="text-white/80">Phone</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bg-white/5 border-white/10"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white/80">Company name</Label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="bg-white/5 border-white/10"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white/80">Website</Label>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="bg-white/5 border-white/10"
          />
        </div>
        <div className="border-t border-white/10 pt-4 space-y-4">
          <p className="text-sm font-medium text-white/90">Change password</p>
          <div className="space-y-2">
            <Label className="text-white/80">New password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-white/5 border-white/10"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Confirm new password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-white/5 border-white/10"
              autoComplete="new-password"
            />
          </div>
        </div>
        <Button
          type="button"
          className="bg-[#C6A664] text-black"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
        </Button>
      </div>

      <div className="rounded-xl border border-red-500/25 p-6 bg-red-500/5 space-y-4">
        <h3 className="text-lg font-semibold text-red-200">Danger zone</h3>
        <p className="text-sm text-white/55">
          Request account deletion. We&apos;ll email the team at hello@704collective.com — your account is not deleted
          automatically.
        </p>
        <div className="space-y-2 max-w-md">
          <Label className="text-white/80">Type your company name to confirm</Label>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Company name"
            className="bg-white/5 border-white/10"
          />
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!deleteConfirm.trim() || deleting}
          onClick={onDeleteRequest}
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete account'}
        </Button>
      </div>
    </div>
  );
}
