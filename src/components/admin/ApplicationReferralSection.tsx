'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, Check, Search, UserCheck, X } from 'lucide-react';
import { isNoReferrerName } from '@/lib/referralRules';

export interface ReferralApplication {
  id: string;
  referrer_name: string | null;
  referral_code: string | null;
  ambassador_id: string | null;
  matched_referrer_profile_id: string | null;
  confirmed_referrer_profile_id: string | null;
}

interface BusinessMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** Active business members are the only people who can be credited a referral. */
async function fetchActiveBusinessMembers(): Promise<BusinessMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('member_type', 'business')
    .eq('subscription_status', 'active')
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as BusinessMember[];
}

async function fetchAmbassador(ambassadorId: string) {
  const { data } = await supabase
    .from('ambassadors')
    .select('id, full_name, referral_code')
    .eq('id', ambassadorId)
    .maybeSingle();
  return data as { id: string; full_name: string; referral_code: string } | null;
}

/**
 * The referral panel in the application review dialog.
 *
 * Shows what the applicant typed, what the server matched, and lets the reviewer
 * either confirm that match or correct it from a searchable list of active
 * business members. Only the reviewer's confirmed choice is paid on: the
 * auto-match is a suggestion and is never treated as a decision.
 */
export function ApplicationReferralSection({
  application,
  onChanged,
}: {
  application: ReferralApplication;
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const typedName = application.referrer_name;
  const saidNo = isNoReferrerName(typedName);
  const isAmbassadorReferral = !!application.ambassador_id;

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['active-business-members'],
    queryFn: fetchActiveBusinessMembers,
    staleTime: 5 * 60 * 1000,
    enabled: !isAmbassadorReferral,
  });

  const { data: ambassador } = useQuery({
    queryKey: ['application-ambassador', application.ambassador_id],
    queryFn: () => fetchAmbassador(application.ambassador_id!),
    enabled: isAmbassadorReferral,
    staleTime: 5 * 60 * 1000,
  });

  const byId = useMemo(() => {
    const map = new Map<string, BusinessMember>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);

  const matched = application.matched_referrer_profile_id
    ? byId.get(application.matched_referrer_profile_id) ?? null
    : null;
  const confirmed = application.confirmed_referrer_profile_id
    ? byId.get(application.confirmed_referrer_profile_id) ?? null
    : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members.slice(0, 50);
    return members
      .filter(
        (m) =>
          (m.full_name ?? '').toLowerCase().includes(q) ||
          (m.email ?? '').toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [members, search]);

  const setReferrer = useMutation({
    mutationFn: async (profileId: string | null) => {
      const { error } = await supabase
        .from('business_applications')
        .update({ confirmed_referrer_profile_id: profileId })
        .eq('id', application.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Referrer updated');
      setPickerOpen(false);
      setSearch('');
      queryClient.invalidateQueries({ queryKey: ['admin-applications'] });
      onChanged?.();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update referrer'),
  });

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Referral</p>

      {/* What the applicant typed */}
      <div className="text-sm">
        <span className="text-muted-foreground">They were asked who referred them, and answered: </span>
        <span className="font-medium text-foreground">
          {typedName?.trim() ? `"${typedName}"` : '(no answer recorded)'}
        </span>
      </div>

      {isAmbassadorReferral ? (
        /* Ambassador code path: the code is the source, no member picker. */
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 space-y-0.5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Ambassador referral</p>
          <p className="text-sm font-medium text-primary">
            {ambassador?.full_name ?? 'Ambassador'}
            {application.referral_code ? ` · ${application.referral_code}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Paid through the ambassador program on approval. No member referrer applies.
          </p>
        </div>
      ) : saidNo ? (
        <p className="text-sm text-muted-foreground">
          No referrer. Nothing will be credited.
        </p>
      ) : (
        <>
          {/* Auto-match result */}
          {confirmed ? (
            <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
              <div className="flex items-start gap-2">
                <UserCheck className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Confirmed referrer</p>
                  <p className="text-sm font-medium text-foreground truncate">{confirmed.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{confirmed.email}</p>
                </div>
              </div>
            </div>
          ) : matched ? (
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Auto-matched, not yet confirmed</p>
              <p className="text-sm font-medium text-foreground truncate">{matched.full_name}</p>
              <p className="text-xs text-muted-foreground truncate">{matched.email}</p>
            </div>
          ) : (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-200/90">
                No active business member matches this name. Pick the right member below, or
                leave it empty to credit nobody.
              </p>
            </div>
          )}

          {/* Confirm or correct */}
          <div className="flex flex-wrap gap-2">
            {matched && !confirmed && (
              <Button
                size="sm"
                variant="outline"
                disabled={setReferrer.isPending}
                onClick={() => setReferrer.mutate(application.matched_referrer_profile_id)}
              >
                <Check className="w-4 h-4 mr-1" />
                Confirm {matched.full_name}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={setReferrer.isPending}
              onClick={() => setPickerOpen((v) => !v)}
            >
              <Search className="w-4 h-4 mr-1" />
              {confirmed ? 'Change referrer' : 'Choose a different member'}
            </Button>
            {confirmed && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={setReferrer.isPending}
                onClick={() => setReferrer.mutate(null)}
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          {/* Searchable picker */}
          {pickerOpen && (
            <div className="rounded-md border border-border bg-background p-2 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search active business members..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-border">
                {membersLoading ? (
                  <p className="text-sm text-muted-foreground py-3 px-1">Loading members...</p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-3 px-1">No matching business members.</p>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left px-2 py-2 hover:bg-muted/60 transition-colors"
                      disabled={setReferrer.isPending}
                      onClick={() => setReferrer.mutate(m.id)}
                    >
                      <p className="text-sm text-foreground">{m.full_name ?? '(no name)'}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            $250 is credited to the confirmed referrer when this member&apos;s second payment
            clears. Approving without a confirmed referrer credits nobody.
          </p>
        </>
      )}
    </div>
  );
}
