'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import Image from 'next/image';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { savePartnerListingForm } from '@/app/actions/partnerPortalActions';

type ListingRow = {
  company_name: string;
  description: string;
  website: string | null;
  phone: string | null;
  logo_url: string | null;
  photo_urls: string[];
  partner_types: string[];
};

const EXTRA_TYPES = [
  { key: 'vendor', label: 'Vendor' },
  { key: 'venue', label: 'Venue' },
  { key: 'sponsor', label: 'Sponsor' },
] as const;

export default function PartnerListingPage() {
  const { profile } = useAuth();
  const p = profile as Record<string, unknown> | null;
  const partnerApproved = (p?.partner_status as string) === 'approved';

  const [listing, setListing] = useState<ListingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [vendor, setVendor] = useState(false);
  const [venue, setVenue] = useState(false);
  const [sponsor, setSponsor] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('partner_listings')
      .select('company_name, description, website, phone, logo_url, photo_urls, partner_types')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (data) {
      const row = data as ListingRow;
      setListing(row);
      setCompanyName(row.company_name);
      setDescription(row.description);
      setWebsite(row.website ?? '');
      setPhone(row.phone ?? '');
      setLogoPreview(row.logo_url);
      setPhotos([...(row.photo_urls ?? [])].slice(0, 9));
      setVendor(row.partner_types?.includes('vendor') ?? false);
      setVenue(row.partner_types?.includes('venue') ?? false);
      setSponsor(row.partner_types?.includes('sponsor') ?? false);
    } else {
      setListing(null);
      setCompanyName('');
      setDescription('');
      setWebsite('');
      setPhone('');
      setLogoPreview(null);
      setPhotos([]);
      setVendor(false);
      setVenue(false);
      setSponsor(false);
    }
    setLogoFile(null);
    setNewPhotoFiles([]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  function onLogoChange(f: File | null) {
    setLogoFile(f);
    if (f) {
      setLogoPreview(URL.createObjectURL(f));
    } else if (listing?.logo_url) {
      setLogoPreview(listing.logo_url);
    } else {
      setLogoPreview(null);
    }
  }

  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      setNewPhotoFiles((prev) => {
        const next = [...prev];
        let room = 9 - photos.length - next.length;
        for (let i = 0; i < files.length && room > 0; i++) {
          const f = files[i];
          if (f.type.startsWith('image/')) {
            next.push(f);
            room--;
          }
        }
        return next;
      });
    },
    [photos.length]
  );

  async function onSave() {
    const types = ['partner'];
    if (vendor) types.push('vendor');
    if (venue) types.push('venue');
    if (sponsor) types.push('sponsor');

    const fd = new FormData();
    fd.set('companyName', companyName.trim());
    fd.set('description', description.trim());
    fd.set('website', website.trim());
    fd.set('phone', phone.trim());
    fd.set('partnerTypes', JSON.stringify(types));
    fd.set('existingPhotos', JSON.stringify(photos));
    if (listing?.logo_url && !logoFile) {
      fd.set('logoUrlExisting', listing.logo_url);
    }
    if (logoFile) {
      fd.set('logo', logoFile);
    }
    newPhotoFiles.forEach((f) => fd.append('newPhotos', f));

    setSaving(true);
    const res = await savePartnerListingForm(fd);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Listing saved');
    await load();
  }

  function removePhotoUrl(url: string) {
    setPhotos((prev) => prev.filter((u) => u !== url));
  }

  if (!partnerApproved) {
    return (
      <p className="text-white/50 text-center py-16">
        Listing management is available once your partner application is approved.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#C6A664]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-white">My listing</h2>
        <p className="text-sm text-white/50 mt-1">
          Your public partner listing and the types of collaboration you offer.
        </p>
      </div>

      {!listing && (
        <p className="text-sm text-amber-200/90 border border-amber-500/25 rounded-lg p-4 bg-amber-500/5">
          You don&apos;t have a listing yet. Add your company details and logo below, then save to create one.
        </p>
      )}

      <div className="space-y-6 rounded-xl border border-white/10 p-6 bg-white/[0.02]">
        <div className="space-y-2">
          <Label className="text-white/80">Company name</Label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="bg-white/5 border-white/10"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white/80">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[140px] bg-white/5 border-white/10"
            placeholder="Tell members about your business…"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-white/80">Website</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-white/5 border-white/10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white/80">Logo (required)</Label>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative h-24 w-24 rounded-lg overflow-hidden border border-white/10 bg-white/5">
              {logoPreview ? (
                <Image src={logoPreview} alt="" fill className="object-cover" unoptimized />
              ) : null}
            </div>
            <input
              type="file"
              accept="image/*"
              className="text-sm text-white/60"
              onChange={(e) => onLogoChange(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white/80">Additional photos (up to 9)</Label>
          <div
            className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-white/45"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <p>Drag and drop images here, or</p>
            <Button
              type="button"
              variant="outline"
              className="mt-2 border-white/20 text-white"
              onClick={() => fileRef.current?.click()}
            >
              Browse files
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">
            {photos.map((url) => (
              <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group">
                <Image src={url} alt="" fill className="object-cover" unoptimized />
                <button
                  type="button"
                  className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removePhotoUrl(url)}
                  aria-label="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {newPhotoFiles.map((f, i) => (
              <div key={`${f.name}-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-[#C6A664]/30">
                <Image src={URL.createObjectURL(f)} alt="" fill className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-white/80">Partner types</Label>
          <p className="text-xs text-white/40">Partner is always included. Add other collaboration types you offer.</p>
          <div className="space-y-2">
            {EXTRA_TYPES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <Checkbox
                  checked={key === 'vendor' ? vendor : key === 'venue' ? venue : sponsor}
                  onCheckedChange={(c) => {
                    const v = c === true;
                    if (key === 'vendor') setVendor(v);
                    if (key === 'venue') setVenue(v);
                    if (key === 'sponsor') setSponsor(v);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <Button
          type="button"
          className="bg-[#C6A664] text-black hover:bg-[#d4b87a]"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save listing'}
        </Button>
      </div>
    </div>
  );
}
