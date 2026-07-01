'use client';

import { useRef, useState, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { cn } from '@/lib/utils';

interface Mentionable { id: string; full_name: string | null; avatar_url: string | null; }

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function extractMentionQuery(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos);
  const match = before.match(/@([\w ]*)$/);
  return match ? match[1] : null;
}
function insertMention(text: string, cursorPos: number, fullName: string): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);
  const match = before.match(/@([\w ]*)$/);
  if (!match) return { newText: text, newCursor: cursorPos };
  const replaced = before.slice(0, before.length - match[0].length) + `@${fullName} `;
  return { newText: replaced + after, newCursor: replaced.length };
}

// Textarea with @mention autocomplete scoped to THIS event's eligible members
// (calls search_event_discussion_mentionables — the 19 who can enter).
export function EventMentionTextarea({
  eventId,
  value,
  onChange,
  placeholder,
  className,
  rows = 3,
  onSubmit,
}: {
  eventId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  onSubmit?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [suggestions, setSuggestions] = useState<Mentionable[]>([]);
  const [show, setShow] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    const { data, error } = await supabase.rpc('search_event_discussion_mentionables', {
      p_event_id: eventId,
      p_query: query,
    });
    if (error) { setSuggestions([]); setShow(false); return; }
    const rows = (data as Mentionable[]) ?? [];
    setSuggestions(rows);
    setShow(rows.length > 0);
  }, [eventId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const cursor = e.target.selectionStart ?? 0;
    const q = extractMentionQuery(e.target.value, cursor);
    if (q !== null) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(q), 200);
    } else {
      setShow(false);
    }
  };

  const pick = (name: string | null) => {
    if (!name) return;
    const cursor = ref.current?.selectionStart ?? value.length;
    const { newText, newCursor } = insertMention(value, cursor, name);
    onChange(newText);
    setShow(false);
    setTimeout(() => { ref.current?.setSelectionRange(newCursor, newCursor); ref.current?.focus(); }, 0);
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit(); }
          if (e.key === 'Escape') setShow(false);
        }}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        placeholder={placeholder}
        className={cn('resize-none', className)}
        rows={rows}
      />
      {show && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => pick(s.full_name)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left"
            >
              <Avatar className="w-6 h-6 shrink-0">
                <AvatarImage src={s.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px] font-semibold" style={getInitialsAvatarStyle(s.id)}>
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
