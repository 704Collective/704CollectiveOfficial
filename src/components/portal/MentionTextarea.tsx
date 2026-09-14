'use client';

import { useCallback, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { applyMemberVisibility, SUGGESTABLE_MEMBER_TYPES } from '@/lib/memberVisibility';
import { cn } from '@/lib/utils';

/**
 * Feed composer textarea with @mention autocomplete. One shared copy for
 * CreatePost and FeedPost comments (previously duplicated in both).
 *
 * Audience is unchanged from before: any non-deleted, non-internal profile
 * whose full_name matches the typed fragment, limit 6. Trigger is now
 * space-tolerant like EventMentionTextarea, so "@Kris P" keeps suggesting.
 */

export interface MentionSuggestion {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// Space-tolerant, capped at MAX_QUERY_WORDS words so an ordinary sentence typed
// after an @ stops querying once it clearly is not a name.
const MAX_QUERY_WORDS = 4;
const TRIGGER = /@([\w ]*)$/;

export function extractMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(TRIGGER);
  if (!match) return null;
  const q = match[1];
  if (q.trim().split(/\s+/).filter(Boolean).length > MAX_QUERY_WORDS) return null;
  return q;
}

export function insertMention(text: string, cursorPos: number, fullName: string): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const match = before.match(TRIGGER);
  if (!match) return { newText: text, newCursor: cursorPos };
  const replaced = before.slice(0, before.length - match[0].length) + `@${fullName} `;
  return { newText: replaced + after, newCursor: replaced.length };
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  onSubmit,
  rows = 2,
  mentionAvatarBusiness = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
  rows?: number;
  mentionAvatarBusiness?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    // Only visible members (shared predicate) who hold a real member tier are
    // suggestable. Leads, prospects and never-members must not appear here.
    const { data } = await applyMemberVisibility(
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${query}%`)
        .in('member_type', [...SUGGESTABLE_MEMBER_TYPES]),
    ).limit(6);
    const rows = (data as MentionSuggestion[]) ?? [];
    setSuggestions(rows);
    setShowSuggestions(rows.length > 0);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const cursor = e.target.selectionStart ?? 0;
    const q = extractMentionQuery(e.target.value, cursor);
    if (q !== null) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(q), 200);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  const pickSuggestion = (name: string | null) => {
    if (!name) return;
    const cursor = ref.current?.selectionStart ?? value.length;
    const { newText, newCursor } = insertMention(value, cursor, name);
    onChange(newText);
    setShowSuggestions(false);
    setTimeout(() => {
      ref.current?.setSelectionRange(newCursor, newCursor);
      ref.current?.focus();
    }, 0);
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
        className={cn('resize-none', className)}
        rows={rows}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          data-testid="mention-suggestions"
          className="absolute z-50 top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg overflow-hidden"
        >
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid="mention-suggestion"
              onMouseDown={() => pickSuggestion(s.full_name)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
            >
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={s.avatar_url ?? undefined} />
                <AvatarFallback
                  className="text-[10px] font-semibold"
                  style={getInitialsAvatarStyle(s.id, { businessPortal: mentionAvatarBusiness })}
                >
                  {initials(s.full_name)}
                </AvatarFallback>
              </Avatar>
              <span>{s.full_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MentionTextarea;
