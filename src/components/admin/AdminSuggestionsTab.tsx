'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft, Lightbulb, ChevronLeft, ChevronRight, Trash2, Circle, CheckCircle2,
} from 'lucide-react';

interface Suggestion {
  id: string;
  created_at: string;
  profile_id: string | null;
  email: string | null;
  full_name: string | null;
  suggestion: string;
  is_read: boolean;
  read_at: string | null;
  profiles?: { full_name: string | null; email: string } | null;
}

const PAGE_SIZE = 20;

async function fetchSuggestions(page: number, unreadOnly: boolean) {
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  let query = supabase
    .from('event_suggestions')
    .select('*, profiles(full_name, email)', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error, count } = await query.range(start, end);
  if (error) throw error;
  return { suggestions: (data ?? []) as Suggestion[], totalCount: count ?? 0 };
}

interface AdminSuggestionsTabProps {
  onNavigateToDashboard: () => void;
}

export function AdminSuggestionsTab({ onNavigateToDashboard }: AdminSuggestionsTabProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const isSuperAdmin = (profile as any)?.role === 'super_admin';

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-suggestions'] });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-suggestions', page, unreadOnly],
    queryFn: () => fetchSuggestions(page, unreadOnly),
    staleTime: 30 * 1000,
  });

  const suggestions = data?.suggestions ?? [];
  const totalCount = data?.totalCount ?? 0;
  const unreadCount = suggestions.filter(s => !s.is_read).length;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_suggestions')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Failed to mark as read'),
  });

  const markUnreadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_suggestions')
        .update({ is_read: false, read_at: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Failed to mark as unread'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_suggestions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Suggestion deleted'); invalidate(); },
    onError: () => toast.error('Failed to delete suggestion'),
  });

  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onNavigateToDashboard}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-xl font-semibold">Event Suggestions</h2>
        {unreadCount > 0 && (
          <Badge className="bg-primary/20 text-primary text-xs">{unreadCount} unread</Badge>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Button
          variant={unreadOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setUnreadOnly(!unreadOnly); setPage(1); }}
        >
          {unreadOnly ? 'Showing unread' : 'All suggestions'}
        </Button>
        <p className="text-sm text-muted-foreground">{totalCount} total</p>
      </div>

      {isError ? (
        <div className="text-center py-12">
          <p className="text-sm text-destructive mb-2">Failed to load suggestions.</p>
          <Button variant="outline" size="sm" onClick={invalidate}>Retry</Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-16">
          <Lightbulb className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground mb-1">No suggestions yet</h3>
          <p className="text-sm text-muted-foreground">
            Members can submit event ideas from their portal.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {suggestions.map(s => {
              const submitterName = s.profiles?.full_name ?? s.full_name ?? s.profiles?.email ?? s.email ?? 'Unknown member';
              return (
                <div
                  key={s.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    s.is_read ? 'border-border bg-card' : 'border-primary/30 bg-primary/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {!s.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{submitterName}</span>
                          {' · '}
                          {format(new Date(s.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">{s.suggestion}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Mark read / unread — all admins */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={s.is_read ? 'Mark unread' : 'Mark read'}
                        onClick={() => s.is_read
                          ? markUnreadMutation.mutate(s.id)
                          : markReadMutation.mutate(s.id)
                        }
                      >
                        {s.is_read
                          ? <Circle className="w-4 h-4 text-muted-foreground" />
                          : <CheckCircle2 className="w-4 h-4 text-primary" />
                        }
                      </Button>

                      {/* Delete — super admin only */}
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => deleteMutation.mutate(s.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p-1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" />Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page*PAGE_SIZE >= totalCount} onClick={() => setPage(p => p+1)}>
                  Next<ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}