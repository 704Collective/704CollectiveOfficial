'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { linkifyNodes } from '@/components/ui/LinkifiedText';

/**
 * Renders post/comment text with @mentions turned into links to the member's
 * profile, and URLs linkified exactly as LinkifiedText does. Display only: the
 * notification pipeline (post_mentions / event_discussion_mentions, bells,
 * email) is untouched and remains the source of truth for who was mentioned.
 *
 * Resolution order:
 *   1. `mentionUserIds` — ids saved with the item by the notifier. Exact.
 *   2. Name fallback — every `@` in the text yields up to 4-word candidate
 *      names, looked up by exact full_name. This is what makes mentions posted
 *      before this renderer existed light up. Ambiguous names (two live
 *      profiles with the same full_name) are never linked by name alone.
 * Matching at render is longest-name-first with a word boundary after the name,
 * mirroring the notifier, so "@Seed Social Grandfathered" never resolves to
 * "@Seed Social" + " Grandfathered".
 *
 * Navigation: /dashboard/directory/[id] redirects anyone who is not a business
 * member or admin back to /dashboard (existing gate in that page). So the
 * mention is a real link only for viewers who can open it; everyone else gets
 * the same highlighted mention and hover card without a dead-end tap.
 */

export interface MentionProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  member_type: string | null;
  role: string | null;
}

const MAX_NAME_WORDS = 4;
const TRAILING_PUNCT = /[.,;:!?)\]}"']+$/;
const BOUNDARY_AFTER = /[\s.,;:!?)\]}"']/;

/** Candidate full names that could follow each `@` in the text. Exported for tests. */
export function candidateNamesFromText(text: string): string[] {
  const out = new Set<string>();
  let at = text.indexOf('@');
  while (at !== -1) {
    const rest = text.slice(at + 1);
    const tokens = rest.split(/\s+/).slice(0, MAX_NAME_WORDS);
    const words: string[] = [];
    for (const raw of tokens) {
      const cleaned = raw.replace(TRAILING_PUNCT, '');
      if (!cleaned) break;
      words.push(cleaned);
      out.add(words.join(' '));
      // A token that ended in punctuation closes the name.
      if (cleaned.length !== raw.length) break;
    }
    at = text.indexOf('@', at + 1);
  }
  return [...out];
}

// ── Module-level resolution cache + microtask batching ─────────────────────
// A feed page mounts many MentionText instances at once; batching turns that
// into at most two profile queries per tick instead of two per comment.
const byId = new Map<string, MentionProfile | null>();
const byName = new Map<string, MentionProfile | null>();
const ambiguousNames = new Set<string>();
let pendingIds = new Set<string>();
let pendingNames = new Set<string>();
let flush: Promise<void> | null = null;

const SELECT = 'id, full_name, avatar_url, member_type, role';

async function fetchBatch(ids: string[], names: string[]) {
  const queries: PromiseLike<{ data: unknown }>[] = [];
  if (ids.length) {
    queries.push(supabase.from('profiles').select(SELECT).in('id', ids).is('deleted_at', null));
  }
  if (names.length) {
    queries.push(supabase.from('profiles').select(SELECT).in('full_name', names).is('deleted_at', null));
  }
  const results = await Promise.all(queries);
  const seenNames = new Map<string, string>(); // name -> first id
  for (const res of results) {
    for (const row of ((res.data as MentionProfile[] | null) ?? [])) {
      if (!row?.id || !row.full_name) continue;
      byId.set(row.id, row);
      const prior = seenNames.get(row.full_name);
      if (prior && prior !== row.id) {
        ambiguousNames.add(row.full_name);
        byName.set(row.full_name, null);
      } else {
        seenNames.set(row.full_name, row.id);
        if (!ambiguousNames.has(row.full_name)) byName.set(row.full_name, row);
      }
    }
  }
  for (const id of ids) if (!byId.has(id)) byId.set(id, null);
  for (const n of names) if (!byName.has(n)) byName.set(n, null);
}

function requestResolution(ids: string[], names: string[]): Promise<void> {
  for (const id of ids) if (!byId.has(id)) pendingIds.add(id);
  for (const n of names) if (!byName.has(n)) pendingNames.add(n);
  if (!pendingIds.size && !pendingNames.size) return Promise.resolve();
  if (!flush) {
    flush = Promise.resolve().then(async () => {
      const ids = [...pendingIds];
      const names = [...pendingNames];
      pendingIds = new Set();
      pendingNames = new Set();
      flush = null;
      try {
        await fetchBatch(ids, names);
      } catch {
        /* leave uncached; text stays flat */
      }
    });
  }
  return flush;
}

function readResolved(ids: string[], names: string[]): MentionProfile[] {
  const out = new Map<string, MentionProfile>();
  for (const id of ids) {
    const p = byId.get(id);
    if (p) out.set(p.id, p);
  }
  for (const n of names) {
    const p = byName.get(n);
    if (p && !out.has(p.id)) out.set(p.id, p);
  }
  return [...out.values()];
}

// ── Hover capability (desktop hover card vs touch tap) ─────────────────────
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
function subscribeHover(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(HOVER_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
const readHover = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(HOVER_QUERY).matches : false);
const readHoverServer = () => false;

function useHoverCapable(): boolean {
  return useSyncExternalStore(subscribeHover, readHover, readHoverServer);
}

// ── Segmenting ─────────────────────────────────────────────────────────────
type Segment = { kind: 'text'; value: string } | { kind: 'mention'; profile: MentionProfile; label: string };

function segmentText(text: string, profiles: MentionProfile[]): Segment[] {
  const sorted = [...profiles].sort((a, b) => b.full_name.length - a.full_name.length);
  const out: Segment[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@') {
      const rest = text.slice(i + 1);
      const hit = sorted.find((p) => {
        if (!rest.startsWith(p.full_name)) return false;
        const after = rest[p.full_name.length];
        return after === undefined || BOUNDARY_AFTER.test(after);
      });
      if (hit) {
        if (buf) out.push({ kind: 'text', value: buf });
        buf = '';
        out.push({ kind: 'mention', profile: hit, label: `@${hit.full_name}` });
        i += 1 + hit.full_name.length;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }
  if (buf) out.push({ kind: 'text', value: buf });
  return out;
}

function memberTypeLabel(p: MentionProfile): string {
  if (p.role === 'admin' || p.role === 'super_admin') return 'Admin';
  switch (p.member_type) {
    case 'social': return 'Social Member';
    case 'business': return 'Business Member';
    case 'partner': return 'Partner';
    default: return 'Member';
  }
}

function initials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function MentionLink({
  profile,
  label,
  hoverCapable,
  canOpenProfile,
}: {
  profile: MentionProfile;
  label: string;
  hoverCapable: boolean;
  canOpenProfile: boolean;
}) {
  const href = `/dashboard/directory/${profile.id}`;
  const className = 'font-medium text-primary break-words';
  const trigger = canOpenProfile ? (
    <Link href={href} data-testid="mention-link" data-mention-id={profile.id} data-linked="true" className={`${className} hover:underline`}>
      {label}
    </Link>
  ) : (
    <span data-testid="mention-link" data-mention-id={profile.id} data-linked="false" className={className}>
      {label}
    </span>
  );
  if (!hoverCapable) return trigger;
  return (
    <HoverCard openDelay={150} closeDelay={120}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-64 p-3" data-testid="mention-hover-card">
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 shrink-0">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs font-semibold" style={getInitialsAvatarStyle(profile.id)}>
              {initials(profile.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground">{memberTypeLabel(profile)}</p>
          </div>
        </div>
        {canOpenProfile && (
          <Link href={href} className="mt-3 inline-block text-xs font-semibold text-primary hover:underline" data-testid="mention-view-profile">
            View profile
          </Link>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
interface MentionTextProps {
  text: string;
  /** Saved mentioned_user_id values for this item (post_mentions / event_discussion_mentions). */
  mentionUserIds?: string[];
  className?: string;
}

export function MentionText({ text, mentionUserIds, className }: MentionTextProps) {
  const hoverCapable = useHoverCapable();
  const { profile: viewer, isAdmin, isSuperAdmin } = useAuth();
  // Mirrors the gate in /dashboard/directory/[id]: business members and admins only.
  const canOpenProfile = Boolean(isAdmin || isSuperAdmin || viewer?.member_type === 'business');
  const hasAt = text.includes('@');
  const ids = useMemo(() => (hasAt ? [...new Set(mentionUserIds ?? [])] : []), [hasAt, mentionUserIds]);
  const names = useMemo(() => (hasAt ? candidateNamesFromText(text) : []), [hasAt, text]);
  const idsKey = ids.join(',');
  const namesKey = names.join('\u0000');
  const [profiles, setProfiles] = useState<MentionProfile[]>([]);

  useEffect(() => {
    if (!hasAt) return;
    let cancelled = false;
    void requestResolution(ids, names).then(() => {
      if (!cancelled) setProfiles(readResolved(ids, names));
    });
    return () => {
      cancelled = true;
    };
    // ids/names are derived from the keys; the keys are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAt, idsKey, namesKey]);

  if (!hasAt || profiles.length === 0) {
    return <p className={className}>{linkifyNodes(text)}</p>;
  }

  const segments = segmentText(text, profiles);
  return (
    <p className={className}>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          linkifyNodes(seg.value, `s${i}-`)
        ) : (
          <MentionLink key={`m${i}`} profile={seg.profile} label={seg.label} hoverCapable={hoverCapable} canOpenProfile={canOpenProfile} />
        ),
      )}
    </p>
  );
}

export default MentionText;
