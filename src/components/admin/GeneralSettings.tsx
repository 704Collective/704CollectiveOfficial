'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Globe, Instagram, Loader2, Save } from 'lucide-react';

interface OrgSettings {
  id: string;
  name: string;
  contact_email: string;
  phone: string;
  description: string;
  instagram_url: string;
  tiktok_url: string;
  website_url: string;
}

const DEFAULTS: Omit<OrgSettings, 'id'> = {
  name: '',
  contact_email: '',
  phone: '',
  description: '',
  instagram_url: '',
  tiktok_url: '',
  website_url: '',
};

// TikTok icon SVG
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.84 1.56V6.79a4.85 4.85 0 01-1.07-.1z" />
    </svg>
  );
}

export function GeneralSettings({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Omit<OrgSettings, 'id'>>(DEFAULTS);
  const [form, setForm] = useState<Omit<OrgSettings, 'id'>>(DEFAULTS);

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      toast.error('Failed to load settings');
    } else if (data) {
      const { id, updated_at, updated_by, ...rest } = data;
      const vals: Omit<OrgSettings, 'id'> = {
        name: rest.name ?? '',
        contact_email: rest.contact_email ?? '',
        phone: rest.phone ?? '',
        description: rest.description ?? '',
        instagram_url: rest.instagram_url ?? '',
        tiktok_url: rest.tiktok_url ?? '',
        website_url: rest.website_url ?? '',
      };
      setRowId(id);
      setSaved(vals);
      setForm(vals);
    }
    setLoading(false);
  };

  const handleChange = (field: keyof typeof DEFAULTS) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, updated_by: userId };

      if (rowId) {
        const { error } = await supabase
          .from('organization_settings')
          .update(payload)
          .eq('id', rowId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('organization_settings')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        setRowId(data.id);
      }

      setSaved(form);
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="card-elevated p-4 sm:p-6 space-y-4 animate-pulse">
            <div className="h-5 bg-muted rounded w-1/3" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Organization Info Card */}
      <div className="card-elevated p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Organization Info</h3>
            <p className="text-sm text-muted-foreground">Basic details used across the platform</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org_name">Organization Name</Label>
            <Input
              id="org_name"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="704 Collective"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="org_email">Contact Email</Label>
              <Input
                id="org_email"
                type="email"
                value={form.contact_email}
                onChange={handleChange('contact_email')}
                placeholder="hello@704collective.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org_phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="org_phone"
                type="tel"
                value={form.phone}
                onChange={handleChange('phone')}
                placeholder="+1 (704) 000-0000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org_description">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              id="org_description"
              value={form.description}
              onChange={handleChange('description')}
              placeholder="A short description used in meta tags and emails…"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Social Links Card */}
      <div className="card-elevated p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Social Links</h3>
            <p className="text-sm text-muted-foreground">External profiles and website</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org_instagram">Instagram URL</Label>
            <div className="relative">
              <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="org_instagram"
                value={form.instagram_url}
                onChange={handleChange('instagram_url')}
                placeholder="https://instagram.com/704collective"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org_tiktok">TikTok URL</Label>
            <div className="relative">
              <TikTokIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="org_tiktok"
                value={form.tiktok_url}
                onChange={handleChange('tiktok_url')}
                placeholder="https://tiktok.com/@704collective"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org_website">Website URL</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="org_website"
                value={form.website_url}
                onChange={handleChange('website_url')}
                placeholder="https://704collective.com"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pb-2">
        <Button onClick={handleSave} disabled={!isDirty || saving} className="w-full sm:w-auto">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
          ) : (
            <><Save className="w-4 h-4" />Save Changes</>
          )}
        </Button>
      </div>
    </div>
  );
}
