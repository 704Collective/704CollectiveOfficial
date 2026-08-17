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

  // Fetch existing attendees (canonical attendance_credentials) so we can
  // exclude them from search results. Keyed by lower-cased email since the
  // search list is profiles while credentials are keyed by people rows.
  const { data: existingAttendeeEmails } = useQuery({
    queryKey: ['event-credentials', eventId],
    queryFn: async () => {
      const { data: creds } = await supabase
        .from('attendance_credentials')
        .select('person_id')
        .eq('event_id', eventId)
        .eq('status', 'active');
      const personIds = [...new Set((creds || []).map((c) => c.person_id).filter(Boolean))];
      if (personIds.length === 0) return new Set<string>();
      const { data: people } = await supabase
        .from('people')
        .select('id, email_lower')
        .in('id', personIds);
      return new Set((people || []).map((p) => p.email_lower).filter(Boolean) as string[]);
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

  const filteredMembers = members.filter(
    (m) => !(m.email && existingAttendeeEmails?.has(m.email.toLowerCase())),
  );

  const makeCredentialToken = () => {
    const tokenBytes = new Uint8Array(8);
    crypto.getRandomValues(tokenBytes);
    return 'C-' + Array.from(tokenBytes)
      .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10).toUpperCase();
  };

  type AddResult = { added: number; skippedExisting: number; missingMembers: string[] };

  // Writes canonical attendance_credentials (mirroring create-member-rsvp's
  // shape) instead of the legacy tickets table.
  const addMutation = useMutation({
    mutationFn: async (input: { profileIds?: string[]; guestEmails?: string[] }): Promise<AddResult> => {
      // Resolve targets to { email, name }. A selected member also carries their
      // profile id, which IS their auth user id: that is what lets a people row
      // created here be born linked instead of needing a backfill later. The
      // membership columns come along so a row minted for an active member is
      // stamped a member, matching the backend resolver's promotion rule.
      type Target = {
        email: string;
        name: string | null;
        isMember: boolean;
        profileId?: string;
        isActiveMember?: boolean;
        memberTier?: string;
      };
      const targets: Target[] = [];
      if (input.profileIds?.length) {
        const { data: profs, error: profErr } = await supabase
          .from('profiles')
          .select('id, email, full_name, member_type, subscription_status, membership_override')
          .in('id', input.profileIds);
        if (profErr) throw profErr;
        for (const p of (profs || [])) {
          if (!p.email) continue;
          const isActiveMember =
            p.subscription_status === 'active' ||
            p.subscription_status === 'trialing' ||
            p.membership_override === true;
          targets.push({
            email: p.email.toLowerCase(),
            name: p.full_name,
            isMember: true,
            profileId: p.id,
            isActiveMember,
            memberTier: p.member_type === 'business' ? 'business' : 'social',
          });
        }
      }
      for (const e of (input.guestEmails || [])) {
        targets.push({ email: e.toLowerCase(), name: null, isMember: false });
      }
      if (targets.length === 0) throw new Error('No valid recipients to add');

      // Resolve people rows by lower-cased email.
      const emails = [...new Set(targets.map((t) => t.email))];
      const { data: peopleRows, error: pplErr } = await supabase
        .from('people')
        .select('id, email, email_lower')
        .in('email_lower', emails);
      if (pplErr) throw pplErr;
      const personByEmail: Record<string, string> = {};
      for (const p of (peopleRows || [])) {
        const key = p.email_lower || p.email?.toLowerCase();
        if (key) personByEmail[key] = p.id;
      }

      // A member without a people row used to be reported as a failure and skipped.
      // Now the row is created here, BORN LINKED: auth_user_id carries the member's
      // profile id and the mirror trigger fills metadata.profile_id, so the row is
      // findable by the resolver from the first second of its life. Member fields
      // follow the same rule the backend resolver uses - an actually-paying profile
      // becomes a member row, anyone lapsed stays a guest. The source string is the
      // one this dialog has always written; it is allowlisted in the RSVP-opening
      // gate, so an admin add still works during a locked window.
      const missingMembers: string[] = [];
      const membersToCreate = targets.filter(
        (t) => t.isMember && t.profileId && !personByEmail[t.email],
      );
      if (membersToCreate.length > 0) {
        const rows = membersToCreate.map((m) => ({
          email: m.email,
          full_name: m.name || m.email.split('@')[0],
          auth_user_id: m.profileId,
          roles: m.isActiveMember ? ['member'] : ['guest'],
          ...(m.isActiveMember
            ? { member_tier: m.memberTier, member_status: 'active' }
            : {}),
          metadata: { source: 'admin_add_members_dialog' },
        }));
        const { data: bornLinked, error: memberCreateErr } = await supabase
          .from('people')
          .insert(rows)
          .select('id, email, email_lower');
        if (memberCreateErr) {
          // Never fail the batch over this: report the misses exactly as before.
          console.error('[AddMembersToEventDialog] born-linked member insert failed', memberCreateErr);
          missingMembers.push(...membersToCreate.map((m) => m.email));
        } else {
          for (const p of (bornLinked || [])) {
            const key = p.email_lower || p.email?.toLowerCase();
            if (key) personByEmail[key] = p.id;
          }
          missingMembers.push(
            ...membersToCreate.filter((m) => !personByEmail[m.email]).map((m) => m.email),
          );
        }
      }
      // Pasted guests without a people row get one created first.
      const guestsToCreate = targets.filter((t) => !t.isMember && !personByEmail[t.email]);
      if (guestsToCreate.length > 0) {
        const rows = guestsToCreate.map((g) => ({
          email: g.email,
          full_name: g.name || g.email.split('@')[0],
          roles: ['guest'],
          metadata: { source: 'admin_add_members_dialog' },
        }));
        const { data: created, error: createErr } = await supabase
          .from('people')
          .insert(rows)
          .select('id, email, email_lower');
        if (createErr) throw createErr;
        for (const p of (created || [])) {
          const key = p.email_lower || p.email?.toLowerCase();
          if (key) personByEmail[key] = p.id;
        }
        if ((created || []).length === 0) {
          throw new Error('People inserts returned zero rows despite no error - RLS may have silently blocked the write.');
        }
      }

      // Dedupe: skip anyone already holding an active credential for this event.
      const { data: existing, error: exErr } = await supabase
        .from('attendance_credentials')
        .select('person_id')
        .eq('event_id', eventId)
        .eq('status', 'active');
      if (exErr) throw exErr;
      const existingPersons = new Set((existing || []).map((r) => r.person_id));

      const seenPersons = new Set<string>();
      let skippedExisting = 0;
      const inserts: Record<string, unknown>[] = [];
      for (const t of targets) {
        const personId = personByEmail[t.email];
        if (!personId) continue;
        if (existingPersons.has(personId)) { skippedExisting += 1; continue; }
        if (seenPersons.has(personId)) continue;
        seenPersons.add(personId);
        inserts.push({
          id: crypto.randomUUID(),
          token: makeCredentialToken(),
          person_id: personId,
          event_id: eventId,
          credential_type: 'member_rsvp',
          status: 'active',
          metadata: { source: 'admin_add_members_dialog' },
        });
      }

      if (inserts.length === 0) {
        return { added: 0, skippedExisting, missingMembers };
      }

      // Capacity pre-check before inserting - abort entirely rather than
      // partially fill the event (the DB trigger remains the atomic guard).
      // Direct table count, NOT the get_event_attendance_count RPC - it
      // returns 0 for some callers (same pattern as commit fd862cc).
      const { data: eventRow, error: capErr } = await supabase
        .from('events')
        .select('capacity')
        .eq('id', eventId)
        .single();
      if (capErr) throw capErr;
      const capacity = eventRow?.capacity as number | null;
      if (capacity != null) {
        const { count, error: cntErr } = await supabase
          .from('attendance_credentials')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .in('status', ['active', 'used']);
        if (cntErr) throw cntErr;
        const current = count ?? 0;
        if (current + inserts.length > capacity) {
          toast.error(`Only ${Math.max(0, capacity - current)} spot(s) left — you selected ${inserts.length}.`);
          throw new Error('CAPACITY_PRECHECK_ABORT');
        }
      }

      // Insert, then verify the rows actually came back (RLS can silently
      // block writes without raising an error - never report success on zero rows).
      const { data: insertedRows, error: insErr } = await supabase
        .from('attendance_credentials')
        .insert(inserts)
        .select('id');
      if (insErr) throw insErr;
      const added = (insertedRows || []).length;
      if (added === 0) {
        throw new Error('Credential inserts returned zero rows despite no error - RLS may have silently blocked the write. No attendees were added.');
      }
      if (added < inserts.length) {
        toast.warning(`Only ${added} of ${inserts.length} credentials were created - verify the attendee list.`);
      }
      return { added, skippedExisting, missingMembers };
    },
    onSuccess: (result) => {
      if (result.added > 0) {
        toast.success(`Added ${result.added} ${result.added !== 1 ? 'people' : 'person'} to event`);
      }
      if (result.skippedExisting > 0) {
        toast.info(`${result.skippedExisting} already on the event - skipped`);
      }
      if (result.missingMembers.length > 0) {
        toast.error(`No people record found for: ${result.missingMembers.join(', ')}`);
      }
      if (result.added === 0 && result.skippedExisting === 0 && result.missingMembers.length === 0) {
        toast.error('Nothing was added');
      }
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['event-credentials', eventId] });
      handleClose();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // Pre-check already showed its own toast - nothing more to report.
      if (message.includes('CAPACITY_PRECHECK_ABORT')) return;
      console.error('[AddMembersToEventDialog] Insert failed', error);
      if (message.includes('EVENT_AT_CAPACITY')) {
        toast.error('Event is at capacity — no members were added.');
      } else if (message.includes('duplicate key') || message.includes('23505')) {
        toast.error('Some of these members are already on the event');
      } else if (message.includes('row-level security') || message.includes('42501')) {
        toast.error('Permission denied. Check admin role.');
      } else if (message.includes('violates') || message.includes('column')) {
        toast.error(`Schema mismatch: ${message}`);
      } else {
        toast.error(`Failed to add members: ${message}`);
      }
    },
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
    addMutation.mutate({ profileIds: Array.from(selectedIds) });
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
    addMutation.mutate({ guestEmails: unique });
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
                      <p className="text-sm font-medium truncate">{member.full_name || '-'}</p>
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