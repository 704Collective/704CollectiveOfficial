'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ChevronRight, ChevronLeft } from 'lucide-react';

type Step = 'account' | 'verify' | 'application' | 'done';

interface FormData {
  // Account
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  // Application
  company: string;
  title: string;
  industry: string;
  linkedinUrl: string;
  website: string;
  yearsInCharlotte: string;
  referralSource: string;
  conflictLesson: string;
  missingInCharlotte: string;
  oneYearGoal: string;
  rightIntro: string;
  recentWins: string;
  anythingElse: string;
}

const INITIAL_FORM: FormData = {
  firstName: '', lastName: '', email: '', phone: '', password: '',
  company: '', title: '', industry: '', linkedinUrl: '', website: '',
  yearsInCharlotte: '', referralSource: '', conflictLesson: '',
  missingInCharlotte: '', oneYearGoal: '', rightIntro: '',
  recentWins: '', anythingElse: '',
};

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full bg-border rounded-full h-1 mb-6">
      <div
        className="bg-primary h-1 rounded-full transition-all duration-300"
        style={{ width: `${(current / total) * 100}%` }}
      />
    </div>
  );
}

export default function BusinessApplicationPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [userId, setUserId] = useState<string | null>(null);

  const set = (key: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  // ── Step 1: Create account ──────────────────────────────────────
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          data: {
            full_name: `${form.firstName.trim()} ${form.lastName.trim()}`,
            phone: form.phone.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?source=business-apply`,
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          toast.error('An account with this email already exists. Try logging in.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.user) {
        setUserId(data.user.id);
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: form.email.trim().toLowerCase(),
          full_name: `${form.firstName.trim()} ${form.lastName.trim()}`,
          phone: form.phone.trim(),
          member_type: 'business_non_member',
          subscription_status: 'inactive',
        });
      }

      setStep('verify');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Submit application ──────────────────────────────────
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();

    const required = [
      'company', 'title', 'industry', 'yearsInCharlotte', 'referralSource',
      'conflictLesson', 'missingInCharlotte', 'oneYearGoal', 'rightIntro',
      'recentWins',
    ] as (keyof FormData)[];

    for (const field of required) {
      if (!form[field].trim()) {
        toast.error('Please fill out all required fields');
        return;
      }
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('business_applications').insert({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        title: form.title.trim() || null,
        industry: form.industry.trim() || null,
        linkedin_url: form.linkedinUrl.trim() || null,
        website: form.website.trim() || null,
        years_in_charlotte: form.yearsInCharlotte ? parseInt(form.yearsInCharlotte) : null,
        referral_source: form.referralSource.trim() || null,
        conflict_lesson: form.conflictLesson.trim() || null,
        missing_in_charlotte: form.missingInCharlotte.trim() || null,
        one_year_goal: form.oneYearGoal.trim() || null,
        right_intro: form.rightIntro.trim() || null,
        recent_wins: form.recentWins.trim() || null,
        anything_else: form.anythingElse.trim() || null,
        status: 'pending',
        profile_id: userId,
      });

      if (error) throw error;

      // Send notification email to admins
      await supabase.functions.invoke('send-email', {
        body: {
          to: 'hello@704collective.com',
          subject: `New Business Application: ${form.firstName} ${form.lastName}`,
          html: `
            <h2>New Business Application Received</h2>
            <p><strong>Name:</strong> ${form.firstName} ${form.lastName}</p>
            <p><strong>Email:</strong> ${form.email}</p>
            <p><strong>Company:</strong> ${form.company}</p>
            <p><strong>Title:</strong> ${form.title}</p>
            <p><strong>Industry:</strong> ${form.industry}</p>
            <p><a href="${window.location.origin}/admin?section=applications">Review in admin panel →</a></p>
          `,
        },
      });

      setStep('done');
    } catch (err) {
      toast.error('Failed to submit application. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Verify email screen ─────────────────────────────────────────
  if (step === 'verify') {
    return (
      <div className="min-h-screen bg-background flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
        <Nav />
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">Verify your email</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                We sent a confirmation link to <strong className="text-foreground">{form.email}</strong>.
                Click the link to verify your account, then come back here to fill out your application.
              </p>
            </div>
            <Button className="w-full" onClick={() => setStep('application')}>
              I've verified — continue to application
            </Button>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={async () => {
                await supabase.auth.resend({ type: 'signup', email: form.email });
                toast.success('Confirmation email resent');
              }}
            >
              Resend confirmation email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Thank you screen ────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-background flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
        <Nav />
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-md text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">Application submitted</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Thanks {form.firstName} — we review every application personally. Expect to hear from us within 48 hours.
              </p>
            </div>
            <Button className="w-full" onClick={() => router.push('/dashboard')}>
              Go to your portal
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Application form ────────────────────────────────────────────
  if (step === 'application') {
    return (
      <div className="min-h-screen bg-background flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
        <Nav />
        <div className="flex-1 px-4 py-12">
          <div className="w-full max-w-xl mx-auto space-y-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">704 Business Application</p>
              <h1 className="text-2xl font-semibold text-foreground mb-1">Tell us about yourself</h1>
              <p className="text-sm text-muted-foreground">All fields are required unless marked optional.</p>
            </div>

            <form onSubmit={handleSubmitApplication} className="space-y-6">

              {/* Professional info */}
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Professional Info</p>

                <div className="space-y-1.5">
                  <Label>Company *</Label>
                  <Input placeholder="Acme Corp" value={form.company} onChange={set('company')} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Title / Role *</Label>
                  <Input placeholder="CEO, Founder, VP of Marketing..." value={form.title} onChange={set('title')} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Industry *</Label>
                  <Input placeholder="Real estate, Tech, Finance..." value={form.industry} onChange={set('industry')} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>LinkedIn URL <span className="text-muted-foreground">(optional)</span></Label>
                    <Input placeholder="linkedin.com/in/..." value={form.linkedinUrl} onChange={set('linkedinUrl')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Website <span className="text-muted-foreground">(optional)</span></Label>
                    <Input placeholder="yourcompany.com" value={form.website} onChange={set('website')} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Years in Charlotte *</Label>
                  <Input type="number" min="0" max="100" placeholder="3" value={form.yearsInCharlotte} onChange={set('yearsInCharlotte')} required />
                </div>
                <div className="space-y-1.5">
                  <Label>How did you hear about 704 Collective? *</Label>
                  <Input placeholder="Friend, Instagram, CLTBucketlist..." value={form.referralSource} onChange={set('referralSource')} required />
                </div>
              </div>

              {/* Application questions */}
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Application Questions</p>

                {[
                  {
                    key: 'conflictLesson' as keyof FormData,
                    label: 'Describe a recent conflict or issue you\'ve had (personal or business) and what you learned from solving it. *',
                    placeholder: 'Be honest — this tells us more about you than any résumé.',
                  },
                  {
                    key: 'missingInCharlotte' as keyof FormData,
                    label: 'What do you think is missing in Charlotte? *',
                    placeholder: 'What gap do you see that nobody is filling?',
                  },
                  {
                    key: 'oneYearGoal' as keyof FormData,
                    label: 'One year from now, what do you expect to have gotten out of joining 704 Collective\'s Business Membership? *',
                    placeholder: 'Be specific — what does success look like for you?',
                  },
                  {
                    key: 'rightIntro' as keyof FormData,
                    label: 'What are you working on right now that you think the right introduction or solution could fix? *',
                    placeholder: 'A challenge, a bottleneck, a door you\'re trying to open...',
                  },
                  {
                    key: 'recentWins' as keyof FormData,
                    label: 'Describe a few wins you\'ve had recently with your business. *',
                    placeholder: 'Could be revenue milestones, new partnerships, product launches...',
                  },
                  {
                    key: 'anythingElse' as keyof FormData,
                    label: 'Anything else we should know about you, your business, your lifestyle?',
                    placeholder: 'This is your space — say whatever didn\'t fit above.',
                    optional: true,
                  },
                ].map(q => (
                  <div key={q.key} className="space-y-1.5">
                    <Label>{q.label}</Label>
                    <Textarea
                      placeholder={q.placeholder}
                      value={form[q.key]}
                      onChange={set(q.key)}
                      required={!q.optional}
                      rows={4}
                      className="resize-none"
                    />
                  </div>
                ))}
              </div>

              <Button type="submit" className="w-full" disabled={loading} size="lg">
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</>
                  : 'Submit Application'
                }
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                We review every application personally and respond within 48 hours.
              </p>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ── Account creation form ───────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1A1A1A' }}>
      <Nav />
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Step 1 of 2</p>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Create your account</h1>
            <p className="text-muted-foreground text-sm">
              First, let's get your account set up. Then you'll fill out the application.
            </p>
          </div>

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name *</Label>
                <Input id="firstName" placeholder="Adam" value={form.firstName} onChange={set('firstName')} required autoComplete="given-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name *</Label>
                <Input id="lastName" placeholder="Gould" value={form.lastName} onChange={set('lastName')} required autoComplete="family-name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input id="phone" type="tel" placeholder="704-555-0100" value={form.phone} onChange={set('phone')} required autoComplete="tel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input id="password" type="password" placeholder="At least 8 characters" value={form.password} onChange={set('password')} required autoComplete="new-password" minLength={8} />
            </div>

            <Button type="submit" className="w-full" disabled={loading} size="lg">
              {loading
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating account...</>
                : <>Create Account & Continue <ChevronRight className="w-4 h-4 ml-1" /></>
              }
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <a href="/login" className="text-primary hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}