'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { submitPartnerApplication } from '@/app/actions/partnerApplication';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type Props = {
  inviteToken?: string;
  defaultEmail?: string;
  emailReadOnly?: boolean;
  superAdminInvite?: boolean;
};

export function PartnerApplyForm({
  inviteToken,
  defaultEmail = '',
  emailReadOnly = false,
  superAdminInvite = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<File[]>([]);
  const [vendor, setVendor] = useState(false);
  const [venue, setVenue] = useState(false);
  const [sponsor, setSponsor] = useState(false);
  const [terms, setTerms] = useState(false);

  const partnerTypes = (): string[] => {
    const t = ['partner'];
    if (vendor) t.push('vendor');
    if (venue) t.push('venue');
    if (sponsor) t.push('sponsor');
    return t;
  };

  const handleExtraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const merged = [...extraPhotos, ...files].slice(0, 9);
    setExtraPhotos(merged);
    e.target.value = '';
  };

  const removeExtra = (idx: number) => {
    setExtraPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logoFile) {
      toast.error('Please upload a logo or profile photo');
      return;
    }
    if (!terms) {
      toast.error('Please accept the terms');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.set('firstName', firstName);
      fd.set('lastName', lastName);
      fd.set('email', email);
      fd.set('password', password);
      fd.set('confirmPassword', confirmPassword);
      fd.set('companyName', companyName);
      fd.set('phone', phone);
      fd.set('website', website);
      fd.set('description', description);
      fd.set('terms', 'true');
      fd.set('partnerTypes', JSON.stringify(partnerTypes()));
      if (inviteToken) fd.set('inviteToken', inviteToken);
      fd.set('logo', logoFile);
      extraPhotos.forEach((f) => fd.append('photos', f));

      const result = await submitPartnerApplication(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signErr) {
        toast.message('Application submitted — sign in with your new password.');
      }

      router.push('/partners/apply/submitted');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <div className="min-h-screen bg-[#0a0a0a] pt-20 pb-16 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image src="/logo-nav.png" alt="704 Collective" width={48} height={48} />
            </Link>
            <h1 className="mt-4 text-2xl font-semibold text-white">Partner application</h1>
            {superAdminInvite && (
              <p className="mt-2 text-sm text-[#D4A853]">
                You&apos;re joining through an invitation — your application will be approved immediately.
              </p>
            )}
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="space-y-5 rounded-2xl border border-white/10 bg-[#141414] p-6 sm:p-8"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pf-first" className="text-white/80">
                  First name
                </Label>
                <Input
                  id="pf-first"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="bg-[#1f1f1f] border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-last" className="text-white/80">
                  Last name
                </Label>
                <Input
                  id="pf-last"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="bg-[#1f1f1f] border-white/10 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-email" className="text-white/80">
                Email
              </Label>
              <Input
                id="pf-email"
                type="email"
                required
                readOnly={emailReadOnly}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white read-only:opacity-70"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-pass" className="text-white/80">
                Password
              </Label>
              <Input
                id="pf-pass"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-pass2" className="text-white/80">
                Confirm password
              </Label>
              <Input
                id="pf-pass2"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-company" className="text-white/80">
                Company name
              </Label>
              <Input
                id="pf-company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-phone" className="text-white/80">
                Phone
              </Label>
              <Input
                id="pf-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-web" className="text-white/80">
                Website <span className="text-white/40 font-normal">(optional)</span>
              </Label>
              <Input
                id="pf-web"
                type="url"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-desc" className="text-white/80">
                Business description
              </Label>
              <Textarea
                id="pf-desc"
                required
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-[#1f1f1f] border-white/10 text-white resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">
                Logo or profile photo <span className="text-[#D4A853]">*</span>
              </Label>
              <Input
                type="file"
                accept="image/*"
                required
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-[#D4A853] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#1A1A1A]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">
                Additional photos <span className="text-white/40 font-normal">(optional, up to 9)</span>
              </Label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handleExtraChange}
                className="text-white/70 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-white"
              />
              {extraPhotos.length > 0 && (
                <ul className="text-xs text-white/50 space-y-1">
                  {extraPhotos.map((f, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{f.name}</span>
                      <button type="button" onClick={() => removeExtra(i)} className="text-[#D4A853] shrink-0">
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
              <p className="text-sm font-medium text-white">Partner types</p>
              <div className="flex items-center gap-2 opacity-70">
                <Checkbox id="pt-partner" checked disabled />
                <Label htmlFor="pt-partner" className="text-white/80 cursor-default">
                  Partner <span className="text-white/40">(required)</span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="pt-vendor" checked={vendor} onCheckedChange={(v) => setVendor(v === true)} />
                <Label htmlFor="pt-vendor" className="text-white/80">
                  Vendor
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="pt-venue" checked={venue} onCheckedChange={(v) => setVenue(v === true)} />
                <Label htmlFor="pt-venue" className="text-white/80">
                  Venue
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="pt-sponsor" checked={sponsor} onCheckedChange={(v) => setSponsor(v === true)} />
                <Label htmlFor="pt-sponsor" className="text-white/80">
                  Sponsor
                </Label>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="pf-terms"
                checked={terms}
                onCheckedChange={(v) => setTerms(v === true)}
                className="mt-1"
              />
              <Label htmlFor="pf-terms" className="text-sm text-white/70 leading-snug cursor-pointer">
                I agree to the terms and confirm that the information provided is accurate.
              </Label>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#D4A853] hover:bg-[#C6A664] text-[#1A1A1A] font-semibold h-11"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit Application'
              )}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
