'use client';

import { useAuth } from '@/hooks/useAuth';
import { BusinessPortalNav } from '@/components/business/BusinessPortalNav';
import { AlertCircle, ArrowRight, Briefcase, Calendar, MessageSquare, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BusinessProfile {
  company_name: string | null;
  title: string | null;
  bio: string | null;
  is_visible: boolean;
}

const REQUIRED_FIELDS = ['headshot', 'first_name', 'last_name', 'company', 'title', 'email', 'bio'] as const;

export default function BusinessPortalPage() {
  const { user, profile } = useAuth();
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const p = profile as any;
  const firstName = p?.full_name?.split(' ')[0] || 'Member';

  useEffect(() => {
    if (!user) return;
    const fetchBusinessProfile = async () => {
      const { data } = await supabase
        .from('business_profiles')
        .select('company_name, title, bio, is_visible')
        .eq('user_id', user.id)
        .maybeSingle();
      setBusinessProfile(data);
      setProfileLoading(false);
    };
    fetchBusinessProfile();
  }, [user]);

  // Determine if profile is complete enough to appear in directory
  const hasHeadshot = !!p?.avatar_url;
  const hasName = !!(p?.full_name?.trim());
  const hasCompany = !!businessProfile?.company_name;
  const hasTitle = !!businessProfile?.title;
  const hasBio = !!businessProfile?.bio;
  const hasEmail = !!p?.email;

  const isProfileComplete = hasHeadshot && hasName && hasCompany && hasTitle && hasBio && hasEmail;
  const missingFields = [
    !hasHeadshot && 'Profile photo',
    !hasName && 'Full name',
    !hasCompany && 'Company',
    !hasTitle && 'Title / Role',
    !hasBio && 'Biography',
    !hasEmail && 'Email',
  ].filter(Boolean) as string[];

  const quickLinks = [
    {
      label: 'Business Feed',
      description: 'Share updates with fellow business members',
      href: '/business-portal/feed',
      icon: Briefcase,
      color: '#C6A664',
    },
    {
      label: 'Events',
      description: 'View and RSVP to exclusive business events',
      href: '/business-portal/events',
      icon: Calendar,
      color: '#C6A664',
    },
    {
      label: 'Member Directory',
      description: 'Connect with other business members',
      href: '/business-portal/directory',
      icon: Users,
      color: '#C6A664',
    },
    {
      label: 'Messages',
      description: 'Start a conversation or group chat',
      href: '/business-portal/messages',
      icon: MessageSquare,
      color: '#C6A664',
    },
  ];

  return (
    <>
      <BusinessPortalNav />
      <main id="main-content" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <p
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#C6A664',
              marginBottom: '6px',
            }}
          >
            Business Portal
          </p>
          <h1
            style={{
              fontSize: '1.875rem',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: 1.2,
            }}
          >
            Welcome back, {firstName}
          </h1>
        </div>

        {/* Incomplete profile alert */}
        {!profileLoading && !isProfileComplete && (
          <div
            style={{
              borderRadius: '12px',
              border: '1px solid rgba(198,166,100,0.3)',
              backgroundColor: 'rgba(198,166,100,0.06)',
              padding: '20px 24px',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="shrink-0 mt-0.5"
                style={{ width: '20px', height: '20px', color: '#C6A664' }}
              />
              <div className="flex-1 min-w-0">
                <p
                  style={{
                    fontWeight: 600,
                    color: '#FFFFFF',
                    fontSize: '0.9375rem',
                    marginBottom: '4px',
                  }}
                >
                  Your profile isn&apos;t visible in the directory yet
                </p>
                <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', marginBottom: '12px' }}>
                  Complete the following to appear in the business member directory:&nbsp;
                  <span style={{ color: 'rgba(255,255,255,0.75)' }}>
                    {missingFields.join(', ')}
                  </span>
                </p>
                <Link
                  href="/business-portal/profile"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#C6A664',
                    textDecoration: 'none',
                  }}
                >
                  Complete your profile
                  <ArrowRight style={{ width: '14px', height: '14px' }} />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Quick links grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {quickLinks.map(({ label, description, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                padding: '20px 24px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.07)',
                backgroundColor: 'rgba(255,255,255,0.03)',
                textDecoration: 'none',
                transition: 'border-color 0.2s, background-color 0.2s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(198,166,100,0.35)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(198,166,100,0.05)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)';
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(198,166,100,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon style={{ width: '18px', height: '18px', color: '#C6A664' }} />
              </div>
              <div>
                <p style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '0.9375rem', marginBottom: '2px' }}>
                  {label}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                  {description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {/* Back to social dashboard */}
        <div style={{ paddingTop: '8px' }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: '0.875rem',
              color: 'rgba(255,255,255,0.3)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
          >
            ← Back to Member Dashboard
          </Link>
        </div>

      </main>
    </>
  );
}