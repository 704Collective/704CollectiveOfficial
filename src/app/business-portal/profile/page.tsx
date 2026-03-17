'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { BusinessPortalNav } from '@/components/business/BusinessPortalNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Camera, Upload, X, Loader2, Save, CheckCircle,
  Linkedin, Globe, Instagram,
} from 'lucide-react';
import Image from 'next/image';

interface BusinessProfileForm {
  // From profiles table
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string;
  // From business_profiles table
  company_name: string;
  title: string;
  bio: string;
  website_url: string;
  linkedin_url: string;
  instagram_url: string;
  tiktok_url: string;
  facebook_url: string;
  logo_url: string;
  additional_photos: string[];
}

const emptyForm = (): BusinessProfileForm => ({
  full_name: '', email: '', phone: '', avatar_url: '',
  company_name: '', title: '', bio: '',
  website_url: '', linkedin_url: '', instagram_url: '',
  tiktok_url: '', facebook_url: '',
  logo_url: '', additional_photos: [],
});

const MAX_ADDITIONAL_PHOTOS = 5;

export default function BusinessProfilePage() {
  const { user, profile, refreshProfile } = useAuth() as any;
  const [form, setForm] = useState<BusinessProfileForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const additionalPhotoInput = useRef<HTMLInputElement>(null);

  // Load existing data
  useEffect(() => {
    if (!user || !profile) return;
    const p = profile as any;

    const loadBusinessProfile = async () => {
      const { data: bp } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setForm({
        full_name: p.full_name || '',
        email: p.email || '',
        phone: p.phone || '',
        avatar_url: p.avatar_url || '',
        company_name: bp?.company_name || '',
        title: bp?.title || '',
        bio: bp?.bio || '',
        website_url: bp?.website_url || '',
        linkedin_url: bp?.linkedin_url || '',
        instagram_url: bp?.instagram_url || '',
        tiktok_url: bp?.tiktok_url || '',
        facebook_url: bp?.facebook_url || '',
        logo_url: bp?.logo_url || '',
        additional_photos: bp?.additional_photos || [],
      });
      setLoading(false);
    };

    loadBusinessProfile();
  }, [user, profile]);

  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return null;
    }
    const ext = file.name.split('.').pop();
    const filename = `${folder}/${user!.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('public-assets')
      .upload(filename, file, { contentType: file.type, upsert: true });
    if (error) {
      toast.error('Upload failed: ' + error.message);
      return null;
    }
    const { data } = supabase.storage.from('public-assets').getPublicUrl(filename);
    return data.publicUrl;
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof BusinessProfileForm
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingField(field);
    const url = await uploadImage(file, field === 'avatar_url' ? 'headshots' : field === 'logo_url' ? 'logos' : 'business-photos');
    if (url) setForm(prev => ({ ...prev, [field]: url }));
    setUploadingField(null);
    e.target.value = '';
  };

  const handleAdditionalPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (form.additional_photos.length >= MAX_ADDITIONAL_PHOTOS) {
      toast.error(`Maximum ${MAX_ADDITIONAL_PHOTOS} additional photos allowed`);
      return;
    }
    setUploadingField('additional_photos');
    const url = await uploadImage(file, 'business-photos');
    if (url) setForm(prev => ({ ...prev, additional_photos: [...prev.additional_photos, url] }));
    setUploadingField(null);
    e.target.value = '';
  };

  const removeAdditionalPhoto = (index: number) => {
    setForm(prev => ({
      ...prev,
      additional_photos: prev.additional_photos.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!form.company_name.trim()) { toast.error('Company name is required'); return; }
    if (!form.title.trim()) { toast.error('Title / Role is required'); return; }
    if (!form.bio.trim()) { toast.error('Biography is required'); return; }
    if (!form.avatar_url) { toast.error('Profile photo (headshot) is required'); return; }

    setSaving(true);
    try {
      // Split full_name into first/last
      const nameParts = form.full_name.trim().split(' ');
      const first_name = nameParts[0] || '';
      const last_name = nameParts.slice(1).join(' ') || '';

      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          avatar_url: form.avatar_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Upsert business_profiles table
      const { error: bpError } = await supabase
        .from('business_profiles')
        .upsert({
          user_id: user.id,
          company_name: form.company_name.trim() || null,
          title: form.title.trim() || null,
          bio: form.bio.trim() || null,
          website_url: form.website_url.trim() || null,
          linkedin_url: form.linkedin_url.trim() || null,
          instagram_url: form.instagram_url.trim() || null,
          tiktok_url: form.tiktok_url.trim() || null,
          facebook_url: form.facebook_url.trim() || null,
          logo_url: form.logo_url || null,
          additional_photos: form.additional_photos.length > 0 ? form.additional_photos : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (bpError) throw bpError;

      await refreshProfile?.();
      toast.success('Profile saved successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // Required fields completion check
  const requiredComplete = !!(
    form.full_name.trim() &&
    form.email &&
    form.company_name.trim() &&
    form.title.trim() &&
    form.bio.trim() &&
    form.avatar_url
  );

  if (loading) {
    return (
      <>
        <BusinessPortalNav />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#C6A664' }} />
        </div>
      </>
    );
  }

  const sectionTitle = (text: string) => (
    <p style={{
      fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: '#C6A664', marginBottom: '16px',
    }}>
      {text}
    </p>
  );

  const fieldLabel = (text: string, required = false) => (
    <Label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
      {text}{required && <span style={{ color: '#C6A664', marginLeft: '3px' }}>*</span>}
    </Label>
  );

  const inputStyle = {
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#FFFFFF',
  };

  return (
    <>
      <BusinessPortalNav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C6A664', marginBottom: '6px' }}>
              Business Portal
            </p>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF' }}>
              Your Profile
            </h1>
          </div>
          {requiredComplete && (
            <div className="flex items-center gap-2 shrink-0" style={{ color: '#22c55e', fontSize: '0.8125rem', fontWeight: 600 }}>
              <CheckCircle className="w-4 h-4" />
              Visible in directory
            </div>
          )}
        </div>

        {/* Completion notice */}
        {!requiredComplete && (
          <div style={{
            borderRadius: '10px', border: '1px solid rgba(198,166,100,0.25)',
            backgroundColor: 'rgba(198,166,100,0.05)', padding: '14px 18px',
            fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)',
          }}>
            Complete all <span style={{ color: '#C6A664' }}>required fields</span> to appear in the business member directory.
          </div>
        )}

        {/* ── PROFILE PHOTO ─────────────────────────────────────────── */}
        <section>
          {sectionTitle('Profile Photo')}
          <div className="flex items-center gap-6">
            {/* Avatar preview */}
            <div style={{
              width: '96px', height: '96px', borderRadius: '50%',
              border: '2px solid rgba(198,166,100,0.3)',
              overflow: 'hidden', position: 'relative', flexShrink: 0,
              backgroundColor: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {form.avatar_url ? (
                <Image src={form.avatar_url} alt="Headshot" fill style={{ objectFit: 'cover' }} unoptimized />
              ) : (
                <Camera style={{ width: '28px', height: '28px', color: 'rgba(255,255,255,0.2)' }} />
              )}
            </div>
            <div className="space-y-2">
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 16px', borderRadius: '8px',
                border: '1px solid rgba(198,166,100,0.4)',
                color: '#C6A664', fontSize: '0.875rem', fontWeight: 600,
                cursor: uploadingField === 'avatar_url' ? 'wait' : 'pointer',
                backgroundColor: 'rgba(198,166,100,0.08)',
              }}>
                {uploadingField === 'avatar_url' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload Headshot</>
                )}
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleImageUpload(e, 'avatar_url')}
                  disabled={!!uploadingField}
                />
              </label>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                JPG, PNG or WebP · Max 5MB · Required
              </p>
              {form.avatar_url && (
                <button
                  onClick={() => setForm(prev => ({ ...prev, avatar_url: '' }))}
                  style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── PERSONAL INFO ─────────────────────────────────────────── */}
        <section>
          {sectionTitle('Personal Information')}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                {fieldLabel('Full Name', true)}
                <Input
                  value={form.full_name}
                  onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Jane Smith"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-2">
                {fieldLabel('Email', true)}
                <Input
                  value={form.email}
                  disabled
                  style={{ ...inputStyle, opacity: 0.5, cursor: 'not-allowed' }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {fieldLabel('Phone Number')}
              <Input
                value={form.phone}
                onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="704-555-0100"
                style={inputStyle}
              />
            </div>
          </div>
        </section>

        {/* ── BUSINESS INFO ─────────────────────────────────────────── */}
        <section>
          {sectionTitle('Business Information')}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                {fieldLabel('Company Name', true)}
                <Input
                  value={form.company_name}
                  onChange={e => setForm(prev => ({ ...prev, company_name: e.target.value }))}
                  placeholder="Acme Corp"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-2">
                {fieldLabel('Title / Role', true)}
                <Input
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Founder & CEO"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="space-y-2">
              {fieldLabel('Biography', true)}
              <Textarea
                value={form.bio}
                onChange={e => setForm(prev => ({ ...prev, bio: e.target.value }))}
                placeholder="Tell other members about yourself and your business..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
          </div>
        </section>

        {/* ── LINKS ─────────────────────────────────────────────────── */}
        <section>
          {sectionTitle('Links & Socials')}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
                {fieldLabel('Website')}
              </div>
              <Input
                value={form.website_url}
                onChange={e => setForm(prev => ({ ...prev, website_url: e.target.value }))}
                placeholder="https://yourwebsite.com"
                style={inputStyle}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Linkedin className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
                {fieldLabel('LinkedIn')}
              </div>
              <Input
                value={form.linkedin_url}
                onChange={e => setForm(prev => ({ ...prev, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/yourprofile"
                style={inputStyle}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Instagram className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
                {fieldLabel('Instagram')}
              </div>
              <Input
                value={form.instagram_url}
                onChange={e => setForm(prev => ({ ...prev, instagram_url: e.target.value }))}
                placeholder="https://instagram.com/yourhandle"
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                {fieldLabel('TikTok')}
                <Input
                  value={form.tiktok_url}
                  onChange={e => setForm(prev => ({ ...prev, tiktok_url: e.target.value }))}
                  placeholder="https://tiktok.com/@yourhandle"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-2">
                {fieldLabel('Facebook')}
                <Input
                  value={form.facebook_url}
                  onChange={e => setForm(prev => ({ ...prev, facebook_url: e.target.value }))}
                  placeholder="https://facebook.com/yourpage"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── COMPANY LOGO ──────────────────────────────────────────── */}
        <section>
          {sectionTitle('Company Logo')}
          <div className="flex items-center gap-6">
            <div style={{
              width: '80px', height: '80px', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden', position: 'relative', flexShrink: 0,
              backgroundColor: 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {form.logo_url ? (
                <Image src={form.logo_url} alt="Company logo" fill style={{ objectFit: 'contain', padding: '8px' }} unoptimized />
              ) : (
                <Upload style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.15)' }} />
              )}
            </div>
            <div className="space-y-2">
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 16px', borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', fontWeight: 600,
                cursor: uploadingField === 'logo_url' ? 'wait' : 'pointer',
                backgroundColor: 'rgba(255,255,255,0.04)',
              }}>
                {uploadingField === 'logo_url' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Upload Logo</>
                )}
                <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  onChange={e => handleImageUpload(e, 'logo_url')}
                  disabled={!!uploadingField}
                />
              </label>
              <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>Optional · PNG with transparent background recommended</p>
              {form.logo_url && (
                <button
                  onClick={() => setForm(prev => ({ ...prev, logo_url: '' }))}
                  style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Remove logo
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── ADDITIONAL PHOTOS ─────────────────────────────────────── */}
        <section>
          {sectionTitle(`Additional Photos (${form.additional_photos.length}/${MAX_ADDITIONAL_PHOTOS})`)}
          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>
            Optional — showcase your business, team, or work with up to {MAX_ADDITIONAL_PHOTOS} photos.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {form.additional_photos.map((url, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Image src={url} alt={`Photo ${i + 1}`} fill style={{ objectFit: 'cover' }} unoptimized />
                <button
                  onClick={() => removeAdditionalPhoto(i)}
                  style={{
                    position: 'absolute', top: '4px', right: '4px',
                    width: '20px', height: '20px', borderRadius: '50%',
                    backgroundColor: 'rgba(0,0,0,0.7)', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '10px', height: '10px', color: '#FFFFFF' }} />
                </button>
              </div>
            ))}
            {form.additional_photos.length < MAX_ADDITIONAL_PHOTOS && (
              <label style={{
                aspectRatio: '1', borderRadius: '8px',
                border: '1px dashed rgba(255,255,255,0.12)',
                backgroundColor: 'rgba(255,255,255,0.02)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: uploadingField === 'additional_photos' ? 'wait' : 'pointer',
                gap: '6px',
              }}>
                {uploadingField === 'additional_photos' ? (
                  <Loader2 style={{ width: '20px', height: '20px', color: 'rgba(255,255,255,0.3)', animation: 'spin 1s linear infinite' }} />
                ) : (
                  <>
                    <Upload style={{ width: '18px', height: '18px', color: 'rgba(255,255,255,0.2)' }} />
                    <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>Add Photo</span>
                  </>
                )}
                <input
                  ref={additionalPhotoInput}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAdditionalPhoto}
                  disabled={!!uploadingField}
                />
              </label>
            )}
          </div>
        </section>

        {/* ── SAVE BUTTON ───────────────────────────────────────────── */}
        <div style={{ paddingBottom: '48px' }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: saving ? 'rgba(198,166,100,0.4)' : '#C6A664',
              color: '#1A1A1A', fontWeight: 700, fontSize: '0.9375rem',
              border: 'none', borderRadius: '10px', cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" /> Save Profile</>
            )}
          </Button>
        </div>

      </main>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}