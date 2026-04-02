'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Users, Mail, X, UserPlus, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { getInitialsAvatarStyle } from '@/lib/avatarInitialsColor';
import { MemberStatusDotLabel, resolveSubscriptionVisualKind } from '@/lib/memberSubscriptionStatus';

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  subscription_status: string | null;
}

interface AddMembersToEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventTitle: string;
}

export function AddMembersToEventDialog({
  open,
  onOpenChange,
  eventId,
  eventTitle,
}: AddMembersToEventDialogProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pasteEmails, setPasteEmails] = useState('');
  const [tab, setTab] = useState<'search' | 'paste'>('search');

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch existing ticket holders so we can exclude them
  const { data: existingTickets } = useQuery({
    queryKey: ['event-tickets', eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from('tickets')
        .select('user_id')
        .eq('event_id', eventId)
        .in('status', ['confirmed', 'rsvp']);
      return new Set((data || []).map((t) => t.user_id).filter(Boolean));
    },
    enabled: open,
  });

  // Search members
  const { data: members = [], isLoading: searchLoading } = useQuery({
    queryKey: ['member-search', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch.trim()) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, subscription_status')
        .is('deleted_at', null)
        .or(
          `full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`
        )
        .limit(20);
      if (error) throw error;
      return (data || []) as Member[];
    },
    enabled: open && debouncedSearch.trim().length > 0,
  });

  const filteredMembers = members.filter((m) => !existingTickets?.has(m.id));

  const addMutation = useMutation({
    mutationFn: async (tickets: { event_id: string; user_id?: string; email?: string; status: string }[]) => {
      const { error } = await supabase.from('tickets').insert(tickets);
      if (error) throw error;
    },
    onSuccess: (_, tickets) => {
      toast.success(`Added ${tickets.length} member${tickets.length !== 1 ? 's' : ''} to event`);
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['event-tickets', eventId] });
      handleClose();
    },
    onError: () => toast.error('Failed to add members to event'),
  });

  const handleClose = () => {
    setSearchQuery('');
    setSelectedIds(new Set());
    setPasteEmails('');
    setTab('search');
    onOpenChange(false);
  };

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSearchSubmit = () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one member');
      return;
    }
    const tickets = Array.from(selectedIds).map((userId) => ({
      event_id: eventId,
      user_id: userId,
      status: 'confirmed',
    }));
    addMutation.mutate(tickets);
  };

  const handlePasteSubmit = () => {
    const rawEmails = pasteEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));

    const unique = [...new Set(rawEmails)];
    if (unique.length === 0) {
      toast.error('No valid email addresses found');
      return;
    }

    const tickets = unique.map((email) => ({
      event_id: eventId,
      email,
      status: 'confirmed',
    }));
    addMutation.mutate(tickets);
  };

  const getInitials = (name: string | null, email: string | null) => {
    if (name) return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
    if (email) return email[0].toUpperCase();
    return '?';
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add Members to Event
          </DialogTitle>
          <DialogDescription className="truncate">
            {eventTitle}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'search' | 'paste')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="search" className="flex-1 gap-2">
              <Users className="w-4 h-4" /> Search Members
            </TabsTrigger>
            <TabsTrigger value="paste" className="flex-1 gap-2">
              <Mail className="w-4 h-4" /> Paste Emails
            </TabsTrigger>
          </TabsList>

          {/* Search Tab */}
          <TabsContent value="search" className="flex-1 flex flex-col min-h-0 mt-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setSelectedIds(new Set())}
                >
                  <X className="w-3 h-3 mr-1" /> Clear
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px]">
              {searchLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {!searchLoading && debouncedSearch && filteredMembers.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No members found matching &quot;{debouncedSearch}&quot;
                </div>
              )}

              {!searchLoading && !debouncedSearch && (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Start typing to search members
                </div>
              )}

              {filteredMembers.map((member) => {
                const isSelected = selectedIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => toggleSelect(member.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(member.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Avatar className="w-8 h-8 shrink-0">
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback className="text-xs font-semibold" style={getInitialsAvatarStyle(member.id)}>
                        {getInitials(member.full_name, member.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    <div className="shrink-0">
                      <MemberStatusDotLabel
                        kind={resolveSubscriptionVisualKind(member.subscription_status, { deletedAt: null })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* Paste Tab */}
          <TabsContent value="paste" className="flex-1 flex flex-col min-h-0 mt-3 gap-3">
            <p className="text-sm text-muted-foreground">
              Paste email addresses separated by commas, semicolons, or new lines.
            </p>
            <Textarea
              placeholder={`john@example.com\njane@example.com\nor john@example.com, jane@example.com`}
              value={pasteEmails}
              onChange={(e) => setPasteEmails(e.target.value)}
              className="flex-1 min-h-[200px] font-mono text-sm resize-none"
              autoFocus
            />
            {pasteEmails.trim() && (
              <p className="text-xs text-muted-foreground">
                {pasteEmails.split(/[\n,;]+/).map((e) => e.trim()).filter((e) => e.includes('@')).length} valid email(s) detected
              </p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose} disabled={addMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={tab === 'search' ? handleSearchSubmit : handlePasteSubmit}
            disabled={
              addMutation.isPending ||
              (tab === 'search' && selectedIds.size === 0) ||
              (tab === 'paste' && !pasteEmails.trim())
            }
          >
            {addMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding...</>
            ) : (
              <><UserPlus className="w-4 h-4 mr-2" />Add to Event</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}