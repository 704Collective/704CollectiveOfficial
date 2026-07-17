'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SOCIAL_TIER } from '@/lib/pricing';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import TurnstileWidget, { TURNSTILE_ENABLED, type TurnstileWidgetHandle } from '@/components/TurnstileWidget';
import { toast } from 'sonner';
import {
  Crown, Briefcase, Calendar, Settings, FileText,
  Clock, CheckCircle2, XCircle, ChevronRight, Loader2, Mail,
} from 'lucide-react';
import { format } from 'date-fns';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  member_type: string | null;
  application_status?: string | null;
}

interface Application {
  id: string;
  status: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  title: string | null;
  industry: string | null;
  years_in_charlotte: number | null;
  referral_source: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website: string | null;
  why_join: string | null;
  what_bring: string | null;
  goals: string | null;
  conflict_lesson: string | null;
  missing_in_charlotte: string | null;
  one_year_goal: string | null;
  right_intro: string | null;
  recent_wins: string | null;
  anything_else: string | null;
  billing_plan: string | null;
}

type Tab = 'dashboard' | 'events' | 'settings' | 'application';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending:    { label: 'Pending Review',  icon: Clock,         color: 'text-yellow-400' },
  reviewing:  { label: 'Under Review',    icon: Clock,         color: 'text-blue-400' },
  approved:   { label: 'Approved',        icon: CheckCircle2,  color: 'text-green-400' },
  denied:     { label: 'Not Accepted',    icon: XCircle,       color: 'text-red-400' },
  waitlisted: { label: 'Waitlisted',      icon: Clock,         color: 'text-orange-400' },
};

const SOCIAL_PERKS = [
  '8+ curated social events per month',
  'Free RSVPs to all member events',
  '+1 guest pass per event',
  'Wellness days - cold plunge, sauna, run club',
  'Member-only event access',
  'Charlotte insider deals and early access',
  'Community feed and member directory',
  'Calendar sync for all events',
];

const BUSINESS_PERKS = [
  'Everything in Social, plus:',
  'Monthly business strategy meetings',
  'Exclusive workshops and guest speakers',
  'Private dinners at Charlotte\'s best restaurants',
  'Strategic introductions from the founding team',
  'Vetted professional network access',
  'Business resource library',
  'Priority to all events and programs',
];

interface NonMemberDashboardProps {
  profile: Profile;
  application?: Application | null;
}

export function NonMemberDashboard({ profile, application }: NonMemberDashboardProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [resetCaptchaToken, setResetCaptchaToken] = useState('');
  const resetTurnstileRef = useRef<TurnstileWidgetHandle>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const isBusinessNonMember = profile.member_type === 'business_non_member';
  const isSocialNonMember = profile.member_type === 'social_non_member' || profile.member_type === 'non_member';
  const firstName = profile.full_name?.split(' ')[0] ?? 'there';

  const appStatus = application?.status ?? 'pending';
  const statusConfig = STATUS_CONFIG[appStatus] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  const handleJoinSocial = () => router.push('/join/checkout');
  const handleApplyBusiness = () => router.push('/apply/business');

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setSendingEmail(true);
    try {
      await supabase.functions.invoke('send-email', {
        body: {
          to: 'hello@704collective.com',
          subject: `Application Question from ${profile.full_name ?? profile.email}: ${emailSubject}`,
          html: `<p><strong>From:</strong> ${profile.full_name ?? ''} (${profile.email})</p><p>${emailBody.replace(/\n/g, '<br/>')}</p>`,
        },
      });
      setEmailSent(true);
      toast.success('Message sent to 704 Collective team');
    } catch {
      toast.error('Failed to send message');
    } finally {
      setSendingEmail(false);
    }
  };

  // ── Tab navigation ─────────────────────────────────────────────
  const tabs = [
    { id: 'dashboard' as Tab, label: 'Home',    icon: Crown },
    { id: 'events'    as Tab, label: 'Events',  icon: Calendar },
    { id: 'settings'  as Tab, label: 'Settings', icon: Settings },
    ...(isBusinessNonMember ? [{ id: 'application' as Tab, label: 'Application', icon: FileText }] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile tab bar */}
      <div className="sticky top-14 z-10 bg-background border-b border-border">
        <div className="flex overflow-x-auto scrollbar-none">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <main id="main-content" className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── DASHBOARD TAB ── */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-semibold text-foreground">
              Hey {firstName} 👋
            </h1>

            {/* Inactive membership card */}
            <div className="rounded-xl border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Membership</p>
                  <p className="font-semibold text-foreground">Inactive</p>
                </div>
                <Badge variant="outline" className="text-xs text-muted-foreground">Non-Member</Badge>
              </div>

              {isSocialNonMember && (
                <>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    You're in the system but haven't activated your membership yet. Join Social for {SOCIAL_TIER.monthlyPriceShort} to unlock everything.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button className="flex-1" onClick={handleJoinSocial}>
                      <Crown className="w-4 h-4 mr-2" />
                      Join Social - {SOCIAL_TIER.monthlyPriceShort}
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={handleApplyBusiness}>
                      <Briefcase className="w-4 h-4 mr-2" />
                      Apply for Business
                    </Button>
                  </div>
                </>
              )}

              {isBusinessNonMember && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Your business membership application is being reviewed. We'll be in touch soon.
                </p>
              )}
            </div>

            {/* Perks list */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">
                {isSocialNonMember ? 'What you unlock with Social membership' : 'What Business members get'}
              </p>
              <ul className="space-y-2">
                {(isSocialNonMember ? SOCIAL_PERKS : BUSINESS_PERKS).map((perk, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-0.5 shrink-0">-</span>
                    {perk}
                  </li>
                ))}
              </ul>
              {isSocialNonMember && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleJoinSocial}>
                  Get access for {SOCIAL_TIER.monthlyPriceShort}
                </Button>
              )}
            </div>

            {/* Business membership nudge for social non-members */}
            {isSocialNonMember && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-primary" />
                  Think you're a fit for 704 Business?
                </p>
                <p className="text-sm text-muted-foreground">
                  Strategic networking, private dinners, monthly business meetings, and a vetted professional network. Application-only.
                </p>
                <Button variant="outline" size="sm" onClick={handleApplyBusiness}>
                  Learn more & apply <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── EVENTS TAB ── */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Events</h2>
            <p className="text-sm text-muted-foreground">
              Browse upcoming events. As a non-member you can purchase tickets to public events.
              Member-only events require an active membership.
            </p>
            <Button className="w-full sm:w-auto" onClick={() => router.push('/events')}>
              <Calendar className="w-4 h-4 mr-2" />
              Browse Events
            </Button>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Account Settings</h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              <div className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Profile</p>
                <div className="space-y-1 text-sm">
                  <p className="text-foreground font-medium">{profile.full_name ?? 'No name set'}</p>
                  <p className="text-muted-foreground">{profile.email}</p>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <Button variant="outline" size="sm" className="w-full" onClick={() => router.push('/settings')}>
                  Edit Profile
                </Button>
                <TurnstileWidget
                  ref={resetTurnstileRef}
                  onSuccess={setResetCaptchaToken}
                  onExpire={() => setResetCaptchaToken('')}
                  onError={() => setResetCaptchaToken('')}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={TURNSTILE_ENABLED && !resetCaptchaToken}
                  onClick={async () => {
                    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
                      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
                      captchaToken: resetCaptchaToken || undefined,
                    });
                    resetTurnstileRef.current?.reset();
                    setResetCaptchaToken('');
                    if (error) {
                      toast.error(error.message);
                    } else {
                      toast.success('Password reset email sent');
                    }
                  }}
                >
                  Reset Password
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── APPLICATION TAB (business non-members only) ── */}
        {activeTab === 'application' && isBusinessNonMember && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your Application</h2>
              {application && (
                <div className={`flex items-center gap-1.5 text-sm font-medium ${statusConfig.color}`}>
                  <StatusIcon className="w-4 h-4" />
                  {statusConfig.label}
                </div>
              )}
            </div>

            {!application ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <p className="text-muted-foreground text-sm">No application found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status card */}
                <div className={`rounded-xl border p-4 ${
                  appStatus === 'approved' ? 'border-green-500/30 bg-green-500/5' :
                  appStatus === 'denied' ? 'border-red-500/30 bg-red-500/5' :
                  appStatus === 'waitlisted' ? 'border-orange-500/30 bg-orange-500/5' :
                  'border-yellow-500/30 bg-yellow-500/5'
                }`}>
                  <div className={`flex items-center gap-2 font-medium mb-1 ${statusConfig.color}`}>
                    <StatusIcon className="w-4 h-4" />
                    {statusConfig.label}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {appStatus === 'pending' && 'Your application is in our queue. We review every application personally - expect to hear from us within 48 hours.'}
                    {appStatus === 'reviewing' && 'Our team is currently reviewing your application. We\'ll be in touch shortly.'}
                    {appStatus === 'approved' && 'Congratulations! Your application has been approved. Check your email for next steps.'}
                    {appStatus === 'denied' && 'We appreciate your interest. Your application wasn\'t a fit at this time. You\'re welcome to join as a Social member.'}
                    {appStatus === 'waitlisted' && 'You\'ve been added to our waitlist. We\'ll reach out when a spot opens up. You\'re also welcome to join as a Social member in the meantime.'}
                  </p>
                  {(appStatus === 'denied' || appStatus === 'waitlisted') && (
                    <Button size="sm" className="mt-3" onClick={handleJoinSocial}>
                      Join as Social Member - {SOCIAL_TIER.monthlyPriceShort}
                    </Button>
                  )}
                </div>

                {/* Full application read-only */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Your Submitted Application - {format(new Date(application.created_at), 'MMMM d, yyyy')}
                  </p>

                  {[
                    { label: 'Name', value: `${application.first_name} ${application.last_name}` },
                    { label: 'Email', value: application.email },
                    { label: 'Phone', value: application.phone },
                    { label: 'Company', value: application.company },
                    { label: 'Title / Role', value: application.title },
                    { label: 'Industry', value: application.industry },
                    { label: 'LinkedIn', value: application.linkedin_url },
                    { label: 'Website', value: application.website },
                    { label: 'Years in Charlotte', value: application.years_in_charlotte?.toString() },
                    { label: 'How did you hear about us?', value: application.referral_source },
                    { label: 'Describe a recent conflict and what you learned', value: application.conflict_lesson },
                    { label: 'What do you think is missing in Charlotte?', value: application.missing_in_charlotte },
                    { label: 'One year from now, what do you expect to have gotten out of joining?', value: application.one_year_goal },
                    { label: 'What are you working on that the right introduction or solution could fix?', value: application.right_intro },
                    { label: 'Describe a few recent wins with your business', value: application.recent_wins },
                    { label: 'Anything else we should know?', value: application.anything_else },
                  ].filter(f => f.value).map((field, i) => (
                    <div key={i}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{field.label}</p>
                      <p className="text-sm text-foreground leading-relaxed">{field.value}</p>
                    </div>
                  ))}
                </div>

                {/* Email us form */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Made a mistake in your application?
                  </p>
                  {emailSent ? (
                    <p className="text-sm text-green-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      Message sent - we'll get back to you soon.
                    </p>
                  ) : (
                    <form onSubmit={handleSendEmail} className="space-y-3">
                      <input
                        type="text"
                        placeholder="Subject"
                        value={emailSubject}
                        onChange={e => setEmailSubject(e.target.value)}
                        required
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <textarea
                        placeholder="Describe what you'd like to change or clarify..."
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        required
                        rows={4}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                      />
                      <Button type="submit" variant="outline" size="sm" disabled={sendingEmail}>
                        {sendingEmail ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Sending...</> : 'Email us about it'}
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}