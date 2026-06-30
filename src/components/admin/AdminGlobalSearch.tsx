'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, User, Calendar, FileText, Settings, Users, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: 'contact' | 'event' | 'blog' | 'page';
  href: string;
  icon: React.ElementType;
}

const STATIC_PAGES: SearchResult[] = [
  { id: 'contacts', title: 'Contacts', subtitle: 'View all contacts', category: 'page', href: '/admin/contacts', icon: Users },
  { id: 'events', title: 'Events', subtitle: 'Manage events', category: 'page', href: '/admin?section=events', icon: Calendar },
  { id: 'blog', title: 'Blog', subtitle: 'Manage blog posts', category: 'page', href: '/admin/blog', icon: FileText },
  { id: 'settings', title: 'Settings', subtitle: 'Platform settings', category: 'page', href: '/admin/settings', icon: Settings },
  // HIDDEN 2026-06 — CRM/Partner hide-pass, restore later:
  // { id: 'invoices', title: 'Invoices', subtitle: 'Partner invoices', category: 'page', href: '/admin/invoices', icon: Settings },
  // { id: 'partners', title: 'Partners', subtitle: 'Manage partners', category: 'page', href: '/admin/partners', icon: Users },
  { id: 'hubs', title: 'Hubs', subtitle: 'Manage hubs', category: 'page', href: '/admin/hubs', icon: Settings },
  { id: 'referrals', title: 'Referrals', subtitle: 'View referrals', category: 'page', href: '/admin/referrals', icon: Settings },
  { id: 'inbox', title: 'Team Inbox', subtitle: 'Admin messaging', category: 'page', href: '/admin/inbox', icon: Settings },
  { id: 'financials', title: 'Financials', subtitle: 'Revenue & MRR', category: 'page', href: '/admin?section=financials', icon: Settings },
  { id: 'import', title: 'Import Members', subtitle: 'Bulk import', category: 'page', href: '/admin/import-members', icon: Users },
  { id: 'security', title: 'User Security', subtitle: 'Account security', category: 'page', href: '/admin/user-security', icon: Settings },
  { id: 'applications', title: 'Applications', subtitle: 'Business applications', category: 'page', href: '/admin?section=applications', icon: Users },
  // HIDDEN 2026-06 — CRM/Partner hide-pass, restore later:
  // { id: 'inquiries', title: 'Inquiries', subtitle: 'Partner inquiries', category: 'page', href: '/admin?section=inquiries', icon: Users },
  // { id: 'crm', title: 'CRM', subtitle: 'CRM overview', category: 'page', href: '/admin/crm', icon: Settings },
];

export function AdminGlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(STATIC_PAGES.slice(0, 6));
      return;
    }

    setLoading(true);
    const lower = q.toLowerCase();

    // Filter static pages
    const pageResults = STATIC_PAGES.filter(p =>
      p.title.toLowerCase().includes(lower) || p.subtitle.toLowerCase().includes(lower)
    );

    // Search contacts/profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, member_type')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .is('deleted_at', null)
      .limit(5);

    const contactResults: SearchResult[] = (profiles ?? []).map(p => ({
      id: `profile-${p.id}`,
      title: p.full_name || p.email,
      subtitle: `${p.email} - ${p.member_type || 'member'}`,
      category: 'contact' as const,
      href: `/admin/contacts/profiles%3A${p.id}`,
      icon: User,
    }));

    // Search events
    const { data: events } = await supabase
      .from('events')
      .select('id, title, start_time')
      .ilike('title', `%${q}%`)
      .order('start_time', { ascending: false })
      .limit(5);

    const eventResults: SearchResult[] = (events ?? []).map(e => ({
      id: `event-${e.id}`,
      title: e.title,
      subtitle: e.start_time ? new Date(e.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Event',
      category: 'event' as const,
      href: `/admin?section=events`,
      icon: Calendar,
    }));

    // Search blog posts
    const { data: posts } = await supabase
      .from('blog_posts')
      .select('id, title, slug')
      .ilike('title', `%${q}%`)
      .limit(3);

    const blogResults: SearchResult[] = (posts ?? []).map(p => ({
      id: `blog-${p.id}`,
      title: p.title,
      subtitle: 'Blog post',
      category: 'blog' as const,
      href: `/admin/blog/${p.id}/edit`,
      icon: FileText,
    }));

    setResults([...contactResults, ...eventResults, ...blogResults, ...pageResults].slice(0, 10));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      search('');
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open, search]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && results[selectedIndex]) {
        router.push(results[selectedIndex].href);
        setOpen(false);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, results, selectedIndex, router]);

  useEffect(() => { setSelectedIndex(0); }, [results]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const categoryLabel: Record<string, string> = {
    contact: 'Contact',
    event: 'Event',
    blog: 'Post',
    page: 'Page',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 12px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '0.8125rem',
          cursor: 'text',
          transition: 'all 150ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
      >
        <Search style={{ width: '14px', height: '14px', flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Search contacts, events...</span>
        <span style={{
          fontSize: '0.625rem',
          padding: '2px 6px',
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: '4px',
          color: 'rgba(255,255,255,0.3)',
          fontFamily: 'monospace',
        }}>Ctrl+K</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          right: 0,
          minWidth: '360px',
          backgroundColor: '#1A1A1A',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          zIndex: 100,
          overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {loading
              ? <Loader2 style={{ width: '16px', height: '16px', flexShrink: 0, color: 'rgba(255,255,255,0.4)', animation: 'spin 1s linear infinite' }} />
              : <Search style={{ width: '16px', height: '16px', flexShrink: 0, color: 'rgba(255,255,255,0.4)' }} />
            }
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search contacts, events, pages..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#FFFFFF',
                fontSize: '0.875rem',
              }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', padding: '2px' }}>
                <X style={{ width: '14px', height: '14px' }} />
              </button>
            )}
          </div>

          {/* Results */}
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            {results.length === 0 && !loading && query && (
              <p style={{ padding: '20px 16px', textAlign: 'center', fontSize: '0.8125rem', color: 'rgba(255,255,255,0.35)' }}>
                No results for &ldquo;{query}&rdquo;
              </p>
            )}
            {results.map((result, i) => {
              const Icon = result.icon;
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => { router.push(result.href); setOpen(false); }}
                  onMouseEnter={() => setSelectedIndex(i)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    backgroundColor: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 100ms ease',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon style={{ width: '15px', height: '15px', color: 'rgba(255,255,255,0.5)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.title}</p>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.subtitle}</p>
                  </div>
                  <span style={{ fontSize: '0.625rem', padding: '2px 6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '4px', color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                    {categoryLabel[result.category]}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '12px' }}>
            <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.25)' }}>up/down navigate</span>
            <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.25)' }}>enter open</span>
            <span style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.25)' }}>esc close</span>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
