'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { BusinessPortalNav } from '@/components/business/BusinessPortalNav';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Search, Globe, Linkedin, Instagram, MessageSquare } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import Link from 'next/link';

interface DirectoryMember {
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  company_name: string;
  title: string;
  bio: string;
  website_url: string | null;
  linkedin_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
  logo_url: string | null;
}

export default function BusinessDirectoryPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const fetchDirectory = async () => {
      // Join business_profiles with profiles, only show complete + visible profiles
      const { data, error } = await supabase
        .from('business_profiles')
        .select(`
          user_id,
          company_name,
          title,
          bio,
          website_url,
          linkedin_url,
          instagram_url,
          tiktok_url,
          facebook_url,
          logo_url,
          profiles!inner (
            full_name,
            email,
            avatar_url,
            member_type,
            subscription_status,
            membership_override,
            deleted_at
          )
        `)
        .eq('is_visible', true)
        .not('company_name', 'is', null)
        .not('title', 'is', null)
        .not('bio', 'is', null)
        .filter('profiles.deleted_at', 'is', null)
        .filter('profiles.member_type', 'eq', 'business');

      if (error) {
        console.error('[Directory] fetch error:', error);
        setLoading(false);
        return;
      }

      // Filter to only profiles with headshots + all required fields
      const complete = (data || [])
        .filter((bp: any) => {
          const p = bp.profiles;
          return (
            p?.avatar_url &&
            p?.full_name?.trim() &&
            p?.email &&
            bp.company_name?.trim() &&
            bp.title?.trim() &&
            bp.bio?.trim()
          );
        })
        .map((bp: any) => ({
          user_id: bp.user_id,
          full_name: bp.profiles.full_name,
          email: bp.profiles.email,
          avatar_url: bp.profiles.avatar_url,
          company_name: bp.company_name,
          title: bp.title,
          bio: bp.bio,
          website_url: bp.website_url,
          linkedin_url: bp.linkedin_url,
          instagram_url: bp.instagram_url,
          tiktok_url: bp.tiktok_url,
          facebook_url: bp.facebook_url,
          logo_url: bp.logo_url,
        }));

      setMembers(complete);
      setLoading(false);
    };

    fetchDirectory();
  }, []);

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      m.full_name.toLowerCase().includes(q) ||
      m.company_name.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.bio.toLowerCase().includes(q)
    );
  });

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <BusinessPortalNav />
      <main id="main-content" className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p style={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#C6A664', marginBottom: '6px' }}>
              Business Portal
            </p>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#FFFFFF' }}>
              Member Directory
            </h1>
            {!loading && (
              <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
                {filtered.length} {filtered.length === 1 ? 'member' : 'members'}
              </p>
            )}
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            <Input
              placeholder="Search by name, company, role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                paddingLeft: '36px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#FFFFFF',
              }}
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[14px] border border-white/[0.07] bg-[#111111] p-5 space-y-4"
              >
                <div className="flex gap-4">
                  <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <Skeleton className="h-4 w-3/5 max-w-full" />
                    <Skeleton className="h-3 w-2/5 max-w-full" />
                  </div>
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-8 w-28 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-24">
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.9375rem' }}>
              {search ? 'No members match your search.' : 'No members in the directory yet.'}
            </p>
          </div>
        )}

        {/* Grid */}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(member => {
              const isExpanded = expanded === member.user_id;
              const isCurrentUser = member.user_id === user?.id;

              return (
                <div
                  key={member.user_id}
                  style={{
                    borderRadius: '14px',
                    border: '1px solid rgba(255,255,255,0.07)',
                    backgroundColor: '#111111',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(198,166,100,0.25)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                  }}
                >
                  {/* Card top */}
                  <div style={{ padding: '20px 20px 16px' }}>
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div style={{
                        width: '60px', height: '60px', borderRadius: '50%',
                        overflow: 'hidden', position: 'relative', flexShrink: 0,
                        backgroundColor: 'rgba(198,166,100,0.1)',
                        border: '2px solid rgba(198,166,100,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {member.avatar_url ? (
                          <Image src={member.avatar_url} alt={member.full_name} fill style={{ objectFit: 'cover' }} unoptimized />
                        ) : (
                          <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#C6A664' }}>
                            {getInitials(member.full_name)}
                          </span>
                        )}
                      </div>

                      {/* Name + company */}
                      <div className="flex-1 min-w-0">
                        <p style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.9375rem', marginBottom: '2px', lineHeight: 1.3 }}>
                          {member.full_name}
                          {isCurrentUser && (
                            <span style={{ fontSize: '0.6875rem', color: '#C6A664', marginLeft: '6px', fontWeight: 600 }}>You</span>
                          )}
                        </p>
                        <p style={{ fontSize: '0.8125rem', color: '#C6A664', fontWeight: 600, marginBottom: '2px' }}>
                          {member.title}
                        </p>
                        <div className="flex items-center gap-2">
                          {member.logo_url ? (
                            <div style={{ width: '16px', height: '16px', position: 'relative', flexShrink: 0 }}>
                              <Image src={member.logo_url} alt={member.company_name} fill style={{ objectFit: 'contain' }} unoptimized />
                            </div>
                          ) : null}
                          <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {member.company_name}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bio */}
                    <p
                      style={{
                        fontSize: '0.8125rem',
                        color: 'rgba(255,255,255,0.45)',
                        lineHeight: 1.6,
                        marginTop: '14px',
                        display: '-webkit-box',
                        WebkitLineClamp: isExpanded ? undefined : 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: isExpanded ? 'visible' : 'hidden',
                      }}
                    >
                      {member.bio}
                    </p>
                    {member.bio.length > 120 && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : member.user_id)}
                        style={{
                          fontSize: '0.75rem', color: '#C6A664', background: 'none',
                          border: 'none', cursor: 'pointer', padding: '4px 0 0', fontWeight: 600,
                        }}
                      >
                        {isExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>

                  {/* Card footer */}
                  <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}>
                    {/* Social links */}
                    <div className="flex items-center gap-3">
                      {member.linkedin_url && (
                        <a href={member.linkedin_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'rgba(255,255,255,0.3)', transition: 'color 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#C6A664'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
                        >
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {member.instagram_url && (
                        <a href={member.instagram_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'rgba(255,255,255,0.3)', transition: 'color 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#C6A664'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
                        >
                          <Instagram className="w-4 h-4" />
                        </a>
                      )}
                      {member.website_url && (
                        <a href={member.website_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'rgba(255,255,255,0.3)', transition: 'color 0.15s' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#C6A664'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'; }}
                        >
                          <Globe className="w-4 h-4" />
                        </a>
                      )}
                    </div>

                    {/* Message button */}
                    {!isCurrentUser && (
                      <Link
                        href={`/business-portal/messages?dm=${member.user_id}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: '6px',
                          border: '1px solid rgba(198,166,100,0.3)',
                          color: '#C6A664', fontSize: '0.8125rem', fontWeight: 600,
                          textDecoration: 'none', backgroundColor: 'rgba(198,166,100,0.06)',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(198,166,100,0.12)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(198,166,100,0.06)'; }}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Message
                      </Link>
                    )}
                    {isCurrentUser && (
                      <Link
                        href="/business-portal/profile"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.4)', fontSize: '0.8125rem', fontWeight: 600,
                          textDecoration: 'none',
                        }}
                      >
                        Edit Profile
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}